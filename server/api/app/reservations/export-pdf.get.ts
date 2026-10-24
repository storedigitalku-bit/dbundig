import { renderTableReport } from '../../../lib/pdf'
import { reservationPdfParts } from '../../../lib/reports'

// Laporan PDF reservasi (admin & pelanggan): filter sama dengan daftar; RLS membatasi ke undangan yang boleh diakses.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const query = getQuery(event)
  const rows = await fetchReservationsForExport(event, user)
  let invitationTitle: string | null = null
  const invitation = optionalUuid(query.invitation)
  if (invitation) {
    const { data, error } = await user.db.from('invitations').select('title').eq('id', invitation).maybeSingle()
    if (error) throw dbError(error)
    if (!data) throw notFound()
    invitationTitle = data.title || 'Tanpa judul'
  }
  const filters: string[] = []
  if (query.status === 'confirmed') filters.push('Status: Terkonfirmasi')
  if (query.status === 'cancelled') filters.push('Status: Dibatalkan')
  if (optionalUuid(query.gift) && rows[0]) filters.push(`Hadiah: ${rows[0].gift_name}`)
  if (typeof query.q === 'string' && query.q.trim()) filters.push(`Pencarian: "${query.q.trim().slice(0, 60)}"`)
  const parts = reservationPdfParts(rows, { generatedAt: generatedStamp(), invitationTitle, filters })
  const pdf = await renderTableReport(await reportFonts(), parts.meta, parts.columns, parts.rows, 'Belum ada reservasi untuk filter ini.')
  return sendPdf(event, `laporan-reservasi-${new Date().toISOString().slice(0, 10)}.pdf`, pdf)
})
