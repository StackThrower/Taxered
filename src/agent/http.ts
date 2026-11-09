/**
 * HTTP API of the chat, mounted on the SSR Express server:
 *
 * POST   /api/chat/threads/:threadId/files                 raw file body, `X-File-Name` header
 * POST   /api/chat/threads/:threadId/messages              { text, fileIds } → text/event-stream
 * GET    /api/chat/threads/:threadId/outputs/:outputId     a generated file
 * DELETE /api/chat/threads/:threadId                       forget the thread and its files
 */
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import express, { type Request, type Response, type Router } from 'express';
import {
  AGENT_LABELS,
  MAX_FILE_BYTES,
  MAX_MESSAGE_CHARS,
  type AgentName,
  type ChatArtifact,
  type ChatStreamEvent,
} from '../app/chat/protocol';
import { ARTIFACT_EVENT, errorText } from './context';
import { messageText, type TaxeredAgent } from './graph';
import { roleTag } from './model';
import {
  addFile,
  deleteSession,
  describeFiles,
  getSession,
  isThreadId,
  onSessionEvicted,
} from './session';

/** Messages per client address and window, to keep the model bill bounded. */
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const SUPERVISOR_RECURSION_LIMIT = 60;

const TOOL_STATUS: Record<string, string> = {
  import_broker_reports: 'Читаю звіти брокера й курси НБУ',
  add_manual_position: 'Додаю операцію',
  remove_positions: 'Оновлюю позиції',
  calculate_f1: 'Розраховую Ф1',
  export_f1_documents: 'Формую файли декларації',
  analyze_returns: 'Аналізую виписки й інфляцію',
  export_returns_table: 'Формую таблицю',
  get_country_tax_rates: 'Шукаю ставки',
  rank_countries: 'Порівнюю країни',
  show_tax_map: 'Будую карту',
  compare_net_income: 'Рахую дохід після податку',
  analyze_spreads_and_fees: 'Рахую спреди й комісії',
  export_spreads_report: 'Формую звіт',
  analyze_portfolio: 'Відновлюю портфель',
  export_portfolio: 'Формую звіт',
  list_uploaded_files: 'Переглядаю файли',
};

export interface ChatRouterOptions {
  /** The agent, or null when no model is configured. */
  agent: TaxeredAgent | null;
  /** Forget a thread's conversation when its session expires. */
  forgetThread?: (threadId: string) => Promise<void> | void;
  now?: () => number;
}

export function chatRouter({ agent, forgetThread, now = Date.now }: ChatRouterOptions): Router {
  const router = express.Router();
  const busy = new Set<string>();
  const hits = new Map<string, number[]>();

  if (forgetThread) {
    onSessionEvicted((id) => void forgetThread(id));
  }

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    next();
  });

  router.param('threadId', (_req, res, next, id: string) => {
    if (!isThreadId(id)) {
      res.status(400).json({ error: 'Невірний ідентифікатор розмови.' });
      return;
    }
    next();
  });

  router.post(
    '/threads/:threadId/files',
    express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
    (req, res) => {
      const name = fileName(req);
      if (!name || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Порожній файл або немає назви.' });
        return;
      }
      try {
        const session = getSession(String(req.params['threadId']), now());
        const { content: _content, ...file } = addFile(session, name, decodeText(req.body));
        res.status(201).json(file);
      } catch (error) {
        res.status(400).json({ error: errorText(error) });
      }
    },
  );

  router.get('/threads/:threadId/outputs/:outputId', (req, res) => {
    const session = getSession(String(req.params['threadId']), now());
    const output = session.outputs.get(String(req.params['outputId']));
    if (!output) {
      res.status(404).json({ error: 'Файл не знайдено або розмова застаріла.' });
      return;
    }
    res
      .type(output.mime)
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiName(output.name)}"; filename*=UTF-8''${encodeURIComponent(output.name)}`,
      )
      .send(Buffer.from(output.bytes));
  });

  router.delete('/threads/:threadId', async (req, res) => {
    const id = String(req.params['threadId']);
    deleteSession(id);
    await forgetThread?.(id);
    res.status(204).end();
  });

  router.post(
    '/threads/:threadId/messages',
    express.json({ limit: '64kb' }),
    async (req: Request, res: Response) => {
      const threadId = String(req.params['threadId']);
      const body = req.body as { text?: unknown; fileIds?: unknown };
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      const fileIds = Array.isArray(body?.fileIds)
        ? body.fileIds.filter((id): id is string => typeof id === 'string')
        : [];

      if (!text && fileIds.length === 0) {
        res.status(400).json({ error: 'Порожнє повідомлення.' });
        return;
      }
      if (text.length > MAX_MESSAGE_CHARS) {
        res.status(413).json({ error: `Повідомлення довше за ${MAX_MESSAGE_CHARS} символів.` });
        return;
      }
      if (!agent) {
        res.status(503).json({
          error: 'Агент не налаштований: на сервері не задано ANTHROPIC_API_KEY.',
        });
        return;
      }
      if (!allow(hits, req.ip ?? 'unknown', now())) {
        res.status(429).json({ error: 'Забагато повідомлень. Спробуйте пізніше.' });
        return;
      }
      if (busy.has(threadId)) {
        res.status(409).json({ error: 'Агент ще відповідає на попереднє повідомлення.' });
        return;
      }

      const session = getSession(threadId, now());
      const attached = fileIds.flatMap((id) => {
        const file = session.files.get(id);
        return file ? [file] : [];
      });
      const content =
        (text || 'Я завантажив файли. Що з ними можна зробити?') +
        (attached.length > 0 ? `\n\n[Прикріплені файли]\n${describeFiles(attached)}` : '');

      busy.add(threadId);
      const abort = new AbortController();
      res.on('close', () => abort.abort());
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });
      const send = (event: ChatStreamEvent) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      };

      try {
        const events = agent.streamEvents(
          { messages: [{ role: 'user', content }] },
          {
            version: 'v2',
            configurable: { thread_id: threadId },
            recursionLimit: SUPERVISOR_RECURSION_LIMIT,
            signal: abort.signal,
          },
        );
        for await (const event of events) {
          const out = toChatEvent(event);
          if (out) {
            send(out);
          }
        }
        send({ type: 'done' });
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error('Chat agent failed:', error);
          send({ type: 'error', message: userMessage(error) });
        }
      } finally {
        busy.delete(threadId);
        res.end();
      }
    },
  );

  return router;
}

const SUPERVISOR_TAG = roleTag('supervisor');
const AGENT_BY_TOOL = new Map(
  (Object.keys(AGENT_LABELS) as AgentName[]).map((name) => [`ask_${name}_agent`, name]),
);

/** Maps a LangGraph stream event to what the browser needs, or null to skip it. */
export function toChatEvent(event: StreamEvent): ChatStreamEvent | null {
  switch (event.event) {
    case 'on_chat_model_stream': {
      if (!event.tags?.includes(SUPERVISOR_TAG)) {
        return null;
      }
      const text = messageText(event.data['chunk']);
      return text ? { type: 'token', text } : null;
    }
    case 'on_chat_model_end': {
      const stop = event.data['output']?.response_metadata?.['stop_reason'];
      return stop === 'refusal'
        ? { type: 'error', message: 'Модель відмовилася відповідати на цей запит.' }
        : null;
    }
    case 'on_custom_event':
      return event.name === ARTIFACT_EVENT
        ? { type: 'artifact', artifact: event.data as ChatArtifact }
        : null;
    case 'on_tool_start': {
      const agent = AGENT_BY_TOOL.get(event.name);
      if (agent) {
        return { type: 'status', agent, text: `${AGENT_LABELS[agent]}: працюю над завданням` };
      }
      const text = TOOL_STATUS[event.name];
      return text ? { type: 'status', agent: null, text: `${text}…` } : null;
    }
    default:
      return null;
  }
}

function userMessage(error: unknown): string {
  const status = (error as { status?: unknown })?.status;
  if (status === 429 || status === 529) {
    return 'Модель перевантажена. Спробуйте ще раз за хвилину.';
  }
  if (status === 401 || status === 403) {
    return 'Помилка доступу до моделі (перевірте ANTHROPIC_API_KEY).';
  }
  return 'Не вдалося отримати відповідь агента. Спробуйте ще раз.';
}

function allow(hits: Map<string, number[]>, key: string, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function fileName(req: Request): string {
  const header = req.header('X-File-Name') ?? '';
  try {
    return decodeURIComponent(header)
      .replace(/[\\/\0\r\n]/g, '_')
      .slice(0, 200)
      .trim();
  } catch {
    return '';
  }
}

/** Broker XML may be declared windows-1251; everything else is read as UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  const prolog = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const encoding = /encoding=["']([\w-]+)["']/i.exec(prolog)?.[1]?.toLowerCase();
  const label = encoding === 'windows-1251' || encoding === 'cp1251' ? 'windows-1251' : 'utf-8';
  return new TextDecoder(label).decode(bytes).replace(/^﻿/, '');
}

function asciiName(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
}
