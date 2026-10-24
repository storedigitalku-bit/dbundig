export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data, error } = await user.db.from('website_tokens')
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq('id', id).is('revoked_at', null).select('id').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound('Token tidak ditemukan atau sudah dicabut.')
  await audit(user, 'token.revoke', id)
  return { ok: true }
})
