// Pencatat error ke tabel error_logs (secret key, server-only). Tidak pernah menyimpan query string, header,
// token, atau isi permintaan — hanya pesan singkat, path, status, dan (khusus server) potongan stack.
const recent = new Map<string, number>()

/** Batasi per instance: pesan yang sama paling sering 1× per menit (mencegah banjir log). */
function throttled(key: string): boolean {
  const now = Date.now()
  const last = recent.get(key) ?? 0
  if (now - last < 60_000) return true
  recent.set(key, now)
  if (recent.size > 500) recent.clear()
  return false
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, max) : '')
/** Path tanpa query string & tanpa token di segmen (mis. /reset/<token>). */
export const safePath = (path: string) => clip(path.split('?')[0]!.replace(/[A-Za-z0-9_-]{40,}/g, '…'), 300)

export async function logError(entry: { source: 'server' | 'client'; status?: number | null; path?: string; message: string; detail?: Record<string, unknown>; userId?: string | null }) {
  const message = clip(entry.message, 500) || 'Error tanpa pesan'
  if (throttled(`${entry.source}|${entry.path}|${message}`)) return
  const service = useServiceClient()
  if (!service) return
  const { error } = await service.from('error_logs').insert({
    source: entry.source, status: entry.status ?? null, path: entry.path ? safePath(entry.path) : null, message,
    detail: entry.detail ?? {}, user_id: entry.userId ?? null,
  })
  if (error) console.error(JSON.stringify({ scope: 'error_log', code: error.code ?? null }))
}
