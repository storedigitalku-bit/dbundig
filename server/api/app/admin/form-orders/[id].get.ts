export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data, error } = await user.db.from('form_orders')
    .select('id, website_id, request_id, post_id, post_title, document_id, element_id, fields, labels, meta, status, admin_note, source, created_at, updated_at, websites(name, site_url)')
    .eq('id', id).maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound()
  const fields = (data.fields ?? {}) as Record<string, string | string[]>
  const labels = (data.labels ?? {}) as Record<string, string>
  return {
    id: data.id, website: data.websites, post_id: data.post_id, post_title: data.post_title, document_id: data.document_id,
    element_id: data.element_id, request_id: data.request_id, created_at: data.created_at, updated_at: data.updated_at,
    website_id: data.website_id, status: data.status, admin_note: data.admin_note, source: data.source,
    entries: Object.keys(fields).map((key) => ({ key, label: labels[key] || key, value: fields[key] })),
    meta: data.meta ?? {},
  }
})
