/**
 * Penyusunan isi Order Undangan untuk tampilan manusia (murni, dipakai server & dashboard).
 * Label dari widget Form Order berpola "Pria: Nama Lengkap", "Akad — Waktu", "Nomor Rekening 1", dst.
 */
export interface OrderEntry { key: string; label: string; value: string | string[] }
/** `group` = sub-bagian di dalam satu bagian (mis. tiap cerita di "Cerita Cinta"). */
export interface OrderField extends OrderEntry { field: string; empty: boolean; group?: string }
export interface OrderSection { title: string; fields: OrderField[] }
/** Meta dari plugin versi baru: nama step per field & teks tampilan opsi pilihan (opsional). */
export interface OrderMeta { sections?: Record<string, string>; options?: Record<string, Record<string, string>> }

export const isEmptyValue = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)

export function displayValue(v: string | string[]): string {
  return Array.isArray(v) ? v.join(', ') : v
}

// Cerita Cinta dari widget: love_<cerita>_<title|date|story>. Label bawaannya terpecah ("Pertama Bertemu: Judul Perjalanan",
// "Tanggal Pertama Bertemu", "Cerita Pertama Bertemu") sehingga dulu tampil sebagai bagian terpisah + masuk "Lainnya".
// Kini semuanya satu bagian "Cerita Cinta", dikelompokkan per cerita dengan urutan kronologis.
// Jenis cerita baru dari builder widget (love_<nama>_*) ikut masuk; namanya diambil dari awalan label judulnya.
const LOVE_RE = /^love_(.+?)_(title|date|story)$/
const LOVE_STORY: Record<string, { name: string; rank: number }> = {
  meeting: { name: 'Pertama Bertemu', rank: 1 },
  engagement: { name: 'Pertunangan', rank: 2 },
  journey: { name: 'Menuju Pernikahan', rank: 3 },
}
const LOVE_FIELD: Record<string, { name: string; rank: number }> = { title: { name: 'Judul', rank: 0 }, date: { name: 'Tanggal', rank: 1 }, story: { name: 'Cerita', rank: 2 } }
export const LOVE_SECTION = 'Cerita Cinta'

const humanize = (s: string) => { const t = s.replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1) }

/** `names`: nama cerita untuk jenis yang tidak dikenal (dari label judul, mis. "Lamaran: Judul Perjalanan"). */
function loveStory(key: string, names?: Map<string, string>): { group: string; field: string; rank: number } | null {
  const m = LOVE_RE.exec(key)
  if (!m) return null
  const type = m[1]!
  const extra = /^extra_(\d+)$/.exec(type)
  const story = LOVE_STORY[type]
    ?? (extra ? { name: `Cerita tambahan ${extra[1]}`, rank: 10 + Number(extra[1]) } : { name: names?.get(type) ?? humanize(type), rank: 5 })
  const field = LOVE_FIELD[m[2]!]!
  return { group: story.name, field: field.name, rank: story.rank * 10 + field.rank }
}

/** Nama cerita jenis baru dari awalan label judulnya ("Lamaran: Judul Perjalanan" → "Lamaran"). */
function loveNames(entries: OrderEntry[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const e of entries) {
    const m = /^love_(.+?)_title$/.exec(e.key)
    const prefix = m && /^(.{1,40}?):\s+.+$/.exec(e.label)
    if (m && prefix && prefix[1]!.trim() !== LOVE_SECTION) names.set(m[1]!, prefix[1]!.trim())
  }
  return names
}

// Nilai pilihan yang dikirim widget berupa kode opsi; kode bawaan diterjemahkan ke teks yang dibaca manusia.
const VALUE_LABELS: Record<string, Record<string, string>> = { invitation_side: { pria: 'Pria', wanita: 'Wanita' } }
export function readableValue(key: string, value: string | string[], meta?: OrderMeta | null): string | string[] {
  const map = { ...VALUE_LABELS[key], ...meta?.options?.[key] }
  if (!Object.keys(map).length) return value
  return Array.isArray(value) ? value.map((v) => map[v] ?? v) : (map[value] ?? value)
}

export function splitLabel(key: string, label: string, names?: Map<string, string>): { section: string; field: string; group?: string } {
  const love = loveStory(key, names)
  if (love) return { section: LOVE_SECTION, field: love.field, group: love.group }
  const bank = /^bank_(name|account|owner)_(\d+)$/.exec(key)
  if (bank) return { section: `Rekening ${bank[2]}`, field: label.replace(/\s*\d+$/, '') }
  const colon = /^(.{1,40}?):\s+(.+)$/.exec(label)
  if (colon) return { section: colon[1]!.trim(), field: colon[2]!.trim() }
  const dash = /^(.{1,40}?)\s+[—–-]\s+(.+)$/.exec(label)
  if (dash) return { section: dash[1]!.trim(), field: dash[2]!.trim() }
  if (key.startsWith('customer_') || key === 'invitation_side') return { section: 'Pemesan', field: label }
  return { section: 'Lainnya', field: label }
}

const SECTION_ORDER = ['Pemesan', 'Pria', 'Wanita', 'Akad', 'Resepsi', 'Ngunduh Mantu', LOVE_SECTION]
const FIELD_ORDER = ['customer_name', 'customer_phone', 'customer_email', 'invitation_side', 'full_name', 'nickname', 'child_order', 'father', 'mother',
  'domicile', 'phone', 'instagram', 'date', 'time', 'address', 'maps', 'bank_name', 'bank_account', 'bank_owner']

function fieldRank(key: string): number {
  const love = loveStory(key)
  if (love) return love.rank
  const i = FIELD_ORDER.findIndex((s) => key === s || key.endsWith('_' + s) || key.startsWith(s))
  return i === -1 ? FIELD_ORDER.length : i
}

function sectionRank(title: string): number {
  const i = SECTION_ORDER.indexOf(title)
  if (i !== -1) return i
  if (title.startsWith('Rekening')) return 100 + Number(title.replace(/\D/g, '') || 0)
  if (title === 'Lainnya') return 1000
  return 50
}

export function groupOrderEntries(entries: OrderEntry[], meta?: OrderMeta | null): OrderSection[] {
  const map = new Map<string, OrderField[]>()
  const names = loveNames(entries)
  for (const e of entries) {
    const split = splitLabel(e.key, e.label, names)
    // Field yang tidak dikenali polanya memakai nama step dari widget (bila dikirim), bukan "Lainnya".
    const section = split.section === 'Lainnya' && meta?.sections?.[e.key] ? meta.sections[e.key]! : split.section
    const { field, group } = split
    const list = map.get(section) ?? []
    list.push({ ...e, value: readableValue(e.key, e.value, meta), field, empty: isEmptyValue(e.value), ...(group ? { group } : {}) })
    map.set(section, list)
  }
  return [...map.entries()]
    .map(([title, fields]) => ({ title, fields: fields.sort((a, b) => fieldRank(a.key) - fieldRank(b.key) || a.field.localeCompare(b.field, 'id')) }))
    .sort((a, b) => sectionRank(a.title) - sectionRank(b.title) || a.title.localeCompare(b.title, 'id'))
}

/** Ringkasan satu baris: pemesan & mempelai dulu, lalu field terisi lainnya. Field kosong dilewati. */
export function orderSummary(entries: OrderEntry[], max = 3, meta?: OrderMeta | null): string {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const parts: string[] = []
  const used = new Set<string>()
  const pick = (keys: string[], label: string) => {
    for (const k of keys) {
      const e = byKey.get(k)
      if (e && !isEmptyValue(e.value)) { parts.push(`${label}: ${displayValue(readableValue(k, e.value, meta))}`); used.add(k); return }
    }
  }
  pick(['customer_name'], 'Pemesan')
  pick(['groom_nickname', 'groom_full_name'], 'Pria')
  pick(['bride_nickname', 'bride_full_name'], 'Wanita')
  for (const e of entries) {
    if (parts.length >= max) break
    if (used.has(e.key) || isEmptyValue(e.value)) continue
    const s = splitLabel(e.key, e.label)
    parts.push(`${s.group ? `${s.group} — ${s.field}` : s.field}: ${displayValue(readableValue(e.key, e.value, meta))}`)
  }
  return parts.slice(0, max).join(' · ')
}

export function filledCount(entries: OrderEntry[]): number {
  return entries.filter((e) => !isEmptyValue(e.value)).length
}
