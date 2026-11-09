/**
 * A chat thread as one request sees it: the uploaded files, the agent's working data (Ф1
 * positions, the last returns analysis) and the conversation, loaded from a `ThreadStore` and
 * saved back when the answer is done. Tools reach it through `config.configurable.session`.
 */
import { randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { StoredMessage } from '@langchain/core/messages';
import type { FileKind, UploadedFile } from '../app/chat/protocol';
import { MAX_FILES_PER_THREAD } from '../app/chat/protocol';
import { isIbCsvStatement } from '../app/lib/ib-csv-parser';
import { detectXMLType } from '../app/lib/ib-xml-parser';
import { isLedgerCsv } from '../app/lib/ledger-csv';
import type { F1State, OutputMeta, ThreadState, ThreadStore } from './store/thread-store';

export type { F1State } from './store/thread-store';

/** Uploads of one thread, uncompressed. */
const MAX_THREAD_BYTES = 40 * 1024 * 1024;

export interface StoredFile extends UploadedFile {
  content: string;
}

/** Thread ids are random UUIDs made by the browser; they are the only key to a thread. */
export function isThreadId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}

export class Session {
  f1: F1State | null;
  returns: ThreadState['returns'];
  messages: StoredMessage[];
  private readonly contents = new Map<string, string>();

  private constructor(
    readonly id: string,
    readonly store: ThreadStore,
    readonly files: Map<string, UploadedFile>,
    state: ThreadState | null,
  ) {
    this.f1 = state?.f1 ?? null;
    this.returns = state?.returns ?? null;
    this.messages = state?.messages ?? [];
  }

  static async open(store: ThreadStore, id: string): Promise<Session> {
    const [state, files] = await Promise.all([store.getState(id), store.listFiles(id)]);
    return new Session(id, store, new Map(files.map((f) => [f.id, f])), state);
  }

  /** The text of an uploaded file. */
  async read(file: UploadedFile): Promise<StoredFile> {
    let content = this.contents.get(file.id);
    if (content === undefined) {
      const bytes = await this.store.getFile(this.id, file.id);
      if (!bytes) {
        throw new Error(`Файл «${file.name}» більше недоступний — завантажте його ще раз.`);
      }
      content = gunzipSync(bytes).toString('utf8');
      this.contents.set(file.id, content);
    }
    return { ...file, content };
  }

  async addOutput(name: string, mime: string, bytes: Uint8Array): Promise<OutputMeta> {
    const output: OutputMeta = { id: randomUUID(), name, mime, size: bytes.byteLength };
    await this.store.putOutput(this.id, output, bytes);
    return output;
  }

  async save(): Promise<void> {
    await this.store.setState(this.id, {
      messages: this.messages,
      f1: this.f1,
      returns: this.returns,
    });
  }
}

/** Stores an uploaded file (already decoded to text) and recognises its format. */
export async function uploadFile(
  store: ThreadStore,
  threadId: string,
  name: string,
  content: string,
): Promise<UploadedFile> {
  const files = await store.listFiles(threadId);
  if (files.length >= MAX_FILES_PER_THREAD) {
    throw new Error(`У розмові може бути не більше ${MAX_FILES_PER_THREAD} файлів.`);
  }
  const size = Buffer.byteLength(content);
  if (files.reduce((sum, f) => sum + f.size, 0) + size > MAX_THREAD_BYTES) {
    throw new Error(
      `Файли розмови разом не можуть перевищувати ${MAX_THREAD_BYTES / 1024 / 1024} МБ. Почніть нову розмову.`,
    );
  }
  const file: UploadedFile = {
    id: `f_${randomUUID().slice(0, 8)}`,
    name,
    size,
    kind: detectFileKind(content),
  };
  await store.putFile(threadId, file, new Uint8Array(gzipSync(content)));
  return file;
}

export function detectFileKind(content: string): FileKind {
  const head = content.slice(0, 4096);
  if (head.trimStart().startsWith('<')) {
    const type = detectXMLType(content);
    return type === 'interactive_brokers'
      ? 'ib_xml'
      : type === 'freedom_finance'
        ? 'ff_xml'
        : 'unknown';
  }
  if (isLedgerCsv(content)) {
    return 'ledger_csv';
  }
  if (isIbCsvStatement(content)) {
    return 'ib_csv';
  }
  return 'unknown';
}

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  ib_xml: 'Interactive Brokers Flex Query XML (для Ф1)',
  ff_xml: 'Freedom Finance XML (для Ф1)',
  ib_csv: 'Interactive Brokers Activity Statement CSV (для дохідності)',
  ledger_csv: 'Ledger Live CSV (спреди, комісії, портфель)',
  unknown: 'невідомий формат',
};

/** One line per file, for prompts and tool results. */
export function describeFiles(files: Iterable<UploadedFile>): string {
  const lines = [...files].map(
    (f) => `- ${f.id}: «${f.name}» — ${FILE_KIND_LABELS[f.kind]}, ${Math.ceil(f.size / 1024)} КБ`,
  );
  return lines.length > 0 ? lines.join('\n') : '(файлів немає)';
}
