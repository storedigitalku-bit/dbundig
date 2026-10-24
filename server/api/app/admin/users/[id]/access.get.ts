// Undangan yang diberikan secara eksplisit ke satu akun (khusus admin).
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data, error } = await admin.db.from('invitation_access').select('invitation_id').eq('user_id', id).limit(5000)
  if (error) throw dbError(error)
  return { invitation_ids: (data ?? []).map((r) => r.invitation_id as string) }
})
