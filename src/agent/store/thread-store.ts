/**
 * Where chat threads live between requests. On a single long-running server (local, Cloud Run)
 * memory is enough; serverless functions (Vercel) share nothing between invocations, so there
 * the threads go to Redis. Everything expires after `THREAD_TTL_MS` of inactivity.
 *
 * Files and the agent's state are kept apart on purpose: uploads may arrive while the agent
 * is answering, and saving the state must not drop them.
 */
import type { StoredMessage } from '@langchain/core/messages';
import type { FinancialPosition, TaxOptions } from '../../app/declaration/f0121214/tax-model';
import type { UploadedFile } from '../../app/chat/protocol';
import type { Analysis, DisplayCurrency } from '../../app/lib/returns-model';

export const THREAD_TTL_MS = 2 * 60 * 60 * 1000;

export interface F1State {
  year: string;
  positions: FinancialPosition[];
  options: TaxOptions;
}

/** What the agent remembers about a thread; written only by the request holding its lock. */
export interface ThreadState {
  /** The supervisor's conversation, append-only. */
  messages: StoredMessage[];
  f1: F1State | null;
  returns: { currency: DisplayCurrency; analysis: Analysis } | null;
}

export interface OutputMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface ThreadStore {
  getState(threadId: string): Promise<ThreadState | null>;
  setState(threadId: string, state: ThreadState): Promise<void>;

  listFiles(threadId: string): Promise<UploadedFile[]>;
  /** `bytes` is the gzip-compressed UTF-8 text of the file. */
  putFile(threadId: string, file: UploadedFile, bytes: Uint8Array): Promise<void>;
  getFile(threadId: string, fileId: string): Promise<Uint8Array | null>;

  putOutput(threadId: string, output: OutputMeta, bytes: Uint8Array): Promise<void>;
  getOutput(
    threadId: string,
    outputId: string,
  ): Promise<{ meta: OutputMeta; bytes: Uint8Array } | null>;

  /** Keeps an active thread from expiring. */
  touch(threadId: string): Promise<void>;
  deleteThread(threadId: string): Promise<void>;

  /** Counts a hit in the current fixed window of `windowMs`; returns the count so far. */
  hit(key: string, windowMs: number): Promise<number>;
  /** One answer at a time per thread; the lock expires by itself if a run dies. */
  lock(threadId: string, ttlMs: number): Promise<boolean>;
  unlock(threadId: string): Promise<void>;
}

interface MemoryThread {
  state: ThreadState | null;
  files: Map<string, { meta: UploadedFile; bytes: Uint8Array }>;
  outputs: Map<string, { meta: OutputMeta; bytes: Uint8Array }>;
  lockedUntil: number;
  touchedAt: number;
}

/** Bytes of stored files across all threads; the least recently used threads make room. */
const MEMORY_MAX_BYTES = 400 * 1024 * 1024;
const MEMORY_MAX_THREADS = 500;

export class MemoryThreadStore implements ThreadStore {
  private readonly threads = new Map<string, MemoryThread>();
  private readonly hits = new Map<string, { window: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private thread(id: string): MemoryThread {
    this.expire();
    let thread = this.threads.get(id);
    if (!thread) {
      if (this.threads.size >= MEMORY_MAX_THREADS) {
        this.threads.delete(this.oldest(id)!);
      }
      thread = { state: null, files: new Map(), outputs: new Map(), lockedUntil: 0, touchedAt: 0 };
      this.threads.set(id, thread);
    }
    thread.touchedAt = this.now();
    return thread;
  }

  private expire(): void {
    const now = this.now();
    for (const [id, thread] of this.threads) {
      if (now - thread.touchedAt > THREAD_TTL_MS) {
        this.threads.delete(id);
      }
    }
  }

  private oldest(except: string): string | undefined {
    return [...this.threads]
      .filter(([id]) => id !== except)
      .sort(([, a], [, b]) => a.touchedAt - b.touchedAt)[0]?.[0];
  }

  private makeRoom(current: string, bytes: number): void {
    const size = (t: MemoryThread) =>
      [...t.files.values(), ...t.outputs.values()].reduce((s, f) => s + f.bytes.byteLength, 0);
    let total = [...this.threads.values()].reduce((s, t) => s + size(t), 0);
    while (total + bytes > MEMORY_MAX_BYTES) {
      const victim = this.oldest(current);
      if (!victim) {
        throw new Error('Сервер перевантажений файлами. Спробуйте пізніше.');
      }
      total -= size(this.threads.get(victim)!);
      this.threads.delete(victim);
    }
  }

  async getState(id: string) {
    return structuredClone(this.thread(id).state);
  }

  async setState(id: string, state: ThreadState) {
    this.thread(id).state = structuredClone(state);
  }

  async listFiles(id: string) {
    return [...this.thread(id).files.values()].map((f) => f.meta);
  }

  async putFile(id: string, file: UploadedFile, bytes: Uint8Array) {
    this.makeRoom(id, bytes.byteLength);
    this.thread(id).files.set(file.id, { meta: file, bytes });
  }

  async getFile(id: string, fileId: string) {
    return this.thread(id).files.get(fileId)?.bytes ?? null;
  }

  async putOutput(id: string, output: OutputMeta, bytes: Uint8Array) {
    this.makeRoom(id, bytes.byteLength);
    this.thread(id).outputs.set(output.id, { meta: output, bytes });
  }

  async getOutput(id: string, outputId: string) {
    return this.thread(id).outputs.get(outputId) ?? null;
  }

  async touch(id: string) {
    this.thread(id);
  }

  async deleteThread(id: string) {
    this.threads.delete(id);
  }

  async hit(key: string, windowMs: number) {
    const window = Math.floor(this.now() / windowMs);
    const entry = this.hits.get(key);
    const count = entry && entry.window === window ? entry.count + 1 : 1;
    this.hits.set(key, { window, count });
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (v.window !== window) {
          this.hits.delete(k);
        }
      }
    }
    return count;
  }

  async lock(id: string, ttlMs: number) {
    const thread = this.thread(id);
    if (thread.lockedUntil > this.now()) {
      return false;
    }
    thread.lockedUntil = this.now() + ttlMs;
    return true;
  }

  async unlock(id: string) {
    const thread = this.threads.get(id);
    if (thread) {
      thread.lockedUntil = 0;
    }
  }
}
