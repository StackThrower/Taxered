/**
 * HTTP API of the chat, mounted on the SSR Express server (and so in the Vercel function):
 *
 * POST   /api/chat/threads/:threadId/files                 file body (may be gzip-encoded),
 *                                                          name in `X-File-Name`
 * POST   /api/chat/threads/:threadId/messages              { text, fileIds } → text/event-stream
 * GET    /api/chat/threads/:threadId/outputs/:outputId     a generated file
 * DELETE /api/chat/threads/:threadId                       forget the thread and its files
 *
 * Nothing is kept in the process between requests: each one loads the thread from the store.
 */
import {
  HumanMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type BaseMessage,
} from '@langchain/core/messages';
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
import { Session, describeFiles, isThreadId, uploadFile } from './session';
import type { ThreadStore } from './store/thread-store';

/** Messages per client address and window, to keep the model bill bounded. */
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const SUPERVISOR_RECURSION_LIMIT = 60;
/** Comment lines keep proxies from closing the stream while the agent thinks. */
const HEARTBEAT_MS = 15_000;
/** Default answer time limit; Vercel stops the function at its `maxDuration` (300 s). */
export const DEFAULT_MAX_RUN_MS = 280_000;

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
  /** The agent, or null when the chat cannot run; `unavailable` then says why. */
  agent: TaxeredAgent | null;
  unavailable?: string;
  store: ThreadStore;
  /** An answer taking longer is stopped, so it can end cleanly before the platform kills it. */
  maxRunMs?: number;
}

export function chatRouter({
  agent,
  unavailable = 'Агент не налаштований: на сервері не задано ANTHROPIC_API_KEY.',
  store,
  maxRunMs = DEFAULT_MAX_RUN_MS,
}: ChatRouterOptions): Router {
  const router = express.Router();

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
    // `inflate` decodes `Content-Encoding: gzip`: the browser compresses files so they fit
    // the 4.5 MB request limit of Vercel functions. The limit here is the decoded size.
    express.raw({ type: () => true, limit: MAX_FILE_BYTES, inflate: true }),
    async (req, res) => {
      const name = fileName(req);
      if (!name || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Порожній файл або немає назви.' });
        return;
      }
      try {
        const file = await uploadFile(
          store,
          String(req.params['threadId']),
          name,
          decodeText(req.body),
        );
        res.status(201).json(file);
      } catch (error) {
        res.status(400).json({ error: errorText(error) });
      }
    },
  );

  router.get('/threads/:threadId/outputs/:outputId', async (req, res) => {
    const output = await store.getOutput(
      String(req.params['threadId']),
      String(req.params['outputId']),
    );
    if (!output) {
      res.status(404).json({ error: 'Файл не знайдено або розмова застаріла.' });
      return;
    }
    res
      .type(output.meta.mime)
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiName(output.meta.name)}"; filename*=UTF-8''${encodeURIComponent(output.meta.name)}`,
      )
      .send(Buffer.from(output.bytes));
  });

  router.delete('/threads/:threadId', async (req, res) => {
    await store.deleteThread(String(req.params['threadId']));
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
        res.status(503).json({ error: unavailable });
        return;
      }
      if ((await store.hit(clientAddress(req), RATE_WINDOW_MS)) > RATE_LIMIT) {
        res.status(429).json({ error: 'Забагато повідомлень. Спробуйте пізніше.' });
        return;
      }
      if (!(await store.lock(threadId, maxRunMs + 60_000))) {
        res.status(409).json({ error: 'Агент ще відповідає на попереднє повідомлення.' });
        return;
      }

      const closed = new AbortController();
      res.on('close', () => closed.abort());
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });
      const write = (chunk: string) => {
        if (!res.writableEnded) {
          res.write(chunk);
        }
      };
      const send = (event: ChatStreamEvent) => write(`data: ${JSON.stringify(event)}\n\n`);
      const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
      const deadline = AbortSignal.timeout(maxRunMs);

      try {
        const session = await Session.open(store, threadId);
        await store.touch(threadId);
        const attached = fileIds.flatMap((id) => {
          const file = session.files.get(id);
          return file ? [file] : [];
        });
        const content =
          (text || 'Я завантажив файли. Що з ними можна зробити?') +
          (attached.length > 0 ? `\n\n[Прикріплені файли]\n${describeFiles(attached)}` : '');

        let conversation: BaseMessage[] | null = null;
        try {
          const events = agent.streamEvents(
            {
              messages: [
                ...mapStoredMessagesToChatMessages(session.messages),
                new HumanMessage(content),
              ],
            },
            {
              version: 'v2',
              configurable: { thread_id: threadId, session },
              recursionLimit: SUPERVISOR_RECURSION_LIMIT,
              signal: AbortSignal.any([closed.signal, deadline]),
            },
          );
          for await (const event of events) {
            conversation = finalMessages(event) ?? conversation;
            const out = toChatEvent(event);
            if (out) {
              send(out);
            }
          }
        } finally {
          // Ф1 positions and analyses are kept even if the answer broke off; the
          // conversation only grows by complete turns.
          if (conversation) {
            session.messages = mapChatMessagesToStoredMessages(conversation);
          }
          await session.save();
        }
        send({ type: 'done' });
      } catch (error) {
        if (!closed.signal.aborted) {
          console.error('Chat agent failed:', error);
          send({
            type: 'error',
            message: deadline.aborted
              ? 'Відповідь зайняла забагато часу й була зупинена. Спробуйте розбити запит на менші.'
              : userMessage(error),
          });
        }
      } finally {
        clearInterval(heartbeat);
        await store.unlock(threadId).catch(() => undefined);
        res.end();
      }
    },
  );

  return router;
}

const SUPERVISOR_TAG = roleTag('supervisor');
const SUPERVISOR_NAME = 'taxered_supervisor';
const AGENT_BY_TOOL = new Map(
  (Object.keys(AGENT_LABELS) as AgentName[]).map((name) => [`ask_${name}_agent`, name]),
);

/** The whole conversation, from the end event of the supervisor's run. */
function finalMessages(event: StreamEvent): BaseMessage[] | null {
  if (
    event.event === 'on_chain_end' &&
    event.name === SUPERVISOR_NAME &&
    // v2 events carry `parent_ids`; the root run has none.
    ((event as { parent_ids?: string[] }).parent_ids?.length ?? 0) === 0
  ) {
    const messages: unknown = event.data['output']?.messages;
    return Array.isArray(messages) ? (messages as BaseMessage[]) : null;
  }
  return null;
}

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

/** Vercel sets X-Real-IP to the client address (and overwrites any sent by the client). */
function clientAddress(req: Request): string {
  return req.header('X-Real-IP') || req.ip || 'unknown';
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
