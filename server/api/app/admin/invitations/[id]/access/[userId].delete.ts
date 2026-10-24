export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const userId = uuidParam(getRouterParam(event, 'userId'), 'userId')
  const { data, error } = await user.db.from('invitation_access').delete()
    .eq('invitation_id', id).eq('user_id', userId).select('user_id').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound()
  await audit(user, 'access.revoke', id, { user_id: userId })
  return { ok: true }
})
