import { describe, expect, it } from 'vitest'
import { buildOrderFields, normalizeWhatsapp } from '../../server/lib/crud'

describe('normalizeWhatsapp (sama dengan plugin)', () => {
  it('08… → 628…, buang spasi/tanda, tolak yang tidak valid', () => {
    expect(normalizeWhatsapp('0812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsapp('+62 812 3456 7890')).toBe('6281234567890')
    expect(normalizeWhatsapp('6281234567890')).toBe('6281234567890')
    expect(normalizeWhatsapp('0812')).toBeNull()
    expect(normalizeWhatsapp('abc')).toBeNull()
    expect(normalizeWhatsapp(81234567890)).toBeNull()
  })
})

describe('buildOrderFields', () => {
  it('key lama dipertahankan, key baru dari label, duplikat diberi akhiran, array tetap array', () => {
    const r = buildOrderFields([
      { key: 'groom_name', label: 'Nama Pria', value: 'Andi' },
      { label: 'Nomor Rekening', value: '0012345678' },
      { label: 'Nomor Rekening', value: '999' },
      { key: 'addons', label: 'Tambahan', value: ['musik', ' galeri ', ''] },
    ])
    expect(r).toEqual({
      fields: { groom_name: 'Andi', nomor_rekening: '0012345678', nomor_rekening_2: '999', addons: ['musik', 'galeri'] },
      labels: { groom_name: 'Nama Pria', nomor_rekening: 'Nomor Rekening', nomor_rekening_2: 'Nomor Rekening', addons: 'Tambahan' },
    })
  })
  it('validasi', () => {
    expect(buildOrderFields([])).toMatch(/minimal 1/)
    expect(buildOrderFields([{ label: '', value: 'x' }])).toMatch(/label/)
    expect(buildOrderFields([{ label: 'A', value: 'x'.repeat(4001) }])).toMatch(/terlalu panjang/)
    expect(buildOrderFields([{ label: 'A', value: 5 }])).toMatch(/tidak valid/)
    expect(buildOrderFields([{ key: 'bad key!', label: 'Paket', value: 'x' }])).toEqual({ fields: { paket: 'x' }, labels: { paket: 'Paket' } })
  })
})
