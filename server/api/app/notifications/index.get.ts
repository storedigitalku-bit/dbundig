// Notifikasi milik pengguna yang masuk (RLS: hanya miliknya sendiri). Filter: unread=1, kind=order|reservation.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { page, size, from, to } = pageParams(event, 20)
  const query = getQuery(event)
  let request = user.db.from('notifications')
    .select('id, kind, title, body, link, read_at, created_at', { count: 'exact' })
  if (query.unread === '1') request = request.is('read_at', null)
  if (query.kind === 'order' || query.kind === 'reservation') request = request.eq('kind', query.kind)
  const { data, error, count } = await request.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
  if (error) throw dbError(error)
  const unread = await user.db.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (unread.error) throw dbError(unread.error)
  return { items: data ?? [], total: count ?? 0, page, per_page: size, unread: unread.count ?? 0 }
})
