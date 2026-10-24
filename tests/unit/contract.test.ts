import { describe, expect, it } from 'vitest'
import {
  ContractError, assertStockMatchesCatalog, cpLength, normalizeSiteUrl, validateCatalog, validateEnvelope, validateFormOrderSubmission, validateReserve,
  DH_OPERATIONS, DH_SERVICE,
} from '../../server/lib/contract'
import { csvCell, formatWib, toCsv } from '../../server/lib/csv'
import { generateWebsiteToken, parseScopes, tokenHint } from '../../server/lib/tokens'
import { hashToken } from '../../server/lib/integration'
import { catalog, gift } from '../helpers/fixtures'

const code = (fn: () => unknown) => { try { fn(); return 'ok' } catch (e) { return e instanceof ContractError ? e.code : 'other' } }

describe('normalizeSiteUrl (home_url)', () => {
  it('menormalkan skema/host & trailing slash; subdirektori dipertahankan', () => {
    expect(normalizeSiteUrl('https://Example.COM')).toBe('https://example.com/')
    expect(normalizeSiteUrl('example.com/blog')).toBe('https://example.com/blog/')
    expect(normalizeSiteUrl('https://example.com:443/wp/')).toBe('https://example.com/wp/')
    expect(normalizeSiteUrl('https://example.com/?a=1#x')).toBe('https://example.com/')
    expect(normalizeSiteUrl('http://localhost:8080/')).toBe('http://localhost:8080/')
  })
  it('menolak kredensial dan skema lain', () => {
    expect(normalizeSiteUrl('https://user:pass@example.com/')).toBeNull()
    expect(normalizeSiteUrl('ftp://example.com/')).toBeNull()
    expect(normalizeSiteUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('validator kontrak', () => {
  const env = { service: DH_SERVICE, schema_version: 1, operation: 'availability', correlation_id: 'c-1', website_id: 'site-' + 'a'.repeat(32), website_url: 'https://a.example/' }
  it('envelope ketat: service, schema_version number, operation, website_id', () => {
    expect(code(() => validateEnvelope(env, DH_SERVICE, DH_OPERATIONS))).toBe('ok')
    expect(code(() => validateEnvelope({ ...env, schema_version: '1' }, DH_SERVICE, DH_OPERATIONS))).toBe('invalid_request')
    expect(code(() => validateEnvelope({ ...env, operation: 'list' }, DH_SERVICE, DH_OPERATIONS))).toBe('invalid_request')
    expect(code(() => validateEnvelope({ ...env, website_id: 'site-XYZ' }, DH_SERVICE, DH_OPERATIONS))).toBe('invalid_request')
    expect(code(() => validateEnvelope([], DH_SERVICE, DH_OPERATIONS))).toBe('invalid_request')
  })
  it('katalog: catalog_version string digit, kapasitas ≤ jumlah awal, maks 200, ID unik', () => {
    expect(code(() => validateCatalog(catalog()))).toBe('ok')
    expect(code(() => validateCatalog(catalog({ catalog_version: 1760000000001 })))).toBe('invalid_catalog')
    expect(code(() => validateCatalog(catalog({ gifts: [gift('gift-a', 2, 3)] })))).toBe('invalid_catalog')
    expect(code(() => validateCatalog(catalog({ gifts: [gift('gift-a', 1, 1), gift('gift-a', 1, 1)] })))).toBe('invalid_catalog')
    expect(code(() => validateCatalog(catalog({ gifts: Array.from({ length: 201 }, (_, i) => gift(`gift-${i}`, 1, 1)) })))).toBe('invalid_catalog')
    expect(code(() => validateCatalog(catalog({ gifts: [] })))).toBe('ok')
    expect(code(() => validateCatalog(catalog({ registry_id: 'registry-901-abc' })))).toBe('invalid_catalog')
    expect(code(() => validateCatalog(catalog({ owner_id: undefined })))).toBe('invalid_request')
    expect(code(() => validateCatalog(catalog({ owner_id: 'customer:42' })))).toBe('ok')
    expect(code(() => validateCatalog(catalog({ gifts: [{ ...gift('gift-a', 1, 1), image_url: 'javascript:x' }] })))).toBe('invalid_catalog')
  })
  it('hash katalog tidak dihitung ulang (serialisasi PHP ≠ JS)', () => {
    expect(code(() => validateCatalog(catalog({ catalog_hash: 'f'.repeat(64) })))).toBe('ok')
  })
  it('reserve: quantity 1, request_id 64 hex, nama ≤100 code point, WhatsApp ternormalisasi', () => {
    const ok = { gift_id: 'gift-a', quantity: 1, request_id: 'a'.repeat(64), guest: { name: 'Budi', whatsapp: '6281234567890' }, message: '' }
    expect(code(() => validateReserve(ok))).toBe('ok')
    expect(code(() => validateReserve({ ...ok, guest: { name: '😀'.repeat(100), whatsapp: '6281234567890' } }))).toBe('ok')
    expect(code(() => validateReserve({ ...ok, guest: { name: 'x'.repeat(101), whatsapp: '6281234567890' } }))).toBe('invalid_request')
    expect(code(() => validateReserve({ ...ok, guest: { name: 'Budi', whatsapp: '081234567890' } }))).toBe('invalid_request')
    expect(code(() => validateReserve({ ...ok, message: 'x'.repeat(1001) }))).toBe('invalid_request')
    expect(code(() => validateReserve({ ...ok, quantity: 2 }))).toBe('invalid_request')
  })
  it('Form Order: custom field & array string diterima; tipe lain ditolak', () => {
    const base = { post_id: 5, post_title: 'x', document_id: 5, element_id: 'order1', request_id: 'b'.repeat(64), fields: { a: '0012', b: ['x', 'y'], custom_1: '' }, labels: { a: 'A' } }
    expect(code(() => validateFormOrderSubmission(base))).toBe('ok')
    expect(code(() => validateFormOrderSubmission({ ...base, fields: { a: 12 } }))).toBe('invalid_request')
    expect(code(() => validateFormOrderSubmission({ ...base, fields: {} }))).toBe('invalid_request')
    expect(code(() => validateFormOrderSubmission({ ...base, post_id: '5' }))).toBe('invalid_request')
  })
  it('cpLength menghitung code point seperti char_length PostgreSQL', () => {
    expect(cpLength('😀ab')).toBe(3)
  })
  it('respons stok wajib persis katalog request', () => {
    const gifts = [gift('gift-a', 5, 4)]
    expect(code(() => assertStockMatchesCatalog([{ gift_id: 'gift-a', initial_quantity: 5, available_quantity: 3, availability: 'available' }], gifts))).toBe('ok')
    expect(code(() => assertStockMatchesCatalog([{ gift_id: 'gift-a', initial_quantity: 5, available_quantity: 5, availability: 'available' }], gifts))).toBe('script_error')
    expect(code(() => assertStockMatchesCatalog([], gifts))).toBe('script_error')
    expect(code(() => assertStockMatchesCatalog([{ gift_id: 'gift-a', initial_quantity: 5, available_quantity: 0, availability: 'available' }], gifts))).toBe('script_error')
  })
})

describe('Token Website', () => {
  it('format kompatibel plugin, acak, hash HMAC deterministik', () => {
    const a = generateWebsiteToken()
    const b = generateWebsiteToken()
    expect(a).toMatch(/^[A-Za-z0-9._~-]{24,512}$/)
    expect(a).toMatch(/^mdh_[a-f0-9]{64}$/)
    expect(a).not.toBe(b)
    expect(tokenHint(a)).toBe('…' + a.slice(-4))
    expect(hashToken(a, 's'.repeat(32))).toBe(hashToken(a, 's'.repeat(32)))
    expect(hashToken(a, 's'.repeat(32))).not.toBe(hashToken(a, 't'.repeat(32)))
  })
  it('izin modul', () => {
    expect(parseScopes(undefined)).toEqual(['daftar_hadiah', 'form_order'])
    expect(parseScopes(['form_order'])).toEqual(['form_order'])
    expect(parseScopes(['read_orders'])).toBeNull()
    expect(parseScopes([])).toBeNull()
  })
})

describe('CSV', () => {
  it('mencegah formula injection', () => {
    expect(csvCell('=SUM(1,1)')).toBe('"\'=SUM(1,1)"')
    expect(csvCell('+62 812')).toBe("'+62 812")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('-1')).toBe("'-1")
  })
  it('angka nol & nomor panjang tetap teks', () => {
    expect(csvCell('0012345678')).toBe('"\t0012345678"')
    expect(csvCell('6281234567890')).toBe('"\t6281234567890"')
    expect(csvCell('12')).toBe('12')
  })
  it('kutip, koma, titik koma, baris baru, array, BOM + CRLF', () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"')
    expect(csvCell('a; b')).toBe('"a; b"')
    expect(csvCell(['musik', 'galeri'])).toBe('"musik, galeri"')
    // Pemisah kolom titik koma (Excel berbahasa Indonesia langsung memisah kolom).
    const csv = toCsv(['A', 'B'], [['x', 'y\nz']])
    expect(csv.startsWith('﻿A;B\r\n')).toBe(true)
    expect(csv).toContain('x;"y\nz"')
  })
  it('waktu WIB', () => {
    expect(formatWib('2026-10-16T12:00:00.000Z')).toBe('2026-10-16 19:00:00')
  })
})
