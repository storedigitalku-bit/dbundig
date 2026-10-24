import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import type { Rpc } from '../lib/integration'
import { RPC_ERRORS } from '../lib/crud'

const TIMEOUT_MS = 15_000

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) })

let serviceClient: SupabaseClient | null = null

/** Klien server-only dengan secret key. Dipakai untuk RPC integrasi & undangan akun. */
export function useServiceClient(): SupabaseClient | null {
  const config = useRuntimeConfig()
  if (!config.public.supabaseUrl || !config.supabaseSecretKey) return null
  serviceClient ??= createClient(config.public.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch },
  })
  return serviceClient
}

let testRpc: Promise<Rpc> | null = null

export async function useServiceRpc(): Promise<Rpc | null> {
  // Hanya untuk uji lokal; diabaikan total pada deployment Vercel.
  const testUrl = process.env.MDUNDIG_TEST_DATABASE_URL
  if (testUrl && !process.env.VERCEL) {
    testRpc ??= import('../lib/pg-rpc').then((m) => m.createPgRpc(testUrl))
    return testRpc
  }
  const client = useServiceClient()
  if (!client) return null
  return async (fn, args) => {
    const { data, error } = await client.rpc(fn, args)
    return { data, error: error ? { code: error.code, message: error.message } : null }
  }
}

/** Klien atas nama pengguna (JWT) → RLS PostgreSQL tetap berlaku. */
export function useUserClient(jwt: string): SupabaseClient {
  const config = useRuntimeConfig()
  return createClient(config.public.supabaseUrl, config.public.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch, headers: { Authorization: `Bearer ${jwt}` } },
  })
}

export interface SessionUser {
  id: string
  email: string
  isAdmin: boolean
  /** Verifikasi dua langkah (TOTP) sudah aktif untuk akun ini. */
  mfaEnrolled?: boolean
  db: SupabaseClient
}

/** Verifikasi session dashboard (bukan Token Website). */
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const config = useRuntimeConfig()
  if (!config.public.supabaseUrl || !config.public.supabasePublishableKey) {
    throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'Konfigurasi server belum lengkap.' } })
  }
  const header = getHeader(event, 'authorization') ?? ''
  const match = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(header)
  if (!match) throw createError({ statusCode: 401, statusMessage: 'unauthorized', data: { message: 'Silakan masuk kembali.' } })
  const jwt = match[1] as string
  const db = useUserClient(jwt)
  const { data, error } = await db.auth.getClaims(jwt)
  const sub = data?.claims?.sub
  if (error || typeof sub !== 'string' || data?.claims?.role !== 'authenticated') {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized', data: { message: 'Sesi berakhir. Silakan masuk kembali.' } })
  }
  // Satu panggilan: peran admin + status verifikasi dua langkah. Akun yang sudah mengaktifkan verifikasi dua langkah
  // wajib memakai sesi aal2 (kode authenticator sudah dimasukkan) — ditegakkan di server untuk semua API.
  const { data: info, error: infoError } = await db.rpc('session_info')
  if (infoError) throw dbError(infoError)
  const session = (info ?? {}) as { is_admin?: boolean; mfa_enrolled?: boolean; aal?: string }
  if (session.mfa_enrolled && session.aal !== 'aal2') {
    throw createError({ statusCode: 401, statusMessage: 'mfa_required', data: { message: 'Masukkan kode verifikasi dua langkah dari aplikasi authenticator.' } })
  }
  return { id: sub, email: String(data?.claims?.email ?? ''), isAdmin: session.is_admin === true, mfaEnrolled: session.mfa_enrolled === true, db }
}

export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event)
  if (!user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden', data: { message: 'Halaman ini khusus admin platform.' } })
  }
  return user
}

/** Error dari fungsi database admin (RAISE '<kode>') → pesan ramah, selain itu dbError. */
export function rpcError(error: { code?: string; message: string }) {
  const known = RPC_ERRORS[error.message]
  if (known) return createError({ statusCode: known.status, statusMessage: error.message, data: { message: known.message } })
  return dbError(error)
}

export function dbError(error: { code?: string; message: string }) {
  // Detail SQL tidak dikirim ke browser.
  console.error(JSON.stringify({ scope: 'dashboard', code: error.code ?? null }))
  if (error.code === '42501') {
    return createError({ statusCode: 403, statusMessage: 'forbidden', data: { message: 'Anda tidak memiliki akses.' } })
  }
  if (error.code === '23505') {
    return createError({ statusCode: 409, statusMessage: 'conflict', data: { message: 'Data yang sama sudah ada.' } })
  }
  if (error.code === '23503') {
    return createError({ statusCode: 409, statusMessage: 'in_use', data: { message: 'Data masih dipakai oleh data lain sehingga tidak dapat dihapus.' } })
  }
  return createError({ statusCode: 500, statusMessage: 'server_error', data: { message: 'Terjadi kesalahan pada server. Coba lagi.' } })
}
