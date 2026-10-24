// Kalender acara (khusus admin): akad / resepsi / ngunduh mantu dari isi Order Undangan, rentang ≤ 400 hari.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const query = getQuery(event)
  const from = typeof query.from === 'string' && DATE_RE.test(query.from) ? query.from : null
  const to = typeof query.to === 'string' && DATE_RE.test(query.to) ? query.to : null
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw badRequest('Rentang tanggal tidak valid (YYYY-MM-DD).')
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (days < 0 || days > 400) throw badRequest('Rentang tanggal maksimal 400 hari.')
  const { data, error } = await user.db.from('order_events')
    .select('order_id, kind, event_date, event_time, address, maps, groom, bride, customer, post_title, status, source')
    .gte('event_date', from).lte('event_date', to)
    .order('event_date').order('event_time', { nullsFirst: false }).limit(1000)
  if (error) throw dbError(error)
  return { items: data ?? [] }
})
