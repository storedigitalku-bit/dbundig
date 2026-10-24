import { lookup } from 'node:dns/promises'
import { allowedImageType, isBlockedAddress, verifyImage } from '../lib/imageProxy'
import { isLocalHost } from '../../shared/appUrl'

// Proksi gambar hadiah http:// (URL bertanda tangan dari server; tanpa login karena <img> tidak membawa token).
const MAX_BYTES = 5 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const key = imageProxyKey()
  const url = typeof q.u === 'string' ? q.u : ''
  if (!key || !verifyImage(key, url, String(q.e ?? ''), String(q.s ?? ''))) throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  let target: URL
  try { target = new URL(url) } catch { throw createError({ statusCode: 400, statusMessage: 'bad_url' }) }
  if (!/^https?:$/.test(target.protocol) || target.username || target.password || (target.port && !['80', '443'].includes(target.port)) || isLocalHost(target.hostname)) {
    throw createError({ statusCode: 404, statusMessage: 'not_found' })
  }
  // Semua alamat hasil DNS wajib publik (cegah akses ke jaringan internal).
  const addrs = await lookup(target.hostname.replace(/^\[|\]$/g, ''), { all: true }).catch(() => [])
  if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) throw createError({ statusCode: 404, statusMessage: 'not_found' })

  const upstream = await fetch(target, {
    redirect: 'manual', signal: AbortSignal.timeout(8000),
    headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8', 'user-agent': 'MDUNDIG-image-proxy' },
  }).catch(() => null)
  const type = upstream?.ok ? allowedImageType(upstream.headers.get('content-type')) : null
  if (!upstream || !type || Number(upstream.headers.get('content-length') ?? 0) > MAX_BYTES || !upstream.body) {
    throw createError({ statusCode: 404, statusMessage: 'not_found' })
  }
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = upstream.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) { await reader.cancel().catch(() => {}); throw createError({ statusCode: 404, statusMessage: 'too_large' }) }
    chunks.push(value)
  }
  setResponseHeaders(event, {
    'content-type': type,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cross-origin-resource-policy': 'same-origin',
  })
  return Buffer.concat(chunks)
})
