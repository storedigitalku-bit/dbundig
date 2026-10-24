const dateTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })
const dateOnly = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' })
const number = new Intl.NumberFormat('id-ID')

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : `${dateTime.format(d)} WIB`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : dateOnly.format(d)
}

export function formatNumber(value: number | null | undefined): string {
  return number.format(value ?? 0)
}

export function fieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

/** Waktu relatif singkat untuk notifikasi: "baru saja", "5 mnt lalu", "2 jam lalu", "kemarin", lalu tanggal. */
export function timeAgo(value: string | null | undefined, now = Date.now()): string {
  if (!value) return ''
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`
  if (s < 172800) return 'kemarin'
  return formatDate(value)
}
