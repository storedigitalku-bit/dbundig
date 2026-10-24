/**
 * Kompatibilitas dengan widget Form Order (builder Elementor): field/section yang ditambah admin di widget harus
 * diterima server dan tampil rapi tanpa ada field yang hilang. Bentuk data mengikuti plugin:
 * - key: sanitize_key, maks. 64 (custom: field_<id>), rekening bank_*_1..10, cerita love_extra_1..10_*;
 * - label kembar diberi konteks "Bagian: Label" lalu "(2)"; nilai pilihan = kode opsi; maks. 200 field.
 */
import { describe, expect, it } from 'vitest'
import { ContractError, sanitizeFormOrderMeta, validateFormOrderSubmission } from '../../server/lib/contract'
import { groupOrderEntries, orderSummary } from '../../shared/orderSections'

const code = (fn: () => unknown) => { try { fn(); return 'ok' } catch (e) { return e instanceof ContractError ? e.code : 'other' } }

// Isi standar widget (sama dengan data live) + tambahan dari builder.
const fields: Record<string, string | string[]> = {
  customer_name: 'Rina', customer_email: 'rina@example.com', customer_phone: '081234567890', invitation_side: 'pria',
  groom_full_name: 'Budi Santoso', groom_phone: '0812', bride_full_name: 'Sari Dewi', bride_phone: '0857',
  akad_date: '2026-12-01', reception_date: '2026-12-02', ngunduh_date: '',
  love_meeting_title: 'Pertama Bertemu', love_meeting_date: '2020-01-01', love_meeting_story: 'Di kampus',
  love_lamaran_title: 'Lamaran', love_lamaran_date: '2025-05-05', love_lamaran_story: 'Keluarga datang',
  music_title: 'Perfect', photo_drive_url: 'https://drive.google.com/x',
  // Step baru buatan admin: kunci otomatis & label kembar dengan step lain.
  field_8f2c1a: ['gold', 'musik'], field_91ab7d: 'Sage green', field_77aa01: 'Tanpa catatan', field_77aa01_b2: 'Kirim cepat',
}
const labels: Record<string, string> = {
  customer_name: 'Nama Pemesan', customer_email: 'Email', customer_phone: 'No. WhatsApp Pemesan', invitation_side: 'Undangan dari pihak',
  groom_full_name: 'Pria: Nama Lengkap', groom_phone: 'Pria: No. WhatsApp', bride_full_name: 'Wanita: Nama Lengkap', bride_phone: 'Wanita: No. WhatsApp',
  akad_date: 'Akad — Hari/Tanggal', reception_date: 'Resepsi — Hari/Tanggal', ngunduh_date: 'Ngunduh Mantu — Hari/Tanggal',
  love_meeting_title: 'Pertama Bertemu: Judul Perjalanan', love_meeting_date: 'Tanggal Pertama Bertemu', love_meeting_story: 'Cerita Pertama Bertemu',
  love_lamaran_title: 'Lamaran: Judul Perjalanan', love_lamaran_date: 'Tanggal Lamaran', love_lamaran_story: 'Cerita Lamaran',
  music_title: 'Musik/Judul Lagu', photo_drive_url: 'Link Google Drive Foto',
  field_8f2c1a: 'Pilihan Paket', field_91ab7d: 'Tema Warna', field_77aa01: 'Paket & Tema: Catatan', field_77aa01_b2: 'Tambahan: Catatan',
}
for (let n = 1; n <= 10; n++) {
  fields[`bank_name_${n}`] = `Bank ${n}`; labels[`bank_name_${n}`] = `Nama Bank ${n}`
  fields[`bank_account_${n}`] = `00${n}`; labels[`bank_account_${n}`] = `Nomor Rekening ${n}`
  fields[`love_extra_${n}_title`] = `Cerita ${n}`; labels[`love_extra_${n}_title`] = n === 1 ? 'Cerita Cinta: Judul Perjalanan' : `Cerita Cinta: Judul Perjalanan (${n})`
  fields[`love_extra_${n}_date`] = ''; labels[`love_extra_${n}_date`] = n === 1 ? 'Tanggal Perjalanan' : `Tanggal Perjalanan (${n})`
}
const entries = Object.keys(fields).map((key) => ({ key, label: labels[key]!, value: fields[key]! }))
const base = { post_id: 5, post_title: 'Pesan Undangan', document_id: 5, element_id: 'a1b2c3d', request_id: 'c'.repeat(64), fields, labels }

describe('kompatibilitas widget Form Order', () => {
  it('server menerima isi widget + section/field tambahan buatan admin', () => {
    expect(code(() => validateFormOrderSubmission(base))).toBe('ok')
  })

  it('tidak ada field yang hilang; tiap field muncul tepat sekali', () => {
    const keys = groupOrderEntries(entries).flatMap((s) => s.fields.map((f) => f.key))
    expect(keys.sort()).toEqual(Object.keys(fields).sort())
  })

  it('bagian tersusun rapi: standar, Cerita Cinta (termasuk jenis baru), bagian baru, Rekening 1–10 urut, Lainnya', () => {
    const g = groupOrderEntries(entries)
    const titles = g.map((s) => s.title)
    expect(titles.slice(0, 7)).toEqual(['Pemesan', 'Pria', 'Wanita', 'Akad', 'Resepsi', 'Ngunduh Mantu', 'Cerita Cinta'])
    expect(titles.filter((t) => t.startsWith('Rekening'))).toEqual(Array.from({ length: 10 }, (_, i) => `Rekening ${i + 1}`))
    expect(titles.at(-1)).toBe('Lainnya')
    // Label kembar antar-step → bagian sendiri sesuai nama step.
    expect(g.find((s) => s.title === 'Paket & Tema')!.fields.map((f) => f.field)).toEqual(['Catatan'])
    // Jenis cerita baru "Lamaran" tetap di Cerita Cinta (tidak terpecah), setelah cerita bawaan & sebelum cerita tambahan.
    const story = g.find((s) => s.title === 'Cerita Cinta')!
    const groups = [...new Set(story.fields.map((f) => f.group))]
    expect(groups.slice(0, 2)).toEqual(['Pertama Bertemu', 'Lamaran'])
    expect(groups.slice(2)).toEqual(Array.from({ length: 10 }, (_, i) => `Cerita tambahan ${i + 1}`))
    expect(titles).not.toContain('Lamaran')
    expect(g.find((s) => s.title === 'Lainnya')!.fields.some((f) => f.key.startsWith('love_'))).toBe(false)
  })

  it('kode pilihan bawaan tampil sebagai teks; nilai custom & array tetap utuh', () => {
    const g = groupOrderEntries(entries)
    expect(g.find((s) => s.title === 'Pemesan')!.fields.find((f) => f.key === 'invitation_side')!.value).toBe('Pria')
    expect(g.flatMap((s) => s.fields).find((f) => f.key === 'field_8f2c1a')!.value).toEqual(['gold', 'musik'])
    expect(orderSummary(entries)).toContain('Pemesan: Rina')
  })

  it('batas sama dengan plugin: 200 field, teks 4000, pilihan 50 × 512, label 500 diterima; 201 field ditolak', () => {
    const big: Record<string, string | string[]> = {}
    const bigLabels: Record<string, string> = {}
    for (let i = 0; i < 200; i++) { big[`field_${i}`] = 'x'.repeat(4000); bigLabels[`field_${i}`] = 'L'.repeat(500) }
    big.field_0 = Array.from({ length: 50 }, (_, i) => `${i}`.padEnd(512, 'y'))
    expect(code(() => validateFormOrderSubmission({ ...base, fields: big, labels: bigLabels }))).toBe('ok')
    expect(code(() => validateFormOrderSubmission({ ...base, fields: { ...big, field_200: 'x' }, labels: bigLabels }))).toBe('invalid_request')
    // Kunci maksimal plugin (64 karakter, sanitize_key) diterima.
    expect(code(() => validateFormOrderSubmission({ ...base, fields: { ['k'.repeat(64)]: 'a' }, labels: { ['k'.repeat(64)]: 'A' } }))).toBe('ok')
  })

  it('meta plugin baru: nama step mengganti "Lainnya", teks opsi menggantikan kodenya; meta rusak dibuang tanpa menolak order', () => {
    const meta = sanitizeFormOrderMeta({
      field_sections: { field_91ab7d: 'Paket & Tema', music_title: 'Tambahan', tidak_ada: 'X', field_8f2c1a: '' },
      option_labels: { field_8f2c1a: { gold: 'Paket Gold', musik: 'Musik latar' }, invitation_side: { pria: 'Pihak Pria' }, rusak: 'bukan-objek' },
    }, fields)
    expect(meta).toEqual({
      sections: { field_91ab7d: 'Paket & Tema', music_title: 'Tambahan' },
      options: { field_8f2c1a: { gold: 'Paket Gold', musik: 'Musik latar' }, invitation_side: { pria: 'Pihak Pria' } },
    })
    const g = groupOrderEntries(entries, meta)
    expect(g.find((s) => s.title === 'Paket & Tema')!.fields.map((f) => f.key).sort()).toEqual(['field_77aa01', 'field_91ab7d'])
    expect(g.find((s) => s.title === 'Tambahan')!.fields.map((f) => f.key)).toContain('music_title')
    expect(g.flatMap((s) => s.fields).find((f) => f.key === 'field_8f2c1a')!.value).toEqual(['Paket Gold', 'Musik latar'])
    expect(g.flatMap((s) => s.fields).find((f) => f.key === 'invitation_side')!.value).toBe('Pihak Pria')
    // Bagian terstruktur (Pria, Akad, Cerita Cinta, Rekening) tidak ditimpa nama step.
    expect(groupOrderEntries(entries, { sections: { groom_full_name: 'Mempelai Pria', love_meeting_title: 'Cerita Cinta' } }).map((s) => s.title)).toContain('Pria')
    // Meta sama sekali tidak valid → kosong, order tetap diterima.
    expect(sanitizeFormOrderMeta({ field_sections: 'x', option_labels: [1, 2] }, fields)).toEqual({})
    expect(code(() => validateFormOrderSubmission({ ...base, field_sections: 'x', option_labels: 5 }))).toBe('ok')
  })
})
