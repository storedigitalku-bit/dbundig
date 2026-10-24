export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data, error } = await user.db.from('form_orders').delete().eq('id', id).select('id').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound()
  await audit(user, 'order.delete', id)
  return { ok: true }
})
