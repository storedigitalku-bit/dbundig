import { validPushEndpoint, validPushKey } from '../../../lib/pushEndpoint'

// Daftarkan perangkat ini untuk push notification (akun yang sedang masuk).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!pushEnabled()) throw createError({ statusCode: 503, statusMessage: 'push_disabled', data: { message: 'Notifikasi ponsel belum diaktifkan di server.' } })
  const body = await readJson(event)
  const keys = (body.keys ?? {}) as Record<string, unknown>
  const endpoint = validPushEndpoint(body.endpoint)
  const p256dh = validPushKey(keys.p256dh, 200)
  const auth = validPushKey(keys.auth, 100)
  if (!endpoint || !p256dh || !auth) throw badRequest('Data langganan notifikasi tidak valid.')
  const service = useServiceClient()
  if (!service) throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'Konfigurasi server belum lengkap.' } })
  // Satu endpoint = satu perangkat; bila perangkat dipakai akun lain, pemiliknya berpindah ke akun yang sedang masuk.
  const { error } = await service.from('push_subscriptions').upsert({
    user_id: user.id, endpoint, p256dh, auth, user_agent: (getHeader(event, 'user-agent') ?? '').slice(0, 300),
  }, { onConflict: 'endpoint' })
  if (error) throw dbError(error)
  setResponseStatus(event, 201)
  return { ok: true }
})
