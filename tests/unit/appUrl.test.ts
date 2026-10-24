import { describe, expect, it } from 'vitest'
import { hostOf, isLocalHost, publicHttpsOrigin, resolveAppBase } from '../../shared/appUrl'

describe('alamat aplikasi (URL API untuk plugin)', () => {
  it('NUXT_PUBLIC_APP_URL lokal/http tersalin ke Vercel → diabaikan, pakai domain yang dibuka', () => {
    expect(resolveAppBase('http://localhost:3000', 'https://mdundig.vercel.app')).toEqual({ base: 'https://mdundig.vercel.app', ignored: 'http://localhost:3000' })
    expect(resolveAppBase('http://aperion.local/', 'https://mdundig.vercel.app')).toMatchObject({ base: 'https://mdundig.vercel.app' })
  })
  it('HTTPS publik (mis. domain sendiri) dipakai apa adanya', () => {
    expect(resolveAppBase('https://dashboard.apeiron.id/', 'https://mdundig.vercel.app')).toEqual({ base: 'https://dashboard.apeiron.id', ignored: null })
  })
  it('kosong → domain yang dibuka, tanpa peringatan; lokal di lokal tidak diberi peringatan', () => {
    expect(resolveAppBase('', 'https://mdundig.vercel.app')).toEqual({ base: 'https://mdundig.vercel.app', ignored: null })
    expect(resolveAppBase('http://localhost:3000', 'http://localhost:3000')).toEqual({ base: 'http://localhost:3000', ignored: null })
  })
  it('deteksi host lokal & origin publik', () => {
    for (const h of ['localhost', '127.0.0.1', 'aperion.local', '192.168.1.5', '10.0.0.2', 'site.test', '[::1]']) expect(isLocalHost(h), h).toBe(true)
    for (const h of ['mdundig.vercel.app', 'apeiron.id', '172.15.0.1']) expect(isLocalHost(h), h).toBe(false)
    expect(publicHttpsOrigin('http://apeiron.id')).toBeNull()
    expect(publicHttpsOrigin('nonsense')).toBeNull()
    expect(hostOf('https://MDUNDIG.vercel.app/x')).toBe('mdundig.vercel.app')
  })
})
