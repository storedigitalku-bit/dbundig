export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const query = getQuery(event)
  let request = user.db.from('owner_mappings')
    .select('id, website_id, external_owner_id, user_id, created_at, websites(name), profiles!owner_mappings_user_id_fkey(username, email, display_name)')
  const website = optionalUuid(query.website)
  if (website) request = request.eq('website_id', website)
  const { data, error } = await request.order('created_at', { ascending: false }).limit(500)
  if (error) throw dbError(error)
  return { items: data ?? [] }
})
