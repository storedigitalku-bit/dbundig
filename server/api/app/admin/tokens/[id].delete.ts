// Hapus token dari daftar (admin). Hanya token yang sudah dicabut (RLS juga memastikan).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data, error } = await user.db.from('website_tokens').delete().eq('id', id).not('revoked_at', 'is', null).select('id').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw createError({ statusCode: 409, statusMessage: 'active_token', data: { message: 'Cabut token terlebih dahulu sebelum menghapusnya.' } })
  await audit(user, 'token.delete', id)
  return { ok: true }
})
