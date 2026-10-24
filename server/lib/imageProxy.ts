/**
 * Proksi gambar http:// agar tetap tampil di dashboard HTTPS (murni; diuji unit).
 * - Hanya URL yang ditandatangani server (HMAC) yang dilayani → tidak bisa dipakai sebagai proksi terbuka.
 * - Alamat tujuan wajib publik: localhost / jaringan privat / link-local ditolak (cegah SSRF).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

const DAY = 86_400

/** Tanda tangan berlaku sampai akhir hari ke-2 (dibulatkan per hari agar cache browser tetap efektif). */
export function signImage(key: Buffer, url: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const exp = (Math.floor(nowSec / DAY) + 2) * DAY
  const sig = createHmac('sha256', key).update(`${exp}|${url}`).digest('base64url').slice(0, 32)
  return `/api/img?u=${encodeURIComponent(url)}&e=${exp}&s=${sig}`
}

export function verifyImage(key: Buffer, url: string, exp: string, sig: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!/^\d{1,12}$/.test(exp) || Number(exp) < nowSec || !/^[A-Za-z0-9_-]{32}$/.test(sig)) return false
  const expected = createHmac('sha256', key).update(`${exp}|${url}`).digest('base64url').slice(0, 32)
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
}

/** Alamat IP yang tidak boleh dihubungi proksi (loopback, privat, link-local, CGNAT, multicast, dsb.). */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
      || a >= 224
  }
  if (v === 6) {
    const s = ip.toLowerCase()
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
    if (mapped) return isBlockedAddress(mapped[1]!)
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8')
  }
  return true
}

/** Hanya gambar raster umum; SVG ditolak (dapat memuat skrip bila dibuka langsung). */
export function allowedImageType(contentType: string | null): string | null {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  return /^image\/(png|jpe?g|gif|webp|avif)$/.test(type) ? type : null
}

/** URL gambar http:// diganti URL proksi bertanda tangan; https:// dan kosong dibiarkan. */
export function proxiedImageUrl(key: Buffer | null, url: string | null | undefined): string | null {
  if (!url) return url ?? null
  if (!key || !/^http:\/\//i.test(url)) return url
  return signImage(key, url)
}
