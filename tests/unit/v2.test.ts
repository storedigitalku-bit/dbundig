import { describe, expect, it } from 'vitest'
import { allowedImageType, isBlockedAddress, proxiedImageUrl, signImage, verifyImage } from '../../server/lib/imageProxy'
import { validPushEndpoint, validPushKey } from '../../server/lib/pushEndpoint'
import {
  ACCESS_REQUIRED, DEFAULT_ACCESS_TEMPLATE, RECAP_REQUIRED, buildAccessMessage, buildRecapMessage, missingPlaceholders, renderTemplate, whatsappLink,
} from '../../shared/whatsapp'

const KEY = Buffer.alloc(32, 7)

describe('proksi gambar', () => {
  it('hanya URL bertanda tangan & belum kedaluwarsa yang dilayani', () => {
    const now = 1_800_000_000
    const path = signImage(KEY, 'http://undangan.example.com/a.jpg', now)
    const q = new URLSearchParams(path.split('?')[1])
    expect(q.get('u')).toBe('http://undangan.example.com/a.jpg')
    expect(verifyImage(KEY, q.get('u')!, q.get('e')!, q.get('s')!, now)).toBe(true)
    expect(verifyImage(KEY, 'http://lain.example.com/a.jpg', q.get('e')!, q.get('s')!, now)).toBe(false)
    expect(verifyImage(Buffer.alloc(32, 8), q.get('u')!, q.get('e')!, q.get('s')!, now)).toBe(false)
    expect(verifyImage(KEY, q.get('u')!, q.get('e')!, q.get('s')!, Number(q.get('e')) + 1)).toBe(false)
    expect(verifyImage(KEY, q.get('u')!, q.get('e')!, 'x', now)).toBe(false)
  })
  it('https & kosong tidak diproksi; tanpa kunci server tidak diproksi', () => {
    expect(proxiedImageUrl(KEY, 'https://a.example/x.png')).toBe('https://a.example/x.png')
    expect(proxiedImageUrl(KEY, '')).toBe('')
    expect(proxiedImageUrl(null, 'http://a.example/x.png')).toBe('http://a.example/x.png')
    expect(proxiedImageUrl(KEY, 'http://a.example/x.png')).toMatch(/^\/api\/img\?u=/)
  })
  it('alamat internal/privat diblokir, publik diizinkan', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', 'bukan-ip']) {
      expect(isBlockedAddress(ip), ip).toBe(true)
    }
    for (const ip of ['8.8.8.8', '104.21.3.4', '172.32.0.1', '2606:4700::1111']) expect(isBlockedAddress(ip), ip).toBe(false)
  })
  it('hanya gambar raster; SVG/HTML ditolak', () => {
    expect(allowedImageType('image/jpeg; charset=binary')).toBe('image/jpeg')
    expect(allowedImageType('image/webp')).toBe('image/webp')
    expect(allowedImageType('image/svg+xml')).toBeNull()
    expect(allowedImageType('text/html')).toBeNull()
    expect(allowedImageType(null)).toBeNull()
  })
})

describe('endpoint push', () => {
  it('hanya layanan push resmi (cegah server menghubungi alamat sembarang)', () => {
    expect(validPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBeTruthy()
    expect(validPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBeTruthy()
    expect(validPushEndpoint('https://web.push.apple.com/QWE')).toBeTruthy()
    expect(validPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=1')).toBeTruthy()
    for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com:8443/x', 'x', 5]) {
      expect(validPushEndpoint(bad), String(bad)).toBeNull()
    }
    expect(validPushKey('BOr7_abc-DEF', 200)).toBe('BOr7_abc-DEF')
    expect(validPushKey('<script>', 200)).toBeNull()
  })
})

describe('template WhatsApp', () => {
  it('template bawaan menghasilkan pesan yang sama persis dengan sebelumnya', () => {
    const msg = buildAccessMessage({ name: 'Rina', username: 'rina', password: 'p', loginUrl: 'https://x/login?u=rina', invitationTitle: 'A & B', sender: 'Apeiron' })
    expect(msg.split('\n')[0]).toBe('Halo, *Rina* 👋')
    expect(msg).toContain('undangan *A & B*:')
    expect(msg.endsWith('Terima kasih 🙏\n*Apeiron*')).toBe(true)
    expect(buildAccessMessage({ name: '', username: 'u', password: null, loginUrl: 'l' }).endsWith('Terima kasih 🙏')).toBe(true)
    expect(missingPlaceholders(DEFAULT_ACCESS_TEMPLATE, ACCESS_REQUIRED)).toEqual([])
  })
  it('template buatan admin dipakai; placeholder wajib dicek', () => {
    const t = 'Hai {nama}, user {username} / {password}\n{link_login}\n{tidak_dikenal}'
    expect(buildAccessMessage({ name: 'Sari', username: 's', password: 'x', loginUrl: 'L' }, t)).toBe('Hai Sari, user s / x\nL\n{tidak_dikenal}')
    expect(missingPlaceholders('Halo {nama}', ACCESS_REQUIRED)).toEqual(['username', 'password', 'link_login'])
    expect(renderTemplate('A {x}\n\n', { x: '1' })).toBe('A 1')
  })
  it('rekap reservasi 115: sebut jumlahnya + 6 terbaru saja, sisanya diarahkan ke web; pesan tetap pendek', () => {
    const latest = Array.from({ length: 6 }, (_, i) => ({ gift: `Hadiah ${i + 1}`, guest: `Tamu ${115 - i}` }))
    const msg = buildRecapMessage({ name: 'Rina', invitationTitle: 'A & B', total: 115, latest, loginUrl: 'https://x.example/login?u=rina', sender: 'Apeiron' })
    expect(msg).toContain('*115 reservasi*')
    expect(msg).toContain('*6 reservasi terbaru:*')
    expect(msg.match(/🎁/g)).toHaveLength(6)
    expect(msg).toContain('🎁 *Hadiah 1* — Tamu 115')
    expect(msg).toContain('…dan 109 reservasi lainnya')
    expect(msg).toContain('https://x.example/login?u=rina')
    expect(whatsappLink('6281234567890', msg).length).toBeLessThan(1500)
    // Data lebih dari 6 tetap hanya 6 yang disebut.
    expect(buildRecapMessage({ name: 'R', total: 115, latest: [...latest, ...latest], loginUrl: 'L' }).match(/🎁/g)).toHaveLength(6)
  })
  it('rekap reservasi sedikit (≤ 6): semua disebut tanpa "lainnya"; kosong → kalimat jelas', () => {
    const msg = buildRecapMessage({ name: 'Rina', invitationTitle: 'A & B', total: 2, latest: [{ gift: 'Rice Cooker', guest: 'Budi' }, { gift: 'Blender', guest: 'Siti' }], loginUrl: 'L', sender: '' })
    expect(msg).toContain('*2 reservasi*')
    expect(msg).toContain('🎁 *Rice Cooker* — Budi')
    expect(msg).not.toContain('lainnya')
    expect(msg).not.toContain('reservasi terbaru:')
    expect(buildRecapMessage({ name: '', total: 0, latest: [], loginUrl: 'L' })).toContain('Belum ada hadiah yang dipilih tamu.')
    expect(missingPlaceholders('rekap', RECAP_REQUIRED)).toEqual(['daftar_hadiah'])
  })
})
