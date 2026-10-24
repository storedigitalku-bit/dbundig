export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data, error } = await user.db.from('owner_mappings').delete().eq('id', id).select('id').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound()
  await audit(user, 'mapping.delete', id)
  return { ok: true }
})
