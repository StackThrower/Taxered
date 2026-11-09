// Turns the Angular build into Vercel's Build Output API v3 (.vercel/output), so the
// deployment does not depend on how Vercel detects the framework:
//
//   static/                 the browser build: prerendered pages and assets, served by the CDN
//   functions/ssr.func/     the self-contained SSR server (Express + the chat agent) as one
//                           streaming Node.js function, for the chat API and everything else
//   config.json             redirects, security headers, caching, routing
//
// Runs after `npm run build` (npm script `build:vercel`, the build command in vercel.json).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/Taxered/', root);
const out = new URL('.vercel/output/', root);
const fn = new URL('functions/ssr.func/', out);

/** Vercel stops the function after this many seconds (Hobby and Pro allow 300). */
const MAX_DURATION = 300;

const { securityHeaders, LEGACY_TOOL_PAGES, LOCALE } = await import(
  new URL('server/server.mjs', dist).href
);

rmSync(out, { recursive: true, force: true });
cpSync(new URL('browser/', dist), new URL('static/', out), { recursive: true });

// The server finds the browser build (static fallback, fonts for the PDFs) next to itself.
mkdirSync(fn, { recursive: true });
cpSync(new URL('server/', dist), new URL('server/', fn), { recursive: true });
cpSync(new URL('browser/', dist), new URL('browser/', fn), { recursive: true });
writeFileSync(
  new URL('index.mjs', fn),
  "// Vercel entry point: Angular's Node request handler around the Express app.\n" +
    "export { reqHandler as default } from './server/server.mjs';\n",
);
writeFileSync(
  new URL('.vc-config.json', fn),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      // Express parses the bodies itself.
      shouldAddHelpers: false,
      // The chat answers are server-sent events.
      supportsResponseStreaming: true,
      maxDuration: MAX_DURATION,
    },
    null,
    2,
  ),
);

const NO_CACHE = [
  'manifest.json',
  'ngsw.json',
  'ngsw-worker.js',
  'safety-worker.js',
  'worker-basic.min.js',
  'sw.js',
];

const routes = [
  // The calculator, tax map and Ledger pages became tasks of the chat assistant.
  ...Object.entries(LEGACY_TOOL_PAGES).map(([path, topic]) => ({
    src: `^/${LOCALE}/${path}/?$`,
    status: 301,
    headers: { Location: `/${LOCALE}?topic=${topic}` },
  })),
  { src: '^/.*$', headers: securityHeaders(false), continue: true },
  {
    src: '^/.*-[A-Z0-9]{8}\\.[a-z0-9]+$',
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    continue: true,
  },
  {
    src: `^/(${NO_CACHE.map((f) => f.replace(/\./g, '\\.')).join('|')})$`,
    headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
    continue: true,
  },
  { src: '^/api/.*$', dest: '/ssr' },
  { handle: 'filesystem' },
  // Prerendered pages: /uk-ua/about → /uk-ua/about/index.html when that file exists.
  { src: '^/(.+?)/?$', dest: '/$1/index.html', check: true },
  { src: '^/.*$', dest: '/ssr' },
];

writeFileSync(new URL('config.json', out), JSON.stringify({ version: 3, routes }, null, 2));
console.log(`Wrote ${out.pathname}`);
