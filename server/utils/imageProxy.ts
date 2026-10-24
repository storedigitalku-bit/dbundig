import { createHmac } from 'node:crypto'
import { proxiedImageUrl } from '../lib/imageProxy'

let cached: Buffer | null | undefined

/** Kunci HMAC proksi gambar, diturunkan dari secret key server (tidak perlu env baru; tidak pernah ke browser). */
export function imageProxyKey(): Buffer | null {
  if (cached !== undefined) return cached
  const secret = useRuntimeConfig().supabaseSecretKey
  cached = secret ? createHmac('sha256', secret).update('mdundig-image-proxy-v1').digest() : null
  return cached
}

/** Ganti image_url http:// pada daftar hadiah dengan URL proksi bertanda tangan. */
export function proxyImages<T extends { image_url?: string | null }>(rows: T[]): T[] {
  const key = imageProxyKey()
  return rows.map((r) => ('image_url' in r ? { ...r, image_url: proxiedImageUrl(key, r.image_url) } : r))
}
