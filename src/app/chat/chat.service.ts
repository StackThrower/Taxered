import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import {
  CHAT_API,
  MAX_FILE_BYTES,
  MAX_MESSAGE_CHARS,
  type AgentName,
  type ChatArtifact,
  type ChatStreamEvent,
  type UploadedFile,
} from './protocol';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  files: UploadedFile[];
  artifacts: ChatArtifact[];
  /** What the agent is doing now; null once it answers or stops. */
  status: { agent: AgentName | null; text: string } | null;
  error: string | null;
  pending: boolean;
}

/** A file being attached to the next message. */
export interface Attachment {
  key: number;
  name: string;
  size: number;
  state: 'uploading' | 'ready' | 'failed';
  file: UploadedFile | null;
  error: string | null;
}

function newThreadId(): string {
  return crypto.randomUUID();
}

/**
 * One chat thread with the Taxered agent: uploads files, sends messages and applies the
 * server-sent events of each answer (status, text, artifacts) to the message list.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private threadId = this.browser ? newThreadId() : '';
  private nextId = 1;
  private abort: AbortController | null = null;

  readonly messages = signal<ChatMessage[]>([]);
  readonly attachments = signal<Attachment[]>([]);
  readonly busy = computed(() => this.messages().some((m) => m.pending));
  readonly uploading = computed(() => this.attachments().some((a) => a.state === 'uploading'));
  /** The Ф1 artifact whose editable form is open; one at a time (the form has fixed ids). */
  readonly editingF1 = signal<string | null>(null);

  async attach(files: readonly File[]): Promise<void> {
    await Promise.all(files.map((file) => this.upload(file)));
  }

  removeAttachment(key: number): void {
    this.attachments.update((list) => list.filter((a) => a.key !== key));
  }

  private async upload(file: File): Promise<void> {
    const key = this.nextId++;
    const add = (patch: Partial<Attachment>) =>
      this.attachments.update((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
    this.attachments.update((list) => [
      ...list,
      { key, name: file.name, size: file.size, state: 'uploading', file: null, error: null },
    ]);
    if (file.size > MAX_FILE_BYTES) {
      add({ state: 'failed', error: `Файл більший за ${MAX_FILE_BYTES / 1024 / 1024} МБ.` });
      return;
    }
    try {
      const response = await fetch(`${CHAT_API}/threads/${this.threadId}/files`, {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(file.name) },
        body: file,
      });
      const body = (await response.json()) as UploadedFile | { error: string };
      if (!response.ok || 'error' in body) {
        add({ state: 'failed', error: 'error' in body ? body.error : `HTTP ${response.status}` });
        return;
      }
      add({ state: 'ready', file: body });
    } catch {
      add({ state: 'failed', error: 'Не вдалося завантажити файл.' });
    }
  }

  async send(rawText: string): Promise<void> {
    const text = rawText.trim().slice(0, MAX_MESSAGE_CHARS);
    const files = this.attachments().flatMap((a) => (a.file ? [a.file] : []));
    if ((!text && files.length === 0) || this.busy() || this.uploading()) {
      return;
    }
    this.attachments.set([]);
    const user: ChatMessage = {
      id: this.nextId++,
      role: 'user',
      text,
      files,
      artifacts: [],
      status: null,
      error: null,
      pending: false,
    };
    const answerId = this.nextId++;
    this.messages.update((list) => [
      ...list,
      user,
      {
        id: answerId,
        role: 'assistant',
        text: '',
        files: [],
        artifacts: [],
        status: { agent: null, text: 'Думаю…' },
        error: null,
        pending: true,
      },
    ]);

    const update = (patch: (m: ChatMessage) => Partial<ChatMessage>) =>
      this.messages.update((list) =>
        list.map((m) => (m.id === answerId ? { ...m, ...patch(m) } : m)),
      );

    this.abort = new AbortController();
    try {
      const response = await fetch(`${CHAT_API}/threads/${this.threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fileIds: files.map((f) => f.id) }),
        signal: this.abort.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      for await (const event of readEvents(response.body)) {
        update((m) => applyEvent(m, event));
      }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      update(() => ({
        error: aborted ? null : error instanceof Error ? error.message : String(error),
      }));
    } finally {
      this.abort = null;
      update(() => ({ pending: false, status: null }));
    }
  }

  stop(): void {
    this.abort?.abort();
  }

  /** Starts over: the server forgets the thread and its files. */
  reset(): void {
    this.stop();
    if (this.browser) {
      void fetch(`${CHAT_API}/threads/${this.threadId}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
      this.threadId = newThreadId();
    }
    this.messages.set([]);
    this.attachments.set([]);
    this.editingF1.set(null);
  }
}

export function applyEvent(m: ChatMessage, event: ChatStreamEvent): Partial<ChatMessage> {
  switch (event.type) {
    case 'token':
      return { text: m.text + event.text, status: null };
    case 'status':
      return { status: { agent: event.agent, text: event.text } };
    case 'artifact':
      return { artifacts: [...m.artifacts, event.artifact] };
    case 'error':
      return { error: event.message, status: null };
    case 'done':
      return { status: null };
  }
}

/** Parses a text/event-stream body of `data: <json>` events. */
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (block.startsWith('data: ')) {
        yield JSON.parse(block.slice(6)) as ChatStreamEvent;
      }
    }
  }
}
