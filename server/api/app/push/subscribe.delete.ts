// Berhenti menerima push di perangkat ini (hanya langganan milik akun sendiri; RLS).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readJson(event)
  if (typeof body.endpoint !== 'string' || body.endpoint.length > 1000) throw badRequest('Endpoint tidak valid.')
  const { error } = await user.db.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  if (error) throw dbError(error)
  return { ok: true }
})
