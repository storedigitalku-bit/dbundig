import type { H3Event } from 'h3'
import { resolveAppBase } from '../../shared/appUrl'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function pageParams(event: H3Event, defaultSize = 20) {
  const query = getQuery(event)
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(query.page ?? '1'), 10) || 1))
  const size = Math.max(5, Math.min(100, Number.parseInt(String(query.per_page ?? defaultSize), 10) || defaultSize))
  return { page, size, from: (page - 1) * size, to: page * size - 1 }
}

/** Pola ILIKE aman: wildcard dari input di-escape. */
export function searchPattern(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const q = value.trim().toLowerCase().slice(0, 100)
  if (!q) return null
  return `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`
}

export function uuidParam(value: unknown, name = 'id'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_request', data: { message: `Parameter ${name} tidak valid.` } })
  }
  return value.toLowerCase()
}

export function optionalUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null
}

export function badRequest(message: string) {
  return createError({ statusCode: 422, statusMessage: 'invalid_request', data: { message } })
}

export function notFound(message = 'Data tidak ditemukan atau Anda tidak memiliki akses.') {
  return createError({ statusCode: 404, statusMessage: 'not_found', data: { message } })
}

export async function readJson(event: H3Event): Promise<Record<string, unknown>> {
  const body = await readBody(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Data permintaan tidak valid.')
  return body as Record<string, unknown>
}

/**
 * Basis URL aplikasi: NUXT_PUBLIC_APP_URL bila HTTPS publik, selain itu domain yang sedang dibuka
 * (mis. https://mdundig.vercel.app). Nilai lokal/http tidak pernah dipakai di server publik.
 */
export function appBase(event: H3Event): { base: string; ignored: string | null } {
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  return resolveAppBase(useRuntimeConfig().public.appUrl, origin)
}
export function appBaseUrl(event: H3Event): string {
  return appBase(event).base
}

export function sendCsv(event: H3Event, filename: string, csv: string) {
  setResponseHeaders(event, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'cache-control': 'no-store, max-age=0',
  })
  return csv
}

export async function audit(user: { id: string; db: import('@supabase/supabase-js').SupabaseClient }, action: string, target: string, detail: Record<string, unknown> = {}) {
  const { error } = await user.db.from('access_audit').insert({ actor_id: user.id, action, target, detail })
  if (error) console.error(JSON.stringify({ scope: 'audit', action, code: error.code ?? null }))
}
