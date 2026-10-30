const CACHE = 'cocoa-time-ef8ff665a2c5';
const FILES = ["./app.js","./core.js","./icon-192.png","./icon-512.png","./icon.svg","./index.html","./manifest.webmanifest","./storage.js","./style.css","./docs/DATA_MODEL.md","./docs/HANDOFF.md","./docs/LIMITATIONS.md","./docs/RESEARCH.md","./docs/SCREEN_TIME_SETUP.md","./docs/SETUP.md","./docs/SHORTCUTS_SETUP.md","./docs/TEST_REPORT.md"];
self.addEventListener('install', (event) =>
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))),
);
// A waiting worker is activated only after the user requests an update.
self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVATE') self.skipWaiting();
});
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('cocoa-time-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin)
    return;
  event.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      if (event.request.mode === 'navigate')
        return (await c.match('./index.html')) || fetch(event.request);
      return fetch(event.request);
    }),
  );
});
