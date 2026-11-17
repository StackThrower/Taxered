/**
 * Login for the chat API: one username and password from the environment (`CHAT_USERNAME`,
 * `CHAT_PASSWORD`). A successful login sets an HttpOnly cookie holding its expiry signed with
 * HMAC; the key is derived from the credentials, so changing the password signs everyone out.
 *
 * GET    /api/chat/session   { authenticated }
 * POST   /api/chat/session   { username, password } → sets the cookie
 * DELETE /api/chat/session   clears the cookie
 *
 * Every other route of the chat API answers 401 without a valid cookie.
 */
import express, { type Request, type RequestHandler, type Response, type Router } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ThreadStore } from './store/thread-store';

export interface ChatCredentials {
  username: string;
  password: string;
}

const COOKIE = 'taxered_chat';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
/** Failed and successful attempts per client address and window, against password guessing. */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const NOT_CONFIGURED =
  'Вхід не налаштований: на сервері не задано CHAT_USERNAME / CHAT_PASSWORD.';

export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): ChatCredentials | null {
  const username = env['CHAT_USERNAME']?.trim();
  const password = env['CHAT_PASSWORD'];
  return username && password ? { username, password } : null;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Compares in constant time; hashing first makes the lengths equal. */
function same(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function signingKey({ username, password }: ChatCredentials): Buffer {
  return digest(`taxered-chat-session\0${username}\0${password}`);
}

export function signSession(credentials: ChatCredentials, expires: number): string {
  const mac = createHmac('sha256', signingKey(credentials)).update(String(expires));
  return `${expires}.${mac.digest('base64url')}`;
}

export function verifySession(
  credentials: ChatCredentials,
  token: string | undefined,
  now = Date.now(),
): boolean {
  const expires = Number(token?.split('.')[0]);
  if (!token || !Number.isSafeInteger(expires) || expires <= now) {
    return false;
  }
  return same(token, signSession(credentials, expires));
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.header('Cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      return value.join('=');
    }
  }
  return undefined;
}

function cookie(req: Request, value: string, maxAgeSeconds: number): string {
  const local = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  return [
    `${COOKIE}=${value}`,
    `Path=${req.baseUrl || '/'}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(local ? [] : ['Secure']),
  ].join('; ');
}

/** Vercel sets X-Real-IP to the client address (and overwrites any sent by the client). */
export function clientAddress(req: Request): string {
  return req.header('X-Real-IP') || req.ip || 'unknown';
}

/**
 * Adds the session routes to `router` and returns the guard for the routes after them.
 * Without credentials (null) the chat stays locked.
 */
export function chatAuth(
  router: Router,
  credentials: ChatCredentials | null,
  store: ThreadStore,
): RequestHandler {
  const authenticated = (req: Request) =>
    !!credentials && verifySession(credentials, readCookie(req, COOKIE));

  router.get('/session', (req, res) => {
    res.json({ authenticated: authenticated(req) });
  });

  router.post('/session', express.json({ limit: '4kb' }), async (req, res: Response) => {
    if (!credentials) {
      res.status(503).json({ error: NOT_CONFIGURED });
      return;
    }
    if ((await store.hit(`login:${clientAddress(req)}`, LOGIN_WINDOW_MS)) > LOGIN_LIMIT) {
      res.status(429).json({ error: 'Забагато спроб входу. Спробуйте за 15 хвилин.' });
      return;
    }
    const body = req.body as { username?: unknown; password?: unknown };
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    // Both are always compared, so the timing does not tell which one was wrong.
    const userOk = same(username, credentials.username);
    const passwordOk = same(password, credentials.password);
    if (!userOk || !passwordOk) {
      res.status(401).json({ error: 'Невірний логін або пароль.' });
      return;
    }
    const token = signSession(credentials, Date.now() + SESSION_MS);
    res.setHeader('Set-Cookie', cookie(req, token, SESSION_MS / 1000));
    res.json({ authenticated: true });
  });

  router.delete('/session', (req, res) => {
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    res.status(204).end();
  });

  return (req, res, next) => {
    if (authenticated(req)) {
      next();
      return;
    }
    res
      .status(credentials ? 401 : 503)
      .json({ error: credentials ? 'Увійдіть, щоб користуватися чатом.' : NOT_CONFIGURED });
  };
}
