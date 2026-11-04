// Krapo Kwizz — fonctionnement hors connexion.
// Augmentez VERSION à chaque modification du code (css/js/html) pour forcer la mise à jour.
const VERSION = 'kk-app-v20';
const MEDIA = 'kk-media-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/social.js', 'data/especes.csv', 'data/ambiances.csv', 'manifest.webmanifest',
  'assets/icon-kk-192.png', 'assets/icon-kk-512.png', 'assets/logo-kk-noir.png', 'assets/logo-kk-blanc.png', 'assets/mark-kk-noir.png', 'assets/mark-kk-blanc.png',
  'assets/fonts/nunito-latin-400-normal.woff2', 'assets/fonts/nunito-latin-400-italic.woff2', 'assets/fonts/nunito-latin-600-normal.woff2',
  'assets/fonts/nunito-latin-600-italic.woff2', 'assets/fonts/nunito-latin-700-normal.woff2', 'assets/fonts/nunito-latin-800-normal.woff2',
  'assets/fonts/barlow-condensed-latin-600-normal.woff2', 'assets/fonts/barlow-condensed-latin-700-normal.woff2'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isMedia = /\/(sons|photos|cartes)\//.test(url.pathname);
  if (isMedia) {
    // sons et photos : cache d'abord (ils changent rarement de nom)
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(MEDIA).then(c => c.put(e.request, copy)); }
      return r;
    })));
    return;
  }
  // appli et données : réseau d'abord (pour recevoir les mises à jour), cache si hors connexion
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
