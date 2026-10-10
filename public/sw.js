/* Friends Space - Service Worker
   Responsavel por receber Push Notifications (chamadas, mensagens) mesmo com
   o navegador fechado, e abrir o app ao clicar na notificacao. */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim()
    // Limpa caches antigos se algum dia usarmos cache.
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
