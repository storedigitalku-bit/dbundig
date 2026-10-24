import { formatWib, toCsv } from '../../../lib/csv'
import { formatWhatsapp, statusLabel } from '../../../lib/reports'

// CSV Daftar Hadiah: hanya scope yang diizinkan RLS untuk pengguna ini.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = (await fetchReservationsForExport(event, user)).map((r) => [
    r.invitation_title, r.gift_name, r.guest_name, formatWhatsapp(r.guest_whatsapp), r.quantity, r.message,
    formatWib(String(r.created_at)), statusLabel(r.status),
  ])
  const csv = toCsv(['Judul undangan', 'Nama hadiah', 'Nama tamu', 'WhatsApp', 'Jumlah', 'Pesan', 'Waktu (WIB)', 'Status'], rows)
  const stamp = new Date().toISOString().slice(0, 10)
  return sendCsv(event, `daftar-hadiah-reservasi-${stamp}.csv`, csv)
})
