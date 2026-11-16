// Offline cache: network first for page + playlist, cache first for media.
const CACHE = 'laas-screen';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isMedia = url.pathname.includes('/media/');

  // Range requests (video seeking) go straight to the network/cache body
  if (isMedia) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const key = url.origin + url.pathname;
      let res = await cache.match(key);
      if (!res) {
        try {
          const full = await fetch(key);
          if (full.ok) { await cache.put(key, full.clone()); res = full; }
          else return full;
        } catch (err) { return fetch(e.request); }
      }
      const range = e.request.headers.get('range');
      if (!range) return res;
      const buf = await res.arrayBuffer();
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : buf.byteLength - 1;
      return new Response(buf.slice(start, end + 1), {
        status: 206,
        headers: {
          'Content-Type': res.headers.get('Content-Type') || 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
          'Content-Length': String(end - start + 1),
          'Accept-Ranges': 'bytes'
        }
      });
    })());
    return;
  }

  // Page + playlist: network first, cache fallback
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = url.pathname.endsWith('playlist.json') ? 'playlist.json' : e.request;
    try {
      const res = await fetch(e.request);
      if (res.ok) await cache.put(key, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(key)) || Response.error();
    }
  })());
});
