/**
 * Alamat publik aplikasi MDUNDIG (dipakai untuk URL API yang disalin ke plugin & tautan email).
 * NUXT_PUBLIC_APP_URL hanya dipakai bila berupa HTTPS publik; nilai lokal/http (mis. http://localhost:3000
 * yang tersalin dari .env) diabaikan dan diganti domain yang sedang dibuka, agar plugin tidak diarahkan ke localhost.
 */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || h === '0.0.0.0'
    || /\.(local|localhost|test|internal|lan)$/.test(h)
    || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
}

/** Origin HTTPS publik dari nilai konfigurasi, atau null bila kosong/tidak valid/lokal/http. */
export function publicHttpsOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || isLocalHost(url.hostname)) return null
    return url.origin + url.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** Basis URL aplikasi + nilai konfigurasi yang diabaikan (untuk ditampilkan sebagai peringatan admin). */
export function resolveAppBase(configured: string | null | undefined, requestOrigin: string): { base: string; ignored: string | null } {
  const good = publicHttpsOrigin(configured)
  if (good) return { base: good, ignored: null }
  const req = requestOrigin.replace(/\/+$/, '')
  const raw = (configured ?? '').trim().replace(/\/+$/, '')
  return { base: req, ignored: raw && raw !== req ? raw : null }
}

/** Host (tanpa skema) dari URL; null bila tidak valid. */
export function hostOf(value: string): string | null {
  try { return new URL(value).host.toLowerCase() } catch { return null }
}
