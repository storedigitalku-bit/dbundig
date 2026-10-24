// Daftar undangan. RLS membatasi pelanggan ke undangan yang secara eksplisit menjadi haknya.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { page, size, from, to } = pageParams(event)
  const query = getQuery(event)
  const columns = user.isAdmin
    ? 'id, website_id, website_name, wp_post_id, title, owner_external_id, registry_count, gift_count, reservation_count, mapped_user_count, access_count, updated_at'
    : 'id, website_name, title, gift_count, reservation_count, updated_at'
  let request = user.db.from('invitation_overview').select(columns, { count: 'exact' })
  const pattern = searchPattern(query.q)
  if (pattern) request = request.ilike('search_title', pattern)
  if (user.isAdmin) {
    const website = optionalUuid(query.website)
    if (website) request = request.eq('website_id', website)
    if (query.unmapped === '1') request = request.eq('mapped_user_count', 0).eq('access_count', 0)
  }
  const { data, error, count } = await request.order('updated_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
  if (error) throw dbError(error)
  return { items: data ?? [], total: count ?? 0, page, per_page: size }
})
