/**
 * Akun dashboard dibuat langsung oleh admin (username + password). Murni & dapat diuji.
 */
import { createHash } from 'node:crypto'

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72 // batas bcrypt Supabase Auth

/** Email internal untuk akun tanpa email. Domain .invalid (RFC 2606) tidak pernah dapat menerima email. */
export const INTERNAL_EMAIL_DOMAIN = 'akun.mdundig.invalid'

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const u = value.trim().toLowerCase()
  return USERNAME_RE.test(u) ? u : null
}

export function internalEmail(username: string): string {
  return `${username}@${INTERNAL_EMAIL_DOMAIN}`
}

export function isInternalEmail(email: string): boolean {
  return email.toLowerCase().endsWith('@' + INTERNAL_EMAIL_DOMAIN)
}

export function passwordProblem(value: unknown): string | null {
  if (typeof value !== 'string') return 'Password wajib diisi.'
  if (value.length < PASSWORD_MIN) return `Password minimal ${PASSWORD_MIN} karakter.`
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX) return `Password maksimal ${PASSWORD_MAX} byte.`
  return null
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const e = value.trim().toLowerCase()
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(e) ? e : null
}

export interface LoginSession {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at?: number
  token_type: string
}

export interface LoginDeps {
  /** true bila percobaan masih di bawah batas. */
  allow(bucket: string, limit: number): Promise<boolean>
  resolveUsername(username: string): Promise<string | null>
  signIn(email: string, password: string): Promise<LoginSession | null>
}

export const LOGIN_FAILED = 'Username/email atau password salah.'

const bucket = (kind: string, value: string) => 'login:' + createHash('sha256').update(`${kind}|${value}`).digest('hex')

export async function handleLogin(input: { identifier: unknown; password: unknown; ip: string }, deps: LoginDeps):
  Promise<{ status: number; body: Record<string, unknown> }> {
  const identifier = typeof input.identifier === 'string' ? input.identifier.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  if (!identifier || !password || identifier.length > 254 || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX) {
    return { status: 400, body: { message: LOGIN_FAILED } }
  }
  // Batasi per identitas dan per IP (tersimpan di PostgreSQL → efektif di serverless).
  const [byId, byIp] = await Promise.all([deps.allow(bucket('id', identifier), 10), deps.allow(bucket('ip', input.ip || 'unknown'), 40)])
  if (!byId || !byIp) return { status: 429, body: { message: 'Terlalu banyak percobaan masuk. Tunggu 1 menit lalu coba lagi.' } }

  let email: string | null
  if (identifier.includes('@')) {
    email = normalizeEmail(identifier)
  } else {
    const username = normalizeUsername(identifier)
    email = username ? await deps.resolveUsername(username) : null
  }
  // Jalur gagal tetap memanggil signIn agar waktu respons tidak membocorkan keberadaan akun.
  const session = await deps.signIn(email ?? internalEmail('tidak-ada-akun'), password)
  if (!email || !session) return { status: 401, body: { message: LOGIN_FAILED } }
  return { status: 200, body: { session } }
}
