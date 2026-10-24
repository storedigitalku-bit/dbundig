import { displayValue, groupOrderEntries, isEmptyValue, type OrderMeta } from '../../shared/orderSections'
import type { ReportCard, ReportColumn, ReportMeta } from './pdf'

/** Nomor WhatsApp tersimpan (62…) → format lokal yang mudah dibaca: 0812-3456-7890. */
export function formatWhatsapp(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const local = digits.startsWith('62') ? '0' + digits.slice(2) : digits
  if (local.length < 9) return local
  return `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`
}

const human = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
/** Waktu WIB untuk dibaca manusia: "16 Okt 2026, 16.00". */
export function formatWibHuman(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : human.format(d).replace(/\s+pukul\s+/, ', ')
}

export interface ReservationExportRow {
  invitation_title: string | null; gift_name: string; guest_name: string; guest_whatsapp: string
  quantity: number; message: string | null; created_at: string; status: string
}

export const statusLabel = (s: string) => (s === 'confirmed' ? 'Terkonfirmasi' : 'Dibatalkan')

/** Isi laporan PDF reservasi: ringkasan + tabel. Kolom Undangan disembunyikan bila laporan untuk satu undangan. */
export function reservationPdfParts(rows: ReservationExportRow[], opts: { generatedAt: string; invitationTitle?: string | null; filters?: string[] }) {
  const single = !!opts.invitationTitle
  const confirmed = rows.filter((r) => r.status === 'confirmed')
  const meta: ReportMeta = {
    title: single ? `Laporan Reservasi — ${opts.invitationTitle}` : 'Laporan Reservasi Daftar Hadiah',
    subtitle: [single ? 'Satu undangan' : 'Semua undangan yang dapat Anda akses', ...(opts.filters ?? [])].join(' · '),
    generatedAt: opts.generatedAt,
    stats: [
      { label: 'Total reservasi', value: String(rows.length) },
      { label: 'Terkonfirmasi', value: String(confirmed.length) },
      { label: 'Dibatalkan', value: String(rows.length - confirmed.length) },
      { label: 'Hadiah dipesan', value: String(confirmed.reduce((n, r) => n + Number(r.quantity || 0), 0)) },
    ],
  }
  const columns: ReportColumn[] = [
    { header: 'No', width: 26, align: 'right', muted: true },
    ...(single ? [] : [{ header: 'Undangan', width: 112 }]),
    { header: 'Hadiah', width: 112, strong: true },
    { header: 'Tamu', width: 100 },
    { header: 'WhatsApp', width: 90 },
    { header: 'Jml', width: 30, align: 'right' as const },
    { header: 'Pesan', width: single ? 214 : 160 },
    { header: 'Waktu (WIB)', width: 108 },
    { header: 'Status', width: 100, status: true },
  ]
  const body = rows.map((r, i) => [
    String(i + 1),
    ...(single ? [] : [r.invitation_title || 'Tanpa judul']),
    r.gift_name, r.guest_name, formatWhatsapp(r.guest_whatsapp), String(r.quantity), (r.message ?? '').trim(),
    formatWibHuman(r.created_at), statusLabel(r.status),
  ])
  return { meta, columns, rows: body }
}

export interface OrderExportRow {
  created_at: string; post_title: string; post_id: number | null; status: string; site: string
  fields: Record<string, unknown>; labels: Record<string, string>; meta?: OrderMeta | null
}
export const ORDER_STATUS: Record<string, string> = { baru: 'Baru', diproses: 'Diproses', selesai: 'Selesai', batal: 'Batal' }

/** Satu kartu per order; isi dikelompokkan per bagian (Pemesan, Pria, Wanita, …), field kosong dilewati. */
export function orderCards(orders: OrderExportRow[]): ReportCard[] {
  return orders.map((o, i) => {
    const entries = Object.keys(o.fields).map((key) => ({ key, label: o.labels[key] || key, value: o.fields[key] as string | string[] }))
    const sections = groupOrderEntries(entries, o.meta)
      .map((s) => ({ title: s.title, fields: s.fields.filter((f) => !isEmptyValue(f.value)).map((f) => ({ label: f.group ? `${f.group} — ${f.field}` : f.field, value: displayValue(f.value) })) }))
      .filter((s) => s.fields.length)
    return {
      title: `${i + 1}. ${o.post_title || (o.post_id ? `Post #${o.post_id}` : 'Order manual')}`,
      meta: [formatWibHuman(o.created_at) + ' WIB', o.site].filter(Boolean).join(' · '),
      status: ORDER_STATUS[o.status] ?? o.status,
      sections,
    }
  })
}
