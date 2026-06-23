// Service Worker — Pilot Logbook
const CACHE = 'logbook-v84'
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
  './js/pages/dashboard.js',
  './js/pages/settings.js',
  './js/pages/roster.js',
  './js/pages/crew-detail.js',
  './js/pages/airplane-detail.js',
  './js/ui/nav-icons.js',
  './js/utils/time.js',
  './js/utils/nighttime.js',
  './js/data/fleet.js',
  './js/data/airports.js',
  './js/data/airlines.js',
  './js/data/countries.js',
  './tools/import.html',
]

// Dev mode：localhost 完全不快取
const IS_DEV = self.location.hostname === 'localhost'
            || self.location.hostname === '127.0.0.1'

self.addEventListener('install', e => {
  console.log(`[SW] Installing ${CACHE}${IS_DEV ? ' (DEV — no cache)' : ''}...`)
  if (IS_DEV) { self.skipWaiting(); return }
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  console.log(`[SW] Activating ${CACHE}...`)
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // 新 SW 接管後，通知所有已開啟頁面重新整理以載入新版
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE }))
        })
      })
  )
})

self.addEventListener('fetch', e => {
  // Dev mode：全走 network，不經快取
  if (IS_DEV) {
    e.respondWith(fetch(e.request))
    return
  }

  const url = new URL(e.request.url)

  // Firebase / Google 請求：完全不攔截
  if (url.hostname.includes('firebase') || url.hostname.includes('google') ||
      url.hostname.includes('gstatic')) {
    return
  }

  // Stale-while-revalidate：先回傳快取（快速），同時背景更新
  // 下次開啟即為新版，並透過 SW_UPDATED 訊息強制重載
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(res => {
          if (res.ok && e.request.method === 'GET') {
            cache.put(e.request, res.clone())
          }
          return res
        }).catch(() => cached)
        return cached || networkFetch
      })
    )
  )
})
