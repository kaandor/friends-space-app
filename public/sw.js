/* Friends Space - Service Worker
   Responsavel por receber Push Notifications (chamadas, mensagens) mesmo com
   o navegador fechado, e abrir o app ao clicar na notificacao. */
const CACHE_NAME = 'friends-space-shell-v1'
const CACHE_PREFIX = 'friends-space-shell-'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(['/', '/index.html'])
    } catch { }
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))
    } catch { }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  let url
  try { url = new URL(request.url) } catch { return }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname === '/version.json' || url.pathname === '/sw.js') return
  if (request.headers.has('range') || request.destination === 'video' || request.destination === 'audio') return
  if (/\.(?:mp4|webm|mkv|mov|mp3|wav|ogg|pdf)$/i.test(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put('/index.html', fresh.clone())
        }
        return fresh
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached) {
      fetch(request).then(async (fresh) => {
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, fresh.clone())
        }
      }).catch(() => { })
      return cached
    }
    const fresh = await fetch(request)
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, fresh.clone()).catch(() => { })
    }
    return fresh
  })())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    try {
      data = { body: event.data ? event.data.text() : '' }
    } catch { }
  }
  const title = data.title || 'Friends Space'
  const options = {
    body: data.body || '',
    icon: data.icon || '/Logo.png',
    badge: data.badge || '/favicon.png',
    tag: data.tag || 'fs-' + Date.now(),
    renotify: Boolean(data.renotify),
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const target = new URL(url, self.location.origin).href
    for (const client of all) {
      if ('focus' in client) {
        // Se o app ja esta na URL alvo, apenas foca — navegar recarregaria
        // a pagina e perderia o estado atual (ex.: call em andamento).
        if (client.url === target || new URL(client.url).pathname === new URL(target).pathname) {
          return client.focus()
        }
        try { await client.navigate(target) } catch { }
        return client.focus()
      }
    }
    return self.clients.openWindow(target)
  })())
})
