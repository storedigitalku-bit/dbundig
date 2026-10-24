// Ubah label token (admin). Nilai token tidak pernah dapat diubah/dibaca; gunakan rotasi.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  const label = typeof body.label === 'string' ? body.label.trim() : null
  if (label === null || label.length > 80) throw badRequest('Label maksimal 80 karakter.')
  const { data, error } = await user.db.from('website_tokens').update({ label }).eq('id', id).select('id').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound()
  await audit(user, 'token.update', id)
  return { ok: true }
})
