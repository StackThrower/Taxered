/**
 * Helpers the tools of every sub-agent share. The thread's `Session` travels in
 * `config.configurable.session`; artifacts leave a tool as LangChain custom events, which the
 * HTTP handler forwards to the browser (they bubble up from the nested sub-agent runs).
 */
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import type { RunnableConfig } from '@langchain/core/runnables';
import { randomUUID } from 'node:crypto';
import type { ChatArtifact, FileArtifact, FileKind } from '../app/chat/protocol';
import { CHAT_API } from '../app/chat/protocol';
import { FILE_KIND_LABELS, Session, type StoredFile } from './session';

export const ARTIFACT_EVENT = 'taxered_artifact';

export function sessionOf(config: RunnableConfig | undefined): Session {
  const session: unknown = config?.configurable?.['session'];
  if (!(session instanceof Session)) {
    throw new Error('Немає розмови.');
  }
  return session;
}

export function artifactId(): string {
  return randomUUID().slice(0, 12);
}

export async function emitArtifact(
  artifact: ChatArtifact,
  config: RunnableConfig | undefined,
): Promise<void> {
  await dispatchCustomEvent(ARTIFACT_EVENT, artifact, config);
}

/** Stores a generated file and shows it in the chat as a download. */
export async function emitFile(
  config: RunnableConfig | undefined,
  name: string,
  mime: string,
  bytes: Uint8Array,
  description: string,
): Promise<FileArtifact> {
  const session = sessionOf(config);
  const output = await session.addOutput(name, mime, bytes);
  const artifact: FileArtifact = {
    kind: 'file',
    id: output.id,
    name,
    mime,
    size: bytes.byteLength,
    // `ngsw-bypass`: the service worker must not answer the download with the app shell.
    url: `${CHAT_API}/threads/${session.id}/outputs/${output.id}?ngsw-bypass=true`,
    description,
  };
  await emitArtifact(artifact, config);
  return artifact;
}

/**
 * The files a tool works on: the ones named by id, or every uploaded file of the given kinds.
 * Throws a message the model can relay when there is none or an id has the wrong kind.
 */
export async function pickFiles(
  session: Session,
  ids: readonly string[] | undefined,
  kinds: readonly FileKind[],
): Promise<StoredFile[]> {
  const wanted = kinds.map((k) => FILE_KIND_LABELS[k]).join(' або ');
  return Promise.all(chooseFiles(session, ids, kinds, wanted).map((f) => session.read(f)));
}

function chooseFiles(
  session: Session,
  ids: readonly string[] | undefined,
  kinds: readonly FileKind[],
  wanted: string,
) {
  if (ids && ids.length > 0) {
    return ids.map((id) => {
      const file = session.files.get(id);
      if (!file) {
        throw new Error(`Файлу ${id} немає в розмові.`);
      }
      if (!kinds.includes(file.kind)) {
        throw new Error(
          `«${file.name}» — ${FILE_KIND_LABELS[file.kind]}; цей інструмент приймає: ${wanted}.`,
        );
      }
      return file;
    });
  }
  const files = [...session.files.values()].filter((f) => kinds.includes(f.kind));
  if (files.length === 0) {
    throw new Error(
      `У розмові немає файлів потрібного формату (${wanted}). Попросіть їх завантажити.`,
    );
  }
  return files;
}

/** Tool results go back to the model as compact JSON. */
export function result(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v,
  );
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs `task` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await task(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
