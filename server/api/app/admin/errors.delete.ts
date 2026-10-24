// Kosongkan log error (khusus admin).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { error, count } = await user.db.from('error_logs').delete({ count: 'exact' }).gte('id', 0)
  if (error) throw dbError(error)
  return { deleted: count ?? 0 }
})
