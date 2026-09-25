// Kill switch for the Workbox service worker registered by the previous
// Next.js version of the site at /sw.js. Browsers that still have it installed
// fetch this file on their next update check: it clears the old caches and
// unregisters itself, after which the Angular service worker (ngsw-worker.js)
// takes over.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith('ngsw:')).map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })(),
  );
});
