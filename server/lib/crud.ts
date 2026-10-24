/** Helper murni untuk CRUD admin (dapat diuji tanpa Nuxt). */
import { RE, cpLength } from './contract'

/** Normalisasi WhatsApp sama seperti plugin — satu sumber di shared/whatsapp (dipakai juga dashboard). */
export { normalizeWhatsapp } from '../../shared/whatsapp'

export interface OrderEntry { key?: string; label: string; value: string | string[] }

function slug(label: string): string {
  const s = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  return s || 'field'
}

/** Susun fields/labels JSONB dari daftar isian admin. Key lama dipertahankan; key baru dibuat dari label. */
export function buildOrderFields(entries: unknown): { fields: Record<string, string | string[]>; labels: Record<string, string> } | string {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 200) return 'Isi minimal 1 dan maksimal 200 field.'
  const fields: Record<string, string | string[]> = {}
  const labels: Record<string, string> = {}
  for (const raw of entries as unknown[]) {
    const e = raw as Partial<OrderEntry>
    const label = typeof e.label === 'string' ? e.label.trim() : ''
    if (!label || cpLength(label) > 500) return 'Setiap field wajib memiliki label (maksimal 500 karakter).'
    let value: string | string[]
    if (Array.isArray(e.value)) {
      if (e.value.length > 50 || e.value.some((v) => typeof v !== 'string' || cpLength(v) > 512)) return `Isi field "${label}" tidak valid.`
      value = (e.value as string[]).map((v) => v.trim()).filter(Boolean)
    } else if (typeof e.value === 'string') {
      if (cpLength(e.value) > 4000) return `Isi field "${label}" terlalu panjang.`
      value = e.value.trim()
    } else {
      return `Isi field "${label}" tidak valid.`
    }
    let key = typeof e.key === 'string' && RE.fieldKey.test(e.key) ? e.key : slug(label)
    if (key in fields) {
      let i = 2
      while (`${key}_${i}` in fields) i++
      key = `${key}_${i}`
    }
    fields[key] = value
    labels[key] = label
  }
  return { fields, labels }
}

export const ORDER_STATUSES = ['baru', 'diproses', 'selesai', 'batal'] as const

/** Pesan ramah untuk kode error fungsi database. */
export const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  gift_unavailable: { status: 409, message: 'Stok hadiah habis atau hadiah tidak aktif.' },
  duplicate_guest: { status: 409, message: 'Nomor WhatsApp ini sudah memesan hadiah yang sama.' },
  invalid_request: { status: 422, message: 'Data tidak valid. Periksa nama (maks. 100), WhatsApp, dan pesan (maks. 1000).' },
  not_found: { status: 404, message: 'Data tidak ditemukan.' },
  forbidden: { status: 403, message: 'Anda tidak memiliki akses.' },
}
