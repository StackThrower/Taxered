import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { basename, join } from 'node:path';
import { SITE_URL } from './app/core/site';
import { buildSitemap } from './app/core/sitemap';

const browserDistFolder = join(import.meta.dirname, '../browser');

const CANONICAL_HOST = new URL(SITE_URL).host;

/** Legacy hosts that permanently redirect to the canonical one. */
const REDIRECT_HOSTS = new Set(['monegoo.com', 'www.monegoo.com', `www.${CANONICAL_HOST}`]);

/** Old URLs indexed by search engines that now point to the home page. */
const LEGACY_URLS = new Set([
  '/tag/etf',
  '/en-us/the-role-of-technology-for-stocks-in-shaping-the-u-s-stock-market',
  '/en-us/tag/savings',
  '/en-us/home',
]);

/**
 * Content-Security-Policy.
 *
 * script-src keeps 'unsafe-inline' for the theme-init and JSON-LD blocks in
 * index.html and Angular's inline event-replay/critical-CSS loaders. The other
 * directives still stop an injected script from loading external code,
 * exfiltrating form data to an arbitrary host (connect-src), hijacking relative
 * URLs (base-uri) or retargeting form posts (form-action).
 */
function contentSecurityPolicy(isLocal: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.clarity.ms https://*.clarity.ms",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.clarity.ms https://c.bing.com",
    "font-src 'self' data:",
    // Analytics beacons + the NBU exchange-rate API. Everything else is denied.
    "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.clarity.ms https://c.bing.com https://bank.gov.ua",
    // blob: is required by the service worker and by the generated PDFs,
    // which are opened via window.open(doc.output('bloburl')).
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(isLocal ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

const app = express();
const angularApp = new AngularNodeAppEngine();

// Don't advertise the framework in every response.
app.disable('x-powered-by');

/**
 * Redirects: legacy hosts → canonical host, http → https, and retired URLs → home.
 */
app.use((req, res, next) => {
  const host = req.headers.host ?? '';

  if (REDIRECT_HOSTS.has(host)) {
    res.redirect(308, `https://${CANONICAL_HOST}${req.originalUrl}`);
    return;
  }

  // Only the canonical host is upgraded, and the target host is hardcoded rather
  // than echoed from the request, so a spoofed Host header can't turn this into
  // an open redirect and previews behind a TLS proxy aren't sent to production.
  if (host === CANONICAL_HOST && req.headers['x-forwarded-proto'] === 'http') {
    res.redirect(308, `https://${CANONICAL_HOST}${req.originalUrl}`);
    return;
  }

  if (LEGACY_URLS.has(req.path)) {
    res.redirect(307, '/');
    return;
  }

  next();
});

/**
 * Security headers for every response.
 */
app.use((req, res, next) => {
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  res.setHeader('Content-Security-Policy', contentSecurityPolicy(isLocal));
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  if (!isLocal) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // The legacy XSS auditor is disabled on purpose; CSP above is the real control.
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/**
 * sitemap.xml. The build also writes it to the browser output (scripts/write-sitemap.mjs)
 * for static hosting; this route serves it when the Node server runs, including `ng serve`.
 */
const startedAt = new Date().toISOString();

app.get('/sitemap.xml', (_req, res) => {
  res
    .type('application/xml')
    .setHeader('Cache-Control', 'public, max-age=3600, must-revalidate')
    .send(buildSitemap(startedAt));
});

/** Files that must always be revalidated so app and service-worker updates are picked up. */
const NO_CACHE_FILES = new Set([
  'manifest.json',
  'ngsw-worker.js',
  'ngsw.json',
  'safety-worker.js',
  'worker-basic.min.js',
  'sw.js',
]);

/** Build output with a content hash in its name, e.g. `main-R4IB5CEW.js`. */
const HASHED_FILE = /-[A-Z0-9]{8}\.[a-z0-9]+$/;

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    index: false,
    redirect: false,
    setHeaders: (res, path) => {
      const file = basename(path);
      if (NO_CACHE_FILES.has(file)) {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      } else if (HASHED_FILE.test(file)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }

      if (file === 'manifest.json') {
        res.setHeader('Content-Type', 'application/manifest+json');
      } else if (file === 'sw.js') {
        res.setHeader('Service-Worker-Allowed', '/');
      }
    },
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');

  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

/** Used by scripts/write-sitemap.mjs after the build. */
export { buildSitemap };
