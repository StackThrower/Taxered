/**
 * In-memory state of each chat thread: the files the user uploaded, the files the agent
 * generated, and the working data of the sub-agents (the Ф1 positions, the last analyses).
 * Nothing is written to disk; a thread is forgotten after `SESSION_TTL_MS` of inactivity.
 */
import { randomUUID } from 'node:crypto';
import type { FinancialPosition, TaxOptions } from '../app/declaration/f0121214/tax-model';
import type { FileKind, UploadedFile } from '../app/chat/protocol';
import { MAX_FILES_PER_THREAD } from '../app/chat/protocol';
import type { LedgerAnalysis } from '../app/lib/ledger-csv';
import type { Analysis, DisplayCurrency } from '../app/lib/returns-model';
import { isLedgerCsv } from '../app/lib/ledger-csv';
import { isIbCsvStatement } from '../app/lib/ib-csv-parser';
import { detectXMLType } from '../app/lib/ib-xml-parser';

export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
/** Uploads of one thread. */
const MAX_THREAD_BYTES = 40 * 1024 * 1024;
/** Uploads and generated files of all threads; the least recently used threads make room. */
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;

export interface StoredFile extends UploadedFile {
  content: string;
}

export interface StoredOutput {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface F1State {
  year: string;
  positions: FinancialPosition[];
  options: TaxOptions;
}

export interface Session {
  id: string;
  files: Map<string, StoredFile>;
  outputs: Map<string, StoredOutput>;
  f1: F1State | null;
  returns: { currency: DisplayCurrency; analysis: Analysis } | null;
  ledger: { fileName: string; analysis: LedgerAnalysis } | null;
  touchedAt: number;
}

const sessions = new Map<string, Session>();
const evictionListeners = new Set<(id: string) => void>();

/** Called when a thread expires or is pushed out, so its conversation can be dropped too. */
export function onSessionEvicted(listener: (id: string) => void): () => void {
  evictionListeners.add(listener);
  return () => evictionListeners.delete(listener);
}

function evict(id: string): void {
  sessions.delete(id);
  for (const listener of evictionListeners) {
    listener(id);
  }
}

/** Thread ids are random UUIDs made by the browser; they are the only key to a thread. */
export function isThreadId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}

export function getSession(id: string, now = Date.now()): Session {
  evictExpired(now);
  let session = sessions.get(id);
  if (!session) {
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = [...sessions.values()].sort((a, b) => a.touchedAt - b.touchedAt)[0];
      evict(oldest.id);
    }
    session = {
      id,
      files: new Map(),
      outputs: new Map(),
      f1: null,
      returns: null,
      ledger: null,
      touchedAt: now,
    };
    sessions.set(id, session);
  }
  session.touchedAt = now;
  return session;
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

function evictExpired(now: number): void {
  for (const [id, session] of sessions) {
    if (now - session.touchedAt > SESSION_TTL_MS) {
      evict(id);
    }
  }
}

function sessionBytes(session: Session): number {
  let total = 0;
  for (const f of session.files.values()) {
    total += f.size;
  }
  for (const o of session.outputs.values()) {
    total += o.bytes.byteLength;
  }
  return total;
}

/** Evicts the least recently used other threads until `bytes` more fit under the total. */
function makeRoom(current: Session, bytes: number): void {
  let total = [...sessions.values()].reduce((sum, s) => sum + sessionBytes(s), 0);
  const others = [...sessions.values()]
    .filter((s) => s !== current)
    .sort((a, b) => a.touchedAt - b.touchedAt);
  for (const session of others) {
    if (total + bytes <= MAX_TOTAL_BYTES) {
      return;
    }
    total -= sessionBytes(session);
    evict(session.id);
  }
  if (total + bytes > MAX_TOTAL_BYTES) {
    throw new Error('Сервер перевантажений файлами. Спробуйте пізніше.');
  }
}

export function addFile(session: Session, name: string, content: string): StoredFile {
  if (session.files.size >= MAX_FILES_PER_THREAD) {
    throw new Error(`У розмові може бути не більше ${MAX_FILES_PER_THREAD} файлів.`);
  }
  const used = [...session.files.values()].reduce((sum, f) => sum + f.size, 0);
  if (used + Buffer.byteLength(content) > MAX_THREAD_BYTES) {
    throw new Error(
      `Файли розмови разом не можуть перевищувати ${MAX_THREAD_BYTES / 1024 / 1024} МБ. Почніть нову розмову.`,
    );
  }
  makeRoom(session, Buffer.byteLength(content));
  const file: StoredFile = {
    id: `f_${randomUUID().slice(0, 8)}`,
    name,
    size: Buffer.byteLength(content),
    kind: detectFileKind(content),
    content,
  };
  session.files.set(file.id, file);
  return file;
}

export function addOutput(
  session: Session,
  name: string,
  mime: string,
  bytes: Uint8Array,
): StoredOutput {
  makeRoom(session, bytes.byteLength);
  const output: StoredOutput = { id: randomUUID(), name, mime, bytes };
  session.outputs.set(output.id, output);
  return output;
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
