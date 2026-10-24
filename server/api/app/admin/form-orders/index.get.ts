import { filledCount, orderSummary, type OrderEntry, type OrderMeta } from '../../../../../shared/orderSections'

// Form Order — khusus admin platform (requireAdmin + RLS admin-only).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { page, size, from, to } = pageParams(event)
  const query = getQuery(event)
  let request = user.db.from('form_orders')
    .select('id, website_id, post_id, post_title, element_id, fields, labels, meta, status, source, created_at, websites(name)', { count: 'exact' })
  const website = optionalUuid(query.website)
  if (website) request = request.eq('website_id', website)
  const pattern = searchPattern(query.q)
  if (pattern) request = request.ilike('search_text', pattern)
  if (typeof query.status === 'string' && ['baru', 'diproses', 'selesai', 'batal'].includes(query.status)) request = request.eq('status', query.status)
  const { data, error, count } = await request.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
  if (error) throw dbError(error)
  return {
    items: (data ?? []).map((o) => {
      const fields = (o.fields ?? {}) as Record<string, unknown>
      const labels = (o.labels ?? {}) as Record<string, string>
      const entries: OrderEntry[] = Object.keys(fields).map((key) => ({ key, label: labels[key] || key, value: fields[key] as string | string[] }))
      return {
        id: o.id, website_id: o.website_id, website_name: (o.websites as { name?: string } | null)?.name ?? '', post_id: o.post_id, post_title: o.post_title,
        status: o.status, source: o.source, created_at: o.created_at,
        summary: orderSummary(entries, 3, o.meta as OrderMeta | null), field_count: entries.length, filled_count: filledCount(entries),
      }
    }),
    total: count ?? 0, page, per_page: size,
  }
})
