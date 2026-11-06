/* Retro Board — shell offline cache. Mic/record needs HTTPS + live page. */
const CACHE = 'retro-board-v10';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=10',
  './js/app.js?v=10',
  './js/db.js?v=10',
  './js/audio.js?v=10',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './sounds/applause.mp3',
  './sounds/boing.mp3',
  './sounds/cha-ching.mp3',
  './sounds/crickets.mp3',
  './sounds/dj-airhorn.mp3',
  './sounds/drum-roll.mp3',
  './sounds/dun-dun-dunnn.mp3',
  './sounds/error-ding.mp3',
  './sounds/explosion.mp3',
  './sounds/get-to-the-choppa.mp3',
  './sounds/laugh-track.mp3',
  './sounds/metal-pipe.mp3',
  './sounds/pew-pew.mp3',
  './sounds/record-scratch.mp3',
  './sounds/rick-roll.mp3',
  './sounds/rimshot.mp3',
  './sounds/sad-trombone.mp3',
  './sounds/surprise.mp3',
  './sounds/suspense-riser.mp3',
  './sounds/to-the-windows.mp3',
  './sounds/train-horn.mp3',
  './sounds/vine-boom.mp3',
  './sounds/wanna-be-ninja.mp3',
  './sounds/whip.mp3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  if (req.headers.has('range')) return; // let media range requests hit the network
  // network-first so updates ship immediately; cache is the offline fallback
  e.respondWith(
    // bypass the browser HTTP cache so a deploy never mixes old and new files
    (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' })).then((res) => {
      if (res.ok && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
