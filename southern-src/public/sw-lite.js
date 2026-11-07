/* Southern Command offline service worker (single-file demo build). Network-first for the app, cache fallback when there is no signal. */
const C = 'sc-offline-v1'
const CORE = ['./', './index.html', './manifest.webmanifest', './arrowline-192.png', './arrowline-512.png', './arrowline.svg', './hero-wind.jpg']
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting() })
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return
  const u = new URL(r.url)
  if (u.origin === location.origin && /\/g\//.test(u.pathname)) return // the guest-only page is never cached by (or served from) the owner app's worker
  if (r.mode === 'navigate' || (u.origin === location.origin)) {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(r.mode === 'navigate' ? './index.html' : r, cp)) } return res }).catch(() => caches.match(r.mode === 'navigate' ? './index.html' : r).then(m => m || caches.match('./'))))
    return
  }
  if (/open-meteo|arcgisonline|tile/.test(u.host)) e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(r, cp)); return res }).catch(() => caches.match(r)))
})
