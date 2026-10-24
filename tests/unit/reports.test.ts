import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderCardReport, renderTableReport } from '../../server/lib/pdf'
import { formatWhatsapp, formatWibHuman, orderCards, reservationPdfParts } from '../../server/lib/reports'

const fonts = {
  regular: readFileSync('server/assets/fonts/ubuntu-400.woff'),
  medium: readFileSync('server/assets/fonts/ubuntu-500.woff'),
}
const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

describe('format laporan', () => {
  it('WhatsApp lokal mudah dibaca', () => {
    expect(formatWhatsapp('6281234567890')).toBe('0812-3456-7890')
    expect(formatWhatsapp('')).toBe('')
  })
  it('waktu WIB manusia', () => {
    expect(formatWibHuman('2026-10-16T09:00:00.000Z')).toMatch(/^16 Okt 2026, 16[.:]00$/)
  })
})

describe('PDF laporan', () => {
  const row = (i: number) => ({ invitation_title: 'Andi & Sari', gift_name: `Hadiah ${i}`, guest_name: `Tamu ${i}`, guest_whatsapp: '6281234567890',
    quantity: 1, message: i % 3 ? '' : 'Selamat menempuh hidup baru, semoga sakinah mawaddah warahmah — dari keluarga besar.', created_at: '2026-10-16T09:00:00.000Z', status: i % 4 ? 'confirmed' : 'cancelled' })

  it('reservasi: font Ubuntu tertanam, banyak halaman, ringkasan benar', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(i))
    const parts = reservationPdfParts(rows, { generatedAt: '17 Okt 2026, 01.00 WIB' })
    expect(parts.meta.stats?.map((s) => s.value)).toEqual(['60', '45', '15', '45'])
    expect(parts.columns.map((c) => c.header)).toContain('Undangan')
    const pdf = await renderTableReport(fonts, parts.meta, parts.columns, parts.rows)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.toString('latin1')).toMatch(/\/BaseFont \/[A-Z]{6}\+Ubuntu/)
    expect(pages(pdf)).toBeGreaterThan(1)
  })

  it('reservasi satu undangan: tanpa kolom Undangan, judul menyebut undangan', () => {
    const parts = reservationPdfParts([row(1)], { generatedAt: 'x', invitationTitle: 'Andi & Sari' })
    expect(parts.columns.map((c) => c.header)).not.toContain('Undangan')
    expect(parts.meta.title).toContain('Andi & Sari')
  })

  it('kosong tetap menghasilkan PDF', async () => {
    const parts = reservationPdfParts([], { generatedAt: 'x' })
    const pdf = await renderTableReport(fonts, parts.meta, parts.columns, parts.rows)
    expect(pages(pdf)).toBe(1)
  })

  it('order: kartu per order, bagian dikelompokkan, field kosong dilewati', async () => {
    const cards = orderCards([{ created_at: '2026-10-16T10:00:00Z', post_title: 'Pesan Undangan', post_id: 5, status: 'baru', site: 'Apeiron Local',
      fields: { customer_name: 'Rina', groom_full_name: 'Andi', bride_full_name: 'Sari', note: '' },
      labels: { customer_name: 'Nama Pemesan', groom_full_name: 'Pria: Nama Lengkap', bride_full_name: 'Wanita: Nama Lengkap', note: 'Catatan' } }])
    expect(cards[0]!.status).toBe('Baru')
    expect(cards[0]!.sections.map((s) => s.title)).toEqual(['Pemesan', 'Pria', 'Wanita'])
    expect(cards[0]!.sections[1]!.fields[0]).toEqual({ label: 'Nama Lengkap', value: 'Andi' })
    const pdf = await renderCardReport(fonts, { title: 'Laporan Order Undangan', generatedAt: 'x' }, Array.from({ length: 12 }, () => cards[0]!))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pages(pdf)).toBeGreaterThan(1)
  })
})
