import { describe, expect, it } from 'vitest'
import { buildAccessMessage, formatWhatsapp, normalizeWhatsapp, whatsappLink } from '../../shared/whatsapp'

describe('WhatsApp', () => {
  it('normalisasi nomor sama seperti plugin', () => {
    expect(normalizeWhatsapp('0812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsapp('+62 812 3456 7890')).toBe('6281234567890')
    expect(normalizeWhatsapp('(0812) 3456.7890')).toBe('6281234567890')
    expect(normalizeWhatsapp('12ab')).toBeNull()
    expect(normalizeWhatsapp('0812')).toBeNull()
    expect(normalizeWhatsapp('')).toBeNull()
    expect(normalizeWhatsapp(undefined)).toBeNull()
  })
  it('format tampilan', () => {
    expect(formatWhatsapp('6281234567890')).toBe('0812-3456-7890')
    expect(formatWhatsapp(null)).toBe('')
  })
  it('pesan akses rapi berisi username, password, dan tautan masuk', () => {
    const msg = buildAccessMessage({ name: 'Rina', username: 'rina.doni', password: 'rahasia-123', loginUrl: 'https://mdundig.vercel.app/login?u=rina.doni', invitationTitle: 'Rina & Doni', sender: 'Apeiron.ID' })
    const lines = msg.split('\n')
    expect(lines[0]).toBe('Halo, *Rina* 👋')
    expect(msg).toContain('undangan *Rina & Doni*:')
    expect(lines).toContain('👤 *Username:* rina.doni')
    expect(lines).toContain('🔑 *Password:* rahasia-123')
    expect(lines).toContain('https://mdundig.vercel.app/login?u=rina.doni')
    expect(lines.at(-1)).toBe('*Apeiron.ID*')
    // Tidak ada baris kosong ganda.
    expect(msg).not.toMatch(/\n\n\n/)
    const generic = buildAccessMessage({ name: ' ', username: 'u1', password: 'p', loginUrl: 'https://x.example/login' })
    expect(generic.split('\n')[0]).toBe('Halo, *u1* 👋')
    expect(generic).toContain('undangan Anda:')
    expect(generic.split('\n').at(-1)).toBe('Terima kasih 🙏')
    // Kirim ulang tanpa password baru.
    const resend = buildAccessMessage({ name: 'Rina', username: 'rina.doni', password: null, loginUrl: 'https://x.example/login' })
    expect(resend).toContain('🔑 *Password:* sama seperti yang sudah kami berikan sebelumnya')
  })
  it('tautan wa.me dengan pesan ter-encode', () => {
    const link = whatsappLink('6281234567890', 'Halo *A*\nB & C')
    expect(link).toBe('https://wa.me/6281234567890?text=Halo%20*A*%0AB%20%26%20C')
  })
})
