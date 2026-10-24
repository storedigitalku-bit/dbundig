import { describe, expect, it } from 'vitest'
import { LOGIN_FAILED, handleLogin, internalEmail, isInternalEmail, normalizeUsername, passwordProblem, type LoginDeps } from '../../server/lib/accounts'

const SESSION = { access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'bearer' }

function deps(overrides: Partial<LoginDeps> = {}) {
  const calls = { signIn: [] as string[], resolve: [] as string[] }
  const d: LoginDeps = {
    allow: async () => true,
    resolveUsername: async (u) => { calls.resolve.push(u); return u === 'admin' ? internalEmail('admin') : null },
    signIn: async (email, pw) => { calls.signIn.push(email); return email === internalEmail('admin') && pw === 'rahasia-panjang' ? SESSION : null },
    ...overrides,
  }
  return { d, calls }
}

describe('akun', () => {
  it('username', () => {
    expect(normalizeUsername(' Admin ')).toBe('admin')
    expect(normalizeUsername('ab')).toBeNull()
    expect(normalizeUsername('admin user')).toBeNull()
    expect(normalizeUsername('a'.repeat(33))).toBeNull()
  })
  it('email internal untuk akun tanpa email memakai domain .invalid', () => {
    expect(internalEmail('admin')).toBe('admin@akun.mdundig.invalid')
    expect(isInternalEmail('ADMIN@akun.mdundig.invalid')).toBe(true)
    expect(isInternalEmail('admin@domain.com')).toBe(false)
  })
  it('password minimal 8 karakter (password "admin" ditolak)', () => {
    expect(passwordProblem('admin')).toMatch(/minimal 8/)
    expect(passwordProblem('rahasia-panjang')).toBeNull()
    expect(passwordProblem('x'.repeat(73))).toMatch(/maksimal/)
  })
})

describe('handleLogin', () => {
  it('login dengan username', async () => {
    const { d } = deps()
    const res = await handleLogin({ identifier: 'Admin', password: 'rahasia-panjang', ip: '1.1.1.1' }, d)
    expect(res.status).toBe(200)
    expect(res.body.session).toEqual(SESSION)
  })
  it('login dengan email langsung tanpa lookup username', async () => {
    const { d, calls } = deps()
    await handleLogin({ identifier: 'admin@akun.mdundig.invalid', password: 'rahasia-panjang', ip: '' }, d)
    expect(calls.resolve).toHaveLength(0)
    expect(calls.signIn).toEqual(['admin@akun.mdundig.invalid'])
  })
  it('pesan gagal sama untuk username tidak ada & password salah', async () => {
    const a = await handleLogin({ identifier: 'tidakada', password: 'apa-saja-123', ip: '' }, deps().d)
    const b = await handleLogin({ identifier: 'admin', password: 'salah-salah', ip: '' }, deps().d)
    expect(a).toEqual({ status: 401, body: { message: LOGIN_FAILED } })
    expect(b).toEqual({ status: 401, body: { message: LOGIN_FAILED } })
  })
  it('username tidak dikenal tetap memanggil signIn (waktu respons seragam)', async () => {
    const { d, calls } = deps()
    await handleLogin({ identifier: 'tidakada', password: 'apa-saja-123', ip: '' }, d)
    expect(calls.signIn).toHaveLength(1)
  })
  it('dibatasi setelah terlalu banyak percobaan', async () => {
    const { d } = deps({ allow: async (bucket) => !bucket.startsWith('login:') })
    const res = await handleLogin({ identifier: 'admin', password: 'rahasia-panjang', ip: '' }, d)
    expect(res.status).toBe(429)
  })
  it('input kosong ditolak', async () => {
    expect((await handleLogin({ identifier: '', password: 'x', ip: '' }, deps().d)).status).toBe(400)
  })
})
