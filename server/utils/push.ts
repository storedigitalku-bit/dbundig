import webpush from 'web-push'

// Push notification ke ponsel/komputer (Web Push + VAPID). Opsional: tanpa kunci VAPID semua fungsi diam (no-op).
let configured: boolean | null = null

export function pushEnabled(): boolean {
  if (configured !== null) return configured
  const c = useRuntimeConfig()
  if (!c.public.vapidPublicKey || !c.vapidPrivateKey || !c.vapidSubject) return (configured = false)
  try {
    webpush.setVapidDetails(c.vapidSubject, c.public.vapidPublicKey, c.vapidPrivateKey)
    configured = true
  } catch (err) {
    console.error(JSON.stringify({ scope: 'push', step: 'vapid', message: (err as Error).message.slice(0, 120) }))
    configured = false
  }
  return configured
}

/**
 * Kirim push untuk notifikasi yang baru dibuat trigger database (order / reservasi). Hanya judul, ringkasan, dan
 * tautan halaman yang dikirim. Langganan yang sudah tidak berlaku (404/410) dihapus.
 */
export async function pushForNotifications(filter: { order_id?: string; reservation_id?: string }): Promise<void> {
  if (!pushEnabled()) return
  const service = useServiceClient()
  if (!service) return
  let query = service.from('notifications').select('user_id, title, body, link')
  query = filter.order_id ? query.eq('order_id', filter.order_id) : query.eq('reservation_id', filter.reservation_id ?? '')
  const { data: notes } = await query.limit(200)
  if (!notes?.length) return
  const { data: subs } = await service.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', [...new Set(notes.map((n) => n.user_id))]).limit(500)
  await Promise.all((subs ?? []).map(async (s) => {
    const note = notes.find((n) => n.user_id === s.user_id)
    if (!note) return
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: note.title, body: note.body ?? '', link: note.link ?? '/notifikasi' }), { TTL: 3600, timeout: 5000 })
      await service.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await service.from('push_subscriptions').delete().eq('id', s.id)
      else console.error(JSON.stringify({ scope: 'push', step: 'send', status: status ?? null }))
    }
  }))
}
