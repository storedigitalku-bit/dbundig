/**
 * WhatsApp (murni, dipakai server & dashboard).
 * - Normalisasi nomor sama seperti plugin (DaftarHadiahController): 08… → 628…, tanpa spasi/tanda.
 * - Pesan akses akun pelanggan yang rapi (format tebal WhatsApp *…*) + tautan wa.me.
 */
const WHATSAPP_RE = /^[1-9][0-9]{7,14}$/

export function normalizeWhatsapp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\+?[0-9\s().-]+$/.test(value.trim())) return null
  let phone = value.trim().replace(/^\+/, '').replace(/[\s().-]/g, '')
  if (phone.startsWith('0')) phone = '62' + phone.slice(1)
  return WHATSAPP_RE.test(phone) ? phone : null
}

/** 6281234567890 → 0812-3456-7890 (tampilan). */
export function formatWhatsapp(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const local = digits.startsWith('62') ? '0' + digits.slice(2) : digits
  return local.length < 9 ? local : `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`
}

export interface AccessMessageInput {
  name: string
  username: string
  /** null = password tidak dikirim ulang (pelanggan memakai password yang sudah diberikan). */
  password: string | null
  loginUrl: string
  invitationTitle?: string | null
  sender?: string | null
}

// ---- Template pesan (bisa diubah admin di menu Pesan WhatsApp). Placeholder diganti saat pesan dibuat.
export const ACCESS_PLACEHOLDERS = ['nama', 'username', 'password', 'link_login', 'undangan', 'pengirim'] as const
export const RECAP_PLACEHOLDERS = ['nama', 'undangan', 'jumlah_reservasi', 'daftar_hadiah', 'link_login', 'pengirim'] as const
export const ACCESS_REQUIRED = ['username', 'password', 'link_login'] as const
export const RECAP_REQUIRED = ['daftar_hadiah'] as const
export const TEMPLATE_MAX = 3000

export const DEFAULT_ACCESS_TEMPLATE = [
  'Halo, *{nama}* 👋',
  '',
  'Terima kasih telah mempercayakan undangan digital Anda kepada kami. Berikut akun untuk melihat *Daftar Hadiah* undangan {undangan}:',
  '',
  '👤 *Username:* {username}',
  '🔑 *Password:* {password}',
  '',
  '🔗 *Masuk di sini:*',
  '{link_login}',
  '',
  'Setelah masuk, Anda dapat melihat hadiah yang dipilih tamu beserta ucapannya, dan mengunduh laporannya (PDF/CSV).',
  '',
  '🔒 Demi keamanan, mohon simpan pesan ini dan jangan bagikan kepada orang lain. Password dapat diganti kapan saja di menu *Profil* setelah masuk.',
  '',
  'Terima kasih 🙏',
  '{pengirim}',
].join('\n')

export const DEFAULT_RECAP_TEMPLATE = [
  'Halo, *{nama}* 👋',
  '',
  'Berikut rekap *Daftar Hadiah* undangan {undangan} sampai hari ini: *{jumlah_reservasi} reservasi*.',
  '',
  '{daftar_hadiah}',
  '',
  'Rincian lengkap beserta ucapan tamu dapat dilihat dan diunduh (PDF/CSV) di sini:',
  '{link_login}',
  '',
  'Terima kasih 🙏',
  '{pengirim}',
].join('\n')

/** Placeholder wajib yang tidak ada di template (kosong = template sah). */
export function missingPlaceholders(template: string, required: readonly string[]): string[] {
  return required.filter((p) => !template.includes(`{${p}}`))
}

/** Ganti {placeholder}; baris yang menjadi kosong di akhir pesan dipangkas. Placeholder tak dikenal dibiarkan apa adanya. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (all, key: string) => (key in values ? values[key]! : all)).replace(/\s+$/, '')
}

/** Pesan akses untuk pelanggan: sapaan, data akun, tautan masuk, panduan singkat, pengingat keamanan. */
export function buildAccessMessage(i: AccessMessageInput, template?: string | null): string {
  return renderTemplate(template?.trim() ? template : DEFAULT_ACCESS_TEMPLATE, {
    nama: i.name.trim() || i.username,
    username: i.username,
    password: i.password || 'sama seperti yang sudah kami berikan sebelumnya',
    link_login: i.loginUrl,
    undangan: i.invitationTitle ? `*${i.invitationTitle}*` : 'Anda',
    pengirim: i.sender?.trim() ? `*${i.sender.trim()}*` : '',
  })
}

/** Jumlah reservasi yang disebut satu per satu di pesan rekap; sisanya dilihat di web. */
export const RECAP_LIST_LIMIT = 6

export interface RecapInput {
  name: string
  invitationTitle?: string | null
  /** Jumlah seluruh reservasi terkonfirmasi. */
  total: number
  /** Reservasi terbaru (paling baru dulu); hanya 6 pertama yang disebut. */
  latest: Array<{ gift: string; guest: string }>
  loginUrl: string
  sender?: string | null
}

/**
 * Rekap reservasi untuk mempelai: jumlah total + 6 reservasi terbaru; sisanya diarahkan ke web (tautan masuk).
 * Pesan tetap pendek walau reservasi ratusan, sehingga tautan WhatsApp selalu bisa dibuka.
 */
export function buildRecapMessage(i: RecapInput, template?: string | null): string {
  const shown = i.latest.slice(0, RECAP_LIST_LIMIT)
  const lines = shown.map((r) => `🎁 *${r.gift}* — ${r.guest}`)
  const rest = Math.max(0, i.total - shown.length)
  if (rest > 0) {
    lines.unshift(`*${shown.length} reservasi terbaru:*`)
    lines.push(`…dan ${rest} reservasi lainnya — lihat semuanya di tautan di bawah.`)
  }
  return renderTemplate(template?.trim() ? template : DEFAULT_RECAP_TEMPLATE, {
    nama: i.name.trim() || 'Bapak/Ibu',
    undangan: i.invitationTitle ? `*${i.invitationTitle}*` : 'Anda',
    jumlah_reservasi: String(i.total),
    daftar_hadiah: lines.length ? lines.join('\n') : 'Belum ada hadiah yang dipilih tamu.',
    link_login: i.loginUrl,
    pengirim: i.sender?.trim() ? `*${i.sender.trim()}*` : '',
  })
}

/** Tautan wa.me yang membuka chat ke nomor tersebut dengan pesan terisi. */
export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
