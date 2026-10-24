export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const columns = user.isAdmin
    ? 'id, website_id, website_name, wp_post_id, title, owner_external_id, registry_count, gift_count, reservation_count, mapped_user_count, access_count, created_at, updated_at'
    : 'id, website_name, title, gift_count, reservation_count, created_at, updated_at'
  const { data: invitation, error } = await user.db.from('invitation_overview').select(columns).eq('id', id).maybeSingle()
  if (error) throw dbError(error)
  if (!invitation) throw notFound()
  const registries = await user.db.from('registries')
    .select('id, registry_key, document_id, element_id, catalog_version, updated_at')
    .eq('invitation_id', id).order('created_at')
  if (registries.error) throw dbError(registries.error)
  const gifts = await user.db.from('gift_stock')
    .select('id, registry_id, gift_key, name, description, image_url, purchase_url, initial_quantity, capacity, manual_status, active, position, reserved_quantity, available_quantity')
    .eq('invitation_id', id).order('active', { ascending: false }).order('position')
  if (gifts.error) throw dbError(gifts.error)
  // Gambar http:// dilewatkan proksi bertanda tangan agar tetap tampil di dashboard HTTPS.
  return { invitation, registries: registries.data, gifts: proxyImages(gifts.data ?? []) }
})
