const CACHE_NAME = 'mwangaza-wire-shell-v3';
const NEWS_CACHE_NAME = 'mwangaza-wire-news-v1';
const IMAGE_CACHE_NAME = 'mwangaza-wire-images-v1';
const MAX_CACHED_IMAGES = 80;

const retainedCaches = new Set([CACHE_NAME, NEWS_CACHE_NAME, IMAGE_CACHE_NAME]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await self.skipWaiting();
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response.ok) throw new Error('Could not cache the Mwangaza Wire app shell.');

    const cache = await caches.open(CACHE_NAME);
    await cache.put('/index.html', response.clone());
    const html = await response.text();
    const assetUrls = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
      .map((match) => {
        try {
          const url = new URL(match[1], self.location.origin);
          return url.origin === self.location.origin ? url.href : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    await Promise.allSettled(assetUrls.map(async (assetUrl) => {
      const request = new Request(assetUrl);
      const asset = await fetch(request);
      if (asset.ok) await cache.put(request, asset);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => !retainedCaches.has(key)).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || !Array.isArray(message.imageUrls)) return;

  event.waitUntil((async () => {
    if (message.type === 'CACHE_NEWS_EDITION' && message.edition?.articles && Array.isArray(message.edition.articles)) {
      try {
        const request = new Request(new URL('/api/news?limit=250', self.location.origin));
        const response = new Response(JSON.stringify(message.edition), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
        const cache = await caches.open(NEWS_CACHE_NAME);
        await cache.put(request, response);
      } catch {
        // Keep the current edition in memory if persistent storage is unavailable.
      }
    }

    if (message.type !== 'CACHE_NEWS_EDITION' && message.type !== 'CACHE_PUBLISHER_IMAGES') return;
    const imageUrls = [...new Set(message.imageUrls)]
      .filter((value) => typeof value === 'string')
      .map((value) => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' ? url.href : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(0, 20);
    await Promise.allSettled(imageUrls.map(async (imageUrl) => {
      const request = new Request(imageUrl, { mode: 'no-cors', credentials: 'omit' });
      if (await caches.match(request)) return;
      const response = await fetch(request);
      await cachePublisherImage(request, response);
    }));
  })());
});

async function cacheNewsResponse(request, response) {
  if (!response.ok) return;
  try {
    const cache = await caches.open(NEWS_CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // The live response still succeeds if storage is full or unavailable.
  }
}

async function cachePublisherImage(request, response) {
  if (!response.ok && response.type !== 'opaque') return;
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    const expired = keys.slice(0, Math.max(0, keys.length - MAX_CACHED_IMAGES));
    await Promise.all(expired.map((key) => cache.delete(key)));
  } catch {
    // Image caching is best-effort; never block the publisher image response.
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;

  const isNewsApi = url.origin === self.location.origin
    && (url.pathname === '/api/news' || url.pathname === '/api/news/trending');

  if (isNewsApi) {
    const networkResponse = fetch(request);
    event.waitUntil(networkResponse.then((response) => cacheNewsResponse(request, response)).catch(() => {}));
    event.respondWith(
      networkResponse.catch(async () => {
        const cached = await caches.match(request);
        return cached || new Response(JSON.stringify({
          message: 'This edition is not available offline yet. Open Mwangaza Wire while connected to save the latest stories.',
        }), {
          status: 503,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }),
    );
    return;
  }

  if (url.origin === self.location.origin && request.mode === 'navigate') {
    const networkResponse = fetch(request);
    event.waitUntil(networkResponse.then((response) => {
      if (response.ok) {
        return caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', response.clone()));
      }
    }).catch(() => {}));
    event.respondWith(
      networkResponse.catch(() => caches.match('/index.html')),
    );
    return;
  }

  if (request.destination === 'image' && url.origin !== self.location.origin) {
    const cachedImage = caches.match(request);
    const imageResponse = cachedImage.then((cached) => cached || fetch(request));
    event.waitUntil(imageResponse.then((response) => {
      if (response.type === 'opaque' || response.ok) {
        return cachePublisherImage(request, response);
      }
    }).catch(() => {}));
    event.respondWith(
      imageResponse.catch(() => caches.match(request)),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  const cachedResponse = caches.match(request);
  const networkResponse = cachedResponse.then((cached) => cached || fetch(request));
  event.waitUntil(networkResponse.then((response) => {
    if (response.ok) {
      return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    }
  }).catch(() => {}));
  event.respondWith(
    networkResponse,
  );
});