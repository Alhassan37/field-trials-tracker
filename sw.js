/* Service Worker — تشغيل التطبيق أوفلاين */
const VERSION = 'ft-v1.0.1';
const SHELL = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
const RUNTIME = 'ft-runtime';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('script.google') || url.hostname.includes('googleusercontent')) return; // API: always network
  if (url.origin === location.origin) {
    // App shell: network-first (عشان التحديثات توصل) مع رجوع للكاش أوفلاين
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  // Fonts / CDN: stale-while-revalidate
  e.respondWith(caches.open(RUNTIME).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
