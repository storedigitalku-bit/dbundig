import type { H3Event } from 'h3'
import { handleIntegration, type Module } from '../lib/integration'

/** Adapter h3 → handler integrasi murni. Respons selalu JSON, tanpa redirect, no-store. */
export async function integrationRoute(event: H3Event, module: Module) {
  const config = useRuntimeConfig()
  const method = event.method.toUpperCase()
  const rawBody = method === 'POST' ? await readRawBody(event, 'utf8').catch(() => undefined) : undefined
  const headers: Record<string, string | undefined> = {
    authorization: getHeader(event, 'authorization'),
    'content-type': getHeader(event, 'content-type'),
  }
  const result = await handleIntegration(module, { method, headers, rawBody }, {
    rpc: await useServiceRpc(),
    tokenHashSecret: config.tokenHashSecret,
    rateLimitPerMinute: Number(config.integrationRateLimit) || 1200,
    // Log operasional tanpa token, payload, nama tamu, atau nomor WhatsApp.
    log: (entry) => console.info(JSON.stringify({ scope: 'integration', ...entry })),
  })
  setResponseStatus(event, result.status)
  setResponseHeaders(event, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'x-content-type-options': 'nosniff',
  })
  if (result.status === 405) setResponseHeader(event, 'allow', 'POST')
  // Push notification untuk order / reservasi baru (bukan duplikat). Dikirim setelah respons; tidak memperlambat plugin.
  const data = (result.body as { data?: Record<string, unknown> | null } | null)?.data
  const push = module === 'form_order' && result.status === 201 && typeof data?.order_id === 'string'
    ? pushForNotifications({ order_id: data.order_id })
    : module === 'daftar_hadiah' && typeof data?.reservation_id === 'string' && data.already_reserved !== true
      ? pushForNotifications({ reservation_id: data.reservation_id })
      : null
  if (push) {
    const task = push.catch((err) => console.error(JSON.stringify({ scope: 'push', message: String((err as Error)?.message ?? err).slice(0, 120) })))
    if (event.waitUntil) event.waitUntil(task)
    else await task
  }
  return result.body
}
