import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { ChatStreamEvent, FileArtifact, UploadedFile } from '../app/chat/protocol';
import { LEDGER_CSV } from './testing/fixtures';
import { buildTaxeredAgent } from './graph';
import { chatRouter, decodeText } from './http';
import { deleteSession } from './session';
import { callTool, reply, scriptedModels, type ScriptStep } from './testing/scripted-model';

/** The id of the first file mentioned in the last user message. */
function fileIdIn(messages: BaseMessage[]): string {
  const last = [...messages].reverse().find((m) => m instanceof HumanMessage);
  return /f_[0-9a-f]{8}/.exec(String(last?.content))?.[0] ?? 'missing';
}

async function serve(app: express.Express): Promise<{ base: string; server: Server }> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`, server };
}

async function readEvents(response: Response): Promise<ChatStreamEvent[]> {
  const body = await response.text();
  return body
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice(6)) as ChatStreamEvent);
}

describe('chat API with the LangGraph agent', () => {
  let server: Server | undefined;
  const threadId = randomUUID();

  afterEach(() => {
    server?.close();
    server = undefined;
    deleteSession(threadId);
  });

  async function start(scripts: Parameters<typeof scriptedModels>[0]) {
    const { models, instances } = scriptedModels(scripts);
    const memory = new MemorySaver();
    const app = express();
    app.use(
      '/api/chat',
      chatRouter({
        agent: buildTaxeredAgent(models, memory),
        forgetThread: (id) => memory.deleteThread(id),
      }),
    );
    const running = await serve(app);
    server = running.server;
    return { base: running.base, instances };
  }

  async function upload(base: string, name: string, content: string): Promise<UploadedFile> {
    const response = await fetch(`${base}/threads/${threadId}/files`, {
      method: 'POST',
      headers: { 'X-File-Name': encodeURIComponent(name) },
      body: content,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as UploadedFile;
  }

  function send(base: string, text: string, fileIds: string[] = []) {
    return fetch(`${base}/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, fileIds }),
    });
  }

  it('delegates to a sub-agent, streams its artifacts and the supervisor answer, and keeps the conversation', async () => {
    const supervisor: ScriptStep[] = [
      (messages) =>
        callTool('ask_spreads_agent', {
          task: `Порахуй спреди й комісії у файлі ${fileIdIn(messages)} і зроби Excel-звіт.`,
        }),
      reply('На спредах втрачено 47 $, звіт — нижче.'),
      reply('Будь ласка!'),
    ];
    const spreads: ScriptStep[] = [
      (messages) => callTool('analyze_spreads_and_fees', { fileId: fileIdIn(messages) }),
      callTool('export_spreads_report', {}),
      reply('Спред 47 USD на 1 обміні; звіт сформовано.'),
    ];
    const { base, instances } = await start({ supervisor, spreads });

    const file = await upload(base, 'ledger.csv', LEDGER_CSV);
    expect(file).toMatchObject({ name: 'ledger.csv', kind: 'ledger_csv' });

    const response = await send(base, 'Скільки я втратив на обмінах?', [file.id]);
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const events = await readEvents(response);

    expect(events.find((e) => e.type === 'status')).toEqual({
      type: 'status',
      agent: 'spreads',
      text: 'Спреди та комісії: працюю над завданням',
    });
    const artifacts = events.flatMap((e) => (e.type === 'artifact' ? [e.artifact] : []));
    expect(artifacts.map((a) => a.kind)).toEqual(['spreads', 'file']);
    // Only the supervisor's answer is streamed to the user, not the sub-agent's report.
    const text = events.flatMap((e) => (e.type === 'token' ? [e.text] : [])).join('');
    expect(text).toBe('На спредах втрачено 47 $, звіт — нижче.');
    expect(events.at(-1)).toEqual({ type: 'done' });

    // The sub-agent got a self-contained task with the list of files.
    const task = String(instances.get('spreads')!.calls[0][1].content);
    expect(task).toContain(`${file.id}: «ledger.csv» — Ledger Live CSV`);
    // The supervisor received the sub-agent's report as the tool result.
    const toolResult = instances.get('supervisor')!.calls[1].at(-1)!;
    expect(String(toolResult.content)).toBe('Спред 47 USD на 1 обміні; звіт сформовано.');

    const download = await fetch(new URL((artifacts[1] as FileArtifact).url, base));
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toMatch(/filename\*=UTF-8''Taxered_spredy/);
    expect(new Uint8Array(await download.arrayBuffer()).subarray(0, 2)).toEqual(
      new Uint8Array([0x50, 0x4b]),
    );

    // The next message continues the same thread.
    const second = await readEvents(await send(base, 'Дякую'));
    expect(second.at(-1)).toEqual({ type: 'done' });
    const history = instances.get('supervisor')!.calls[2];
    expect(history.map((m) => m.getType())).toEqual([
      'system',
      'human',
      'ai',
      'tool',
      'ai',
      'human',
    ]);
  });

  it('turns a tool error into a message the sub-agent can act on', async () => {
    const spreads: ScriptStep[] = [
      callTool('analyze_spreads_and_fees', {}),
      (messages) => reply(`Помилка: ${String(messages.at(-1)?.content)}`),
    ];
    const supervisor: ScriptStep[] = [
      callTool('ask_spreads_agent', { task: 'Порахуй спреди.' }),
      (messages) => reply(String(messages.at(-1)?.content)),
    ];
    const { base } = await start({ supervisor, spreads });
    const events = await readEvents(await send(base, 'Спреди?'));
    const text = events.flatMap((e) => (e.type === 'token' ? [e.text] : [])).join('');
    expect(text).toMatch(/немає файлів потрібного формату/);
  });

  it('rejects bad requests and reports a missing API key', async () => {
    const app = express();
    app.use('/api/chat', chatRouter({ agent: null }));
    const running = await serve(app);
    server = running.server;

    expect(
      (await fetch(`${running.base}/threads/not-a-uuid/messages`, { method: 'POST' })).status,
    ).toBe(400);
    const response = await fetch(`${running.base}/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Привіт', fileIds: [] }),
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('decodes windows-1251 broker XML and strips the BOM of UTF-8 files', () => {
    const cp1251 = new Uint8Array([
      ...new TextEncoder().encode('<?xml version="1.0" encoding="windows-1251"?><a>'),
      0xcf,
      0xf0,
      0xe8,
      0xe2,
      0xb3,
      0xf2,
      ...new TextEncoder().encode('</a>'),
    ]);
    expect(decodeText(cp1251)).toContain('<a>Привіт</a>');
    expect(decodeText(new TextEncoder().encode('﻿a,b'))).toBe('a,b');
  });
});
