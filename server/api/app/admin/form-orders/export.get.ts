import { formatWib, toCsv } from '../../../../lib/csv'
import { ORDER_STATUS } from '../../../../lib/reports'
import { readableValue } from '../../../../../shared/orderSections'

// CSV Form Order khusus admin. Header = label field, key internal dipertahankan dalam kurung.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const orders = await fetchOrdersForExport(event, user)
  const keys: string[] = []
  const labelOf = new Map<string, string>()
  for (const o of orders) {
    for (const key of Object.keys(o.fields)) {
      if (!labelOf.has(key)) { keys.push(key); labelOf.set(key, o.labels[key] || key) }
    }
  }
  const header = ['Waktu (WIB)', 'Status', 'Website', 'Halaman', 'ID Post', 'ID Permintaan',
    ...keys.map((k) => (labelOf.get(k) === k ? k : `${labelOf.get(k)} (${k})`))]
  const rows = orders.map((o) => [formatWib(o.created_at), ORDER_STATUS[o.status] ?? o.status, o.site, o.post_title, o.post_id, o.request_id,
    // Nilai pilihan tampil sebagai teksnya (bila diketahui), sama dengan detail order & PDF.
    ...keys.map((k) => { const raw = o.fields[k]; if (raw === undefined || raw === null) return ''; const v = readableValue(k, raw as string | string[], o.meta); return Array.isArray(v) ? v.join(', ') : v })])
  return sendCsv(event, `order-undangan-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows))
})
