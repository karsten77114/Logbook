// Service Worker — Pilot Logbook
const CACHE = 'logbook-v3'
const PRECACHE = [
  './',
  './index.html',
  './css/main.css',
  './js/app.js',
  './js/auth.js',
  './js/db.js',
  './js/config.js',
  './js/state.js',
  './js/pages/login.js',
  './js/pages/list.js',
  './js/pages/add.js',
  './js/pages/detail.js',
  './js/pages/settings.js',
  './js/utils/time.js',
  './js/utils/nighttime.js',
  './js/data/fleet.js',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Firebase / Google 請求：完全不攔截
  if (url.hostname.includes('firebase') || url.hostname.includes('google') ||
      url.hostname.includes('gstatic')) {
    return
  }

  // JS / CSS 檔案：Network-first（優先取得最新版，失敗才用快取）
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      }).catch(() => caches.match(e.request))
    )
    return
  }

  // 其他資源（HTML、圖片等）：Cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      return cached || networkFetch
    })
  )
})
