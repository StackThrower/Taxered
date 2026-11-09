import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RedisThreadStore, redisFromEnv } from './redis-store';
import { MemoryThreadStore, type ThreadStore } from './thread-store';

const redis = redisFromEnv();

/**
 * A stand-in for Upstash's REST API with the commands the store uses, so the Redis store is
 * tested against the real client without credentials (expiry is not simulated).
 */
function upstashStub(): Server {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const run = ([command, ...args]: string[]): unknown => {
    const [key] = args;
    switch (command.toUpperCase()) {
      case 'GET':
        return strings.get(key) ?? null;
      case 'SET': {
        const nx = args.slice(2).some((a) => a.toUpperCase() === 'NX');
        if (nx && strings.has(key)) {
          return null;
        }
        strings.set(key, args[1]);
        return 'OK';
      }
      case 'INCR': {
        const value = String(Number(strings.get(key) ?? 0) + 1);
        strings.set(key, value);
        return Number(value);
      }
      case 'HSET': {
        const hash = hashes.get(key) ?? new Map<string, string>();
        for (let i = 1; i < args.length; i += 2) {
          hash.set(args[i], args[i + 1]);
        }
        hashes.set(key, hash);
        return (args.length - 1) / 2;
      }
      case 'HGET':
        return hashes.get(key)?.get(args[1]) ?? null;
      case 'HGETALL':
        return [...(hashes.get(key) ?? [])].flat();
      case 'HKEYS':
        return [...(hashes.get(key)?.keys() ?? [])];
      case 'DEL':
        return args.filter((k) => strings.delete(k) || hashes.delete(k)).length;
      case 'PEXPIRE':
        return strings.has(key) || hashes.has(key) ? 1 : 0;
      default:
        throw new Error(`stub: ${command}`);
    }
  };
  const encode = (value: unknown): unknown =>
    typeof value === 'string'
      ? Buffer.from(value).toString('base64')
      : Array.isArray(value)
        ? value.map(encode)
        : value;
  return createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const base64 = req.headers['upstash-encoding'] === 'base64';
      const answer = (command: string[]) => {
        const result = run(command.map(String));
        return { result: base64 ? encode(result) : result };
      };
      const parsed = JSON.parse(body) as string[] | string[][];
      const out = req.url?.startsWith('/pipeline')
        ? (parsed as string[][]).map(answer)
        : answer(parsed as string[]);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(out));
    });
  });
}

let stub: Server;
let stubUrl = '';
beforeAll(async () => {
  stub = upstashStub();
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
});
afterAll(() => stub.close());

/** The same contract for every store; Redis runs only when Upstash credentials are set. */
const stores: [string, () => ThreadStore][] = [
  ['memory', () => new MemoryThreadStore()],
  [
    'redis (Upstash REST stub)',
    () =>
      new RedisThreadStore(
        new Redis({ url: stubUrl, token: 't', automaticDeserialization: false }),
      ),
  ],
  ...(redis
    ? [
        [
          'redis',
          () => new RedisThreadStore(redis, `taxered-test-${randomUUID().slice(0, 8)}`),
        ] as [string, () => ThreadStore],
      ]
    : []),
];

describe.each(stores)('%s thread store', (_name, create) => {
  let store: ThreadStore;
  let id: string;

  beforeEach(() => {
    store = create();
    id = randomUUID();
  });

  afterEach(() => store.deleteThread(id));

  it('keeps the state, files and outputs of a thread apart', async () => {
    expect(await store.getState(id)).toBeNull();
    await store.setState(id, { messages: [], f1: null, returns: null });
    await store.putFile(
      id,
      { id: 'f_1', name: 'a.csv', size: 3, kind: 'unknown' },
      new Uint8Array([1, 2, 3]),
    );
    await store.putOutput(
      id,
      { id: 'o_1', name: 'r.pdf', mime: 'application/pdf', size: 2 },
      new Uint8Array([9, 8]),
    );

    // Saving the state does not drop a file uploaded meanwhile.
    await store.setState(id, {
      messages: [],
      f1: { year: '2025', positions: [], options: {} },
      returns: null,
    });
    expect(await store.listFiles(id)).toEqual([
      { id: 'f_1', name: 'a.csv', size: 3, kind: 'unknown' },
    ]);
    expect(await store.getFile(id, 'f_1')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await store.getOutput(id, 'o_1')).toEqual({
      meta: { id: 'o_1', name: 'r.pdf', mime: 'application/pdf', size: 2 },
      bytes: new Uint8Array([9, 8]),
    });
    expect((await store.getState(id))?.f1?.year).toBe('2025');

    await store.touch(id);
    await store.deleteThread(id);
    expect(await store.getState(id)).toBeNull();
    expect(await store.listFiles(id)).toEqual([]);
    expect(await store.getOutput(id, 'o_1')).toBeNull();
  });

  it('lets one answer run at a time', async () => {
    expect(await store.lock(id, 60_000)).toBe(true);
    expect(await store.lock(id, 60_000)).toBe(false);
    await store.unlock(id);
    expect(await store.lock(id, 60_000)).toBe(true);
    await store.unlock(id);
  });

  it('counts hits per window', async () => {
    const key = `test-${id}`;
    expect(await store.hit(key, 60_000)).toBe(1);
    expect(await store.hit(key, 60_000)).toBe(2);
  });
});
