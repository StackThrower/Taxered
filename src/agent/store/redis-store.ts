/**
 * Threads in Redis over Upstash's REST API: no connection to keep, so it works from serverless
 * functions. On Vercel, add "Upstash for Redis" from the Marketplace; it sets
 * KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
 *
 * Keys of a thread (all expire after `THREAD_TTL_MS` without activity):
 *   taxered:{id}:state          agent state and conversation, JSON
 *   taxered:{id}:files          hash fileId → file metadata JSON
 *   taxered:{id}:file:{fileId}  gzip of the file text, base64
 *   taxered:{id}:outputs        hash outputId → output metadata JSON
 *   taxered:{id}:out:{outputId} generated file, base64
 *   taxered:{id}:lock           set while the agent answers
 */
import { Redis } from '@upstash/redis';
import type { UploadedFile } from '../../app/chat/protocol';
import { THREAD_TTL_MS, type OutputMeta, type ThreadState, type ThreadStore } from './thread-store';

export function redisFromEnv(env: NodeJS.ProcessEnv = process.env): Redis | null {
  const url = env['KV_REST_API_URL'] || env['UPSTASH_REDIS_REST_URL'];
  const token = env['KV_REST_API_TOKEN'] || env['UPSTASH_REDIS_REST_TOKEN'];
  // Values are stored as strings and parsed here, never guessed by the client.
  return url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, 'base64'));

export class RedisThreadStore implements ThreadStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'taxered',
  ) {}

  private key(id: string, part: string): string {
    return `${this.prefix}:${id}:${part}`;
  }

  async getState(id: string): Promise<ThreadState | null> {
    const text = await this.redis.get<string>(this.key(id, 'state'));
    return text ? (JSON.parse(text) as ThreadState) : null;
  }

  async setState(id: string, state: ThreadState): Promise<void> {
    await this.redis.set(this.key(id, 'state'), JSON.stringify(state), { px: THREAD_TTL_MS });
  }

  async listFiles(id: string): Promise<UploadedFile[]> {
    // Without automatic deserialization HGETALL comes back as the raw [field, value, ...] list.
    const raw = (await this.redis.hgetall(this.key(id, 'files'))) as
      Record<string, string> | string[] | null;
    const values = Array.isArray(raw)
      ? raw.filter((_, i) => i % 2 === 1)
      : Object.values(raw ?? {});
    return values.map((text) => JSON.parse(text) as UploadedFile);
  }

  async putFile(id: string, file: UploadedFile, bytes: Uint8Array): Promise<void> {
    const files = this.key(id, 'files');
    await this.redis
      .pipeline()
      .set(this.key(id, `file:${file.id}`), toBase64(bytes), { px: THREAD_TTL_MS })
      .hset(files, { [file.id]: JSON.stringify(file) })
      .pexpire(files, THREAD_TTL_MS)
      .exec();
  }

  async getFile(id: string, fileId: string): Promise<Uint8Array | null> {
    const text = await this.redis.get<string>(this.key(id, `file:${fileId}`));
    return text ? fromBase64(text) : null;
  }

  async putOutput(id: string, output: OutputMeta, bytes: Uint8Array): Promise<void> {
    const outputs = this.key(id, 'outputs');
    await this.redis
      .pipeline()
      .set(this.key(id, `out:${output.id}`), toBase64(bytes), { px: THREAD_TTL_MS })
      .hset(outputs, { [output.id]: JSON.stringify(output) })
      .pexpire(outputs, THREAD_TTL_MS)
      .exec();
  }

  async getOutput(
    id: string,
    outputId: string,
  ): Promise<{ meta: OutputMeta; bytes: Uint8Array } | null> {
    const [meta, data] = await this.redis
      .pipeline()
      .hget<string>(this.key(id, 'outputs'), outputId)
      .get<string>(this.key(id, `out:${outputId}`))
      .exec<[string | null, string | null]>();
    return meta && data ? { meta: JSON.parse(meta) as OutputMeta, bytes: fromBase64(data) } : null;
  }

  /** Every key of the thread, including the per-file ones. */
  private async keys(id: string): Promise<string[]> {
    const [files, outputs] = await this.redis
      .pipeline()
      .hkeys(this.key(id, 'files'))
      .hkeys(this.key(id, 'outputs'))
      .exec<[string[], string[]]>();
    return [
      this.key(id, 'state'),
      this.key(id, 'files'),
      this.key(id, 'outputs'),
      ...files.map((f) => this.key(id, `file:${f}`)),
      ...outputs.map((o) => this.key(id, `out:${o}`)),
    ];
  }

  async touch(id: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const key of await this.keys(id)) {
      pipeline.pexpire(key, THREAD_TTL_MS);
    }
    await pipeline.exec();
  }

  async deleteThread(id: string): Promise<void> {
    await this.redis.del(...(await this.keys(id)), this.key(id, 'lock'));
  }

  async hit(key: string, windowMs: number): Promise<number> {
    const bucket = `${this.prefix}:rate:${key}:${Math.floor(Date.now() / windowMs)}`;
    const [count] = await this.redis
      .pipeline()
      .incr(bucket)
      .pexpire(bucket, windowMs)
      .exec<[number, number]>();
    return count;
  }

  async lock(id: string, ttlMs: number): Promise<boolean> {
    const set = await this.redis.set(this.key(id, 'lock'), '1', { nx: true, px: ttlMs });
    return set === 'OK';
  }

  async unlock(id: string): Promise<void> {
    await this.redis.del(this.key(id, 'lock'));
  }
}
