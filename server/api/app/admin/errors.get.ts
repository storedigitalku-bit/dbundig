// Log error server & browser (30 hari terakhir; RLS khusus admin).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { page, size, from, to } = pageParams(event, 30)
  const query = getQuery(event)
  let request = user.db.from('error_logs').select('id, source, status, path, message, detail, user_id, created_at', { count: 'exact' })
  if (query.source === 'server' || query.source === 'client') request = request.eq('source', query.source)
  const { data, error, count } = await request.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
  if (error) throw dbError(error)
  return { items: data ?? [], total: count ?? 0, page, per_page: size }
})
