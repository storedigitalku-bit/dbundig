import { describe, expect, it } from 'vitest'
import { groupOrderEntries, orderSummary, splitLabel } from '../../shared/orderSections'

// Label sesuai data nyata widget Form Order (Pria:/Wanita:, Akad —, Nama Bank 1, …)
const entries = [
  { key: 'akad_date', label: 'Akad — Hari/Tanggal', value: '' },
  { key: 'akad_time', label: 'Akad — Waktu', value: '08:00' },
  { key: 'bank_name_1', label: 'Nama Bank 1', value: 'BCA' },
  { key: 'bank_account_1', label: 'Nomor Rekening 1', value: '0012' },
  { key: 'bride_phone', label: 'Wanita: No. WhatsApp', value: '0857' },
  { key: 'groom_phone', label: 'Pria: No. WhatsApp', value: '0857' },
  { key: 'bride_full_name', label: 'Wanita: Nama Lengkap', value: 'Sari Dewi' },
  { key: 'groom_full_name', label: 'Pria: Nama Lengkap', value: 'Budi Santoso' },
  { key: 'groom_nickname', label: 'Pria: Nama Panggilan', value: 'Budi' },
  { key: 'customer_name', label: 'Nama Pemesan', value: 'Rina' },
  { key: 'invitation_side', label: 'Undangan dari pihak', value: 'pria' },
  { key: 'music_title', label: 'Musik/Judul Lagu', value: '' },
  { key: 'addons', label: 'Tambahan', value: ['musik', 'galeri'] },
]

describe('orderSections', () => {
  it('memisahkan bagian & nama field', () => {
    expect(splitLabel('bride_phone', 'Wanita: No. WhatsApp')).toEqual({ section: 'Wanita', field: 'No. WhatsApp' })
    expect(splitLabel('akad_time', 'Akad — Waktu')).toEqual({ section: 'Akad', field: 'Waktu' })
    expect(splitLabel('bank_account_1', 'Nomor Rekening 1')).toEqual({ section: 'Rekening 1', field: 'Nomor Rekening' })
    expect(splitLabel('customer_name', 'Nama Pemesan')).toEqual({ section: 'Pemesan', field: 'Nama Pemesan' })
    expect(splitLabel('music_title', 'Musik/Judul Lagu')).toEqual({ section: 'Lainnya', field: 'Musik/Judul Lagu' })
  })
  it('urutan bagian & field rapi: Pemesan, Pria, Wanita, Akad, Rekening, Lainnya; nama sebelum kontak', () => {
    const g = groupOrderEntries(entries)
    expect(g.map((s) => s.title)).toEqual(['Pemesan', 'Pria', 'Wanita', 'Akad', 'Rekening 1', 'Lainnya'])
    expect(g[1]!.fields.map((f) => f.field)).toEqual(['Nama Lengkap', 'Nama Panggilan', 'No. WhatsApp'])
    expect(g[3]!.fields.find((f) => f.key === 'akad_date')!.empty).toBe(true)
  })
  it('Cerita Cinta: semua cerita (judul, tanggal, isi) jadi satu bagian, dikelompokkan per cerita & urut kronologis', () => {
    // Label asli dari widget (data live): judul berawalan nama cerita, tanggal & isi tanpa awalan.
    const love = [
      { key: 'love_extra_1_title', label: 'Cerita Cinta: Judul Perjalanan', value: 'Hidup Bahagia' },
      { key: 'love_journey_title', label: 'Menuju Pernikahan: Judul Perjalanan', value: 'Menuju Pernikahan' },
      { key: 'love_meeting_story', label: 'Cerita Pertama Bertemu', value: 'Bertemu di kampus' },
      { key: 'love_meeting_title', label: 'Pertama Bertemu: Judul Perjalanan', value: 'Pertama Bertemu' },
      { key: 'love_meeting_date', label: 'Tanggal Pertama Bertemu', value: '2020-01-01' },
      { key: 'love_engagement_title', label: 'Pertunangan: Judul Perjalanan', value: 'Pertunangan' },
      { key: 'love_engagement_date', label: 'Tanggal Pertunangan', value: '' },
    ]
    const g = groupOrderEntries([...entries, ...love])
    expect(g.map((s) => s.title)).toEqual(['Pemesan', 'Pria', 'Wanita', 'Akad', 'Cerita Cinta', 'Rekening 1', 'Lainnya'])
    const story = g.find((s) => s.title === 'Cerita Cinta')!
    expect(story.fields.map((f) => `${f.group} / ${f.field}`)).toEqual([
      'Pertama Bertemu / Judul', 'Pertama Bertemu / Tanggal', 'Pertama Bertemu / Cerita',
      'Pertunangan / Judul', 'Pertunangan / Tanggal',
      'Menuju Pernikahan / Judul',
      'Cerita tambahan 1 / Judul',
    ])
    // Tidak ada lagi bagian terpisah per cerita, dan tanggal/isi cerita tidak jatuh ke "Lainnya".
    expect(g.some((s) => ['Pertama Bertemu', 'Pertunangan', 'Menuju Pernikahan'].includes(s.title))).toBe(false)
    expect(g.find((s) => s.title === 'Lainnya')!.fields.some((f) => f.key.startsWith('love_'))).toBe(false)
  })
  it('ringkasan satu baris mendahulukan pemesan & mempelai, melewati field kosong', () => {
    expect(orderSummary(entries)).toBe('Pemesan: Rina · Pria: Budi · Wanita: Sari Dewi')
    expect(orderSummary([{ key: 'x', label: 'Akad — Waktu', value: '' }, { key: 'y', label: 'Paket', value: 'Gold' }])).toBe('Paket: Gold')
  })
})
