import { randomBytes } from 'node:crypto'

/**
 * Token Website: 32 byte acak (CSPRNG) → 64 hex, prefiks "mdh_" (total 68 karakter).
 * Sesuai validasi plugin: /^[A-Za-z0-9._~-]{24,512}$/.
 */
export function generateWebsiteToken(): string {
  return 'mdh_' + randomBytes(32).toString('hex')
}

export function tokenHint(token: string): string {
  return '…' + token.slice(-4)
}

export const TOKEN_SCOPES = ['daftar_hadiah', 'form_order'] as const

export function parseScopes(value: unknown): string[] | null {
  if (value === undefined) return [...TOKEN_SCOPES]
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null
  const set = new Set(value)
  if (set.size !== value.length || ![...set].every((s) => (TOKEN_SCOPES as readonly unknown[]).includes(s))) return null
  return [...set] as string[]
}
