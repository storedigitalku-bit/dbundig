import { renderCardReport } from '../../../../lib/pdf'
import { ORDER_STATUS, orderCards } from '../../../../lib/reports'

// Laporan PDF Order Undangan (khusus admin): satu kartu per order, isi dikelompokkan per bagian.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const query = getQuery(event)
  const orders = await fetchOrdersForExport(event, user)
  const count = (s: string) => String(orders.filter((o) => o.status === s).length)
  const filters: string[] = []
  if (typeof query.status === 'string' && ORDER_STATUS[query.status]) filters.push(`Status: ${ORDER_STATUS[query.status]}`)
  if (optionalUuid(query.website) && orders[0]?.site) filters.push(`Website: ${orders[0].site}`)
  if (typeof query.q === 'string' && query.q.trim()) filters.push(`Pencarian: "${query.q.trim().slice(0, 60)}"`)
  const pdf = await renderCardReport(await reportFonts(), {
    title: 'Laporan Order Undangan',
    subtitle: filters.length ? filters.join(' · ') : 'Semua order',
    generatedAt: generatedStamp(),
    stats: [
      { label: 'Total order', value: String(orders.length) },
      { label: 'Baru', value: count('baru') }, { label: 'Diproses', value: count('diproses') }, { label: 'Selesai', value: count('selesai') },
    ],
  }, orderCards(orders), 'Belum ada order untuk filter ini.')
  return sendPdf(event, `laporan-order-undangan-${new Date().toISOString().slice(0, 10)}.pdf`, pdf)
})
