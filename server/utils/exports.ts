import type { H3Event } from 'h3'
import type { SessionUser } from './supabase'
import type { OrderExportRow, ReservationExportRow } from '../lib/reports'
import type { ReportFonts } from '../lib/pdf'

const CHUNK = 1000
const MAX_ROWS = 50_000

/** Semua reservasi sesuai filter halaman (RLS membatasi ke undangan yang boleh diakses pengguna). */
export async function fetchReservationsForExport(event: H3Event, user: SessionUser): Promise<ReservationExportRow[]> {
  const rows: ReservationExportRow[] = []
  for (let from = 0; from < MAX_ROWS; from += CHUNK) {
    const { data, error } = await reservationQuery(event, user,
      'invitation_title, gift_name, guest_name, guest_whatsapp, quantity, message, created_at, status')
      .range(from, from + CHUNK - 1)
    if (error) throw dbError(error)
    rows.push(...((data ?? []) as unknown as ReservationExportRow[]))
    if (!data || data.length < CHUNK) break
  }
  return rows
}

/** Semua Order Undangan sesuai filter halaman (dipanggil setelah requireAdmin). */
export async function fetchOrdersForExport(event: H3Event, user: SessionUser): Promise<Array<OrderExportRow & { request_id: string }>> {
  const query = getQuery(event)
  const website = optionalUuid(query.website)
  const pattern = searchPattern(query.q)
  const status = typeof query.status === 'string' && ['baru', 'diproses', 'selesai', 'batal'].includes(query.status) ? query.status : null
  const orders: Array<OrderExportRow & { request_id: string }> = []
  for (let from = 0; from < MAX_ROWS; from += CHUNK) {
    let request = user.db.from('form_orders').select('created_at, post_id, post_title, request_id, status, fields, labels, meta, websites(name)')
    if (website) request = request.eq('website_id', website)
    if (status) request = request.eq('status', status)
    if (pattern) request = request.ilike('search_text', pattern)
    const { data, error } = await request.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + CHUNK - 1)
    if (error) throw dbError(error)
    for (const o of data ?? []) {
      orders.push({
        created_at: o.created_at, post_title: o.post_title, post_id: o.post_id, request_id: o.request_id, status: o.status,
        fields: (o.fields ?? {}) as Record<string, unknown>, labels: (o.labels ?? {}) as Record<string, string>, meta: (o.meta ?? {}) as OrderExportRow['meta'],
        site: (o.websites as { name?: string } | null)?.name ?? '',
      })
    }
    if (!data || data.length < CHUNK) break
  }
  return orders
}

/** Font Ubuntu untuk PDF dari server assets (server/assets/fonts). */
export async function reportFonts(): Promise<ReportFonts> {
  const storage = useStorage('assets:server')
  const [regular, medium] = await Promise.all([storage.getItemRaw('fonts:ubuntu-400.woff'), storage.getItemRaw('fonts:ubuntu-500.woff')])
  if (!regular || !medium) throw createError({ statusCode: 500, statusMessage: 'font_missing', data: { message: 'Font laporan tidak ditemukan di server.' } })
  return { regular: Buffer.from(regular as Uint8Array), medium: Buffer.from(medium as Uint8Array) }
}

const stampFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
/** Waktu pembuatan laporan, mis. "17 Okt 2026, 02.30 WIB". */
export const generatedStamp = () => `${stampFmt.format(new Date()).replace(/\s+pukul\s+/, ', ')} WIB`

export function sendPdf(event: H3Event, filename: string, pdf: Buffer) {
  setResponseHeaders(event, {
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'cache-control': 'no-store, max-age=0',
  })
  return pdf
}
