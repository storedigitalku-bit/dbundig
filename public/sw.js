/* MDUNDIG service worker — hanya untuk push notification & membuka halaman saat notifikasi diklik.
   Sengaja TANPA handler fetch/cache: data dashboard selalu diambil langsung dari server (tidak ada data basi/offline). */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'MDUNDIG', body: event.data ? event.data.text() : '' } }
  const title = typeof data.title === 'string' && data.title ? data.title : 'MDUNDIG'
  const link = typeof data.link === 'string' && data.link.startsWith('/') && !data.link.startsWith('//') ? data.link : '/notifikasi'
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: link,
    data: { link },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.link) || '/notifikasi', self.location.origin).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(target).catch(() => {})
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
