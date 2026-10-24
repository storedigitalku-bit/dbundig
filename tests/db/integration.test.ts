/**
 * Kontrak API + transaksi terhadap PostgreSQL 17 lokal sungguhan (fixture lokal, bukan Supabase live).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleIntegration, hashToken, type IntegrationDeps, type Module } from '../../server/lib/integration'
import { startLocalDb, type LocalDb } from '../helpers/localdb'
import {
  HASH_SECRET, SITE_A, SITE_B, TOKEN_A, TOKEN_B, URL_A, URL_B, catalog, dhBody, foBody, gift, hex64, reserveExtra,
} from '../helpers/fixtures'

let db: LocalDb
let deps: IntegrationDeps
const ISO_Z = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/

async function send(module: Module, body: unknown, token = TOKEN_A, method = 'POST') {
  return handleIntegration(module, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    rawBody: typeof body === 'string' ? body : JSON.stringify(body),
  }, deps)
}

beforeAll(async () => {
  db = await startLocalDb()
  deps = { rpc: db.rpc, tokenHashSecret: HASH_SECRET, rateLimitPerMinute: 100_000 }
  const { rows: [a] } = await db.pool.query(`insert into public.websites (name, site_url) values ('A', $1) returning id`, [URL_A])
  const { rows: [b] } = await db.pool.query(`insert into public.websites (name, site_url) values ('B', $1) returning id`, [URL_B])
  await db.pool.query(`insert into public.website_tokens (website_id, token_hash, token_hint, scopes) values ($1, $2, 'x', array['daftar_hadiah','form_order'])`, [a.id, hashToken(TOKEN_A, HASH_SECRET)])
  await db.pool.query(`insert into public.website_tokens (website_id, token_hash, token_hint, scopes) values ($1, $2, 'y', array['daftar_hadiah'])`, [b.id, hashToken(TOKEN_B, HASH_SECRET)])
})
afterAll(async () => { await db?.stop() })

describe('transport & envelope', () => {
  it('ping: envelope persis, backend_ready true, tidak membuat data', async () => {
    const body = dhBody('ping')
    const res = await send('daftar_hadiah', body)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      service: 'apeiron-daftar-hadiah', version: 'registry-api-v1', schema_version: 1, operation: 'ping',
      correlation_id: body.correlation_id, success: true, data: { backend_ready: true }, error: null,
    })
    const { rows: [c] } = await db.pool.query('select (select count(*) from public.invitations)::int i, (select count(*) from public.reservations)::int r')
    expect(c).toEqual({ i: 0, r: 0 })
  })

  it('GET bukan pembaca data → 405 JSON', async () => {
    const res = await send('daftar_hadiah', '', TOKEN_A, 'GET')
    expect(res.status).toBe(405)
    expect(res.body.success).toBe(false)
    expect(res.body.data).toBeNull()
  })

  it('JSON rusak → 400 JSON aman', async () => {
    const res = await send('daftar_hadiah', '{bukan json')
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ service: 'apeiron-daftar-hadiah', success: false, error: 'invalid_request' })
  })

  it('token salah → 401, token website A tidak bisa memakai identitas website B → 403', async () => {
    expect((await send('daftar_hadiah', dhBody('ping'), 'mdh_' + 'f'.repeat(64))).status).toBe(401)
    expect((await send('daftar_hadiah', dhBody('ping', {}, SITE_B, URL_A))).status).toBe(403)
    expect((await send('daftar_hadiah', dhBody('ping', {}, SITE_A, URL_B))).status).toBe(403)
    expect((await send('daftar_hadiah', dhBody('ping', {}, SITE_B, URL_B), TOKEN_B)).status).toBe(200)
    expect((await send('daftar_hadiah', dhBody('ping', {}, SITE_A, URL_B), TOKEN_B)).status).toBe(403)
  })

  it('token tanpa izin Form Order ditolak untuk ping Form Order', async () => {
    const res = await send('form_order', foBody('ping', {}, SITE_B, URL_B), TOKEN_B)
    expect(res.status).toBe(403)
  })

  it('error tidak membocorkan detail SQL', async () => {
    const res = await send('daftar_hadiah', dhBody('availability', catalog({ registry_id: 'registry-1-x', document_id: 2, element_id: 'x' })))
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('invalid_catalog')
    expect(JSON.stringify(res.body)).not.toMatch(/\bselect\b|\binsert\b|\brelation\b|postgres|sqlstate|violates/i)
    expect(Object.keys(res.body).sort()).toEqual(['correlation_id', 'data', 'error', 'operation', 'schema_version', 'service', 'success', 'version'])
  })
})

describe('Daftar Hadiah', () => {
  it('availability pertama membuat katalog otomatis; kapasitas ≠ jumlah awal; tipe integer & owner null', async () => {
    const body = dhBody('availability', catalog())
    const res = await send('daftar_hadiah', body)
    expect(res.status).toBe(200)
    const data = res.body.data as Record<string, unknown>
    expect(data.scope).toStrictEqual({ website_id: SITE_A, invitation_id: 101, registry_id: 'registry-900-abc', owner_id: null })
    expect(data.gifts).toStrictEqual([
      { gift_id: 'gift-stable', initial_quantity: 5, available_quantity: 4, availability: 'available' },
      { gift_id: 'gift-one', initial_quantity: 1, available_quantity: 1, availability: 'available' },
    ])
  })

  it('reserve: receipt, stok 4→3 (tersedia 3 dari 5), timestamp UTC Z, idempotent', async () => {
    const body = dhBody('reserve', { ...catalog(), ...reserveExtra('d', '6281234567890') })
    const first = await send('daftar_hadiah', body)
    expect(first.status).toBe(200)
    const d1 = first.body.data as Record<string, any>
    expect(d1).toMatchObject({ status: 'confirmed', gift_id: 'gift-stable', quantity: 1, already_reserved: false })
    expect(d1.reservation_id).toMatch(UUID)
    expect(d1.timestamp).toMatch(ISO_Z)
    expect(d1.gifts[0]).toStrictEqual({ gift_id: 'gift-stable', initial_quantity: 5, available_quantity: 3, availability: 'available' })
    const retry = await send('daftar_hadiah', { ...body, correlation_id: 'retry-1' })
    const d2 = retry.body.data as Record<string, any>
    expect(retry.body.correlation_id).toBe('retry-1')
    expect(d2.reservation_id).toBe(d1.reservation_id)
    expect(d2.timestamp).toBe(d1.timestamp)
    expect(d2.already_reserved).toBe(true)
    expect(d2.gifts[0].available_quantity).toBe(3)
  })

  it('request_id sama dengan isi berbeda → 409 request_conflict', async () => {
    const res = await send('daftar_hadiah', dhBody('reserve', { ...catalog(), ...reserveExtra('d', '6281234567890', 'gift-stable', 'Lain') }))
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('request_conflict')
  })

  it('WhatsApp sama memilih hadiah sama → reservasi lama, already_reserved', async () => {
    const res = await send('daftar_hadiah', dhBody('reserve', { ...catalog(), ...reserveExtra('e', '6281234567890') }))
    const d = res.body.data as Record<string, any>
    expect(d.already_reserved).toBe(true)
    expect(d.gifts[0].available_quantity).toBe(3)
  })

  it('reserve pertama pada undangan baru tanpa availability; template sama → stok terpisah', async () => {
    const res = await send('daftar_hadiah', dhBody('reserve', { ...catalog({ invitation_id: 202, invitation_title: 'Rina & Doni' }), ...reserveExtra('f', '6281234567890') }))
    expect(res.status).toBe(200)
    const d = res.body.data as Record<string, any>
    expect(d.already_reserved).toBe(false)
    expect(d.gifts[0].available_quantity).toBe(3)
    expect(d.scope.invitation_id).toBe(202)
    const again = await send('daftar_hadiah', dhBody('availability', catalog()))
    expect((again.body.data as any).gifts[0].available_quantity).toBe(3)
  })

  it('dua website dengan post/gift ID sama tetap terpisah', async () => {
    const res = await send('daftar_hadiah', dhBody('availability', catalog(), SITE_B, URL_B), TOKEN_B)
    expect((res.body.data as any).gifts[0].available_quantity).toBe(4)
  })

  it('revisi lama & hash konflik ditolak (catalog_stale 409)', async () => {
    expect((await send('daftar_hadiah', dhBody('availability', catalog({ catalog_version: '1760000000000' })))).body.error).toBe('catalog_stale')
    const conflict = await send('daftar_hadiah', dhBody('sync_catalog', catalog({ catalog_hash: 'd'.repeat(64) })))
    expect(conflict.status).toBe(409)
    expect(conflict.body.error).toBe('catalog_stale')
  })

  it('hadiah dihapus → inactive, riwayat tetap; sinkron ulang tidak mereset reservasi', async () => {
    const removed = await send('daftar_hadiah', dhBody('sync_catalog', catalog({ catalog_version: '1760000000002', catalog_hash: 'e'.repeat(64), gifts: [gift('gift-one', 1, 1)] })))
    expect((removed.body.data as any).gifts).toHaveLength(1)
    const { rows: [h] } = await db.pool.query(`select count(*)::int n from public.reservations r join public.invitations i on i.id = r.invitation_id where i.wp_post_id = 101 and r.gift_name = 'Rice Cooker'`)
    expect(h.n).toBe(1)
    const restored = await send('daftar_hadiah', dhBody('availability', catalog({ catalog_version: '1760000000003', catalog_hash: 'f'.repeat(64) })))
    expect((restored.body.data as any).gifts[0].available_quantity).toBe(3)
  })

  it('owner_id eksternal dikembalikan persis (bukan UUID Supabase)', async () => {
    const res = await send('daftar_hadiah', dhBody('availability', catalog({ owner_id: 'customer-101', catalog_version: '1760000000003', catalog_hash: 'f'.repeat(64) })))
    expect((res.body.data as any).scope.owner_id).toBe('customer-101')
  })

  it('reservations: total integer, next_offset null, terbaru dahulu, guest lengkap, [] bila kosong', async () => {
    const res = await send('daftar_hadiah', dhBody('reservations', { ...catalog({ catalog_version: '1760000000003', catalog_hash: 'f'.repeat(64) }), offset: 0 }))
    const d = res.body.data as Record<string, any>
    expect(d.total).toBe(1)
    expect(d.next_offset).toBeNull()
    expect(d.reservations[0]).toMatchObject({ gift_id: 'gift-stable', gift_name: 'Rice Cooker', quantity: 1, status: 'confirmed', message: 'Selamat' })
    expect(d.reservations[0].guest).toMatchObject({ name: 'Tamu', whatsapp: '6281234567890' })
    expect(d.reservations[0].guest.id).toMatch(/^guest-[a-f0-9]{64}$/)
    const empty = await send('daftar_hadiah', dhBody('reservations', { ...catalog({ invitation_id: 999 }), offset: 0 }))
    expect((empty.body.data as any).reservations).toEqual([])
    expect((empty.body.data as any).total).toBe(0)
  })

  it('validasi tamu: nama >100, WhatsApp tidak valid, quantity 2 → invalid_request', async () => {
    for (const bad of [
      { ...reserveExtra('a', '6281234567890'), guest: { name: 'x'.repeat(101), whatsapp: '6281234567890' } },
      reserveExtra('a', '081234'),
      { ...reserveExtra('a', '6281234567890'), quantity: 2 },
      { ...reserveExtra('a', '6281234567890'), request_id: 'a'.repeat(32) },
    ]) {
      const res = await send('daftar_hadiah', dhBody('reserve', { ...catalog({ catalog_version: '1760000000003', catalog_hash: 'f'.repeat(64) }), ...bad }))
      expect(res.body.error).toBe('invalid_request')
    }
  })
})

describe('Konkurensi (koneksi paralel sungguhan)', () => {
  it('stok 1: dari 25 permintaan paralel berbeda, tepat satu berhasil', async () => {
    const cat = catalog({ invitation_id: 500, registry_id: 'registry-7-solo', document_id: 7, element_id: 'solo', gifts: [gift('gift-solo', 1, 1)] })
    await send('daftar_hadiah', dhBody('availability', cat))
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      send('daftar_hadiah', dhBody('reserve', { ...cat, gift_id: 'gift-solo', quantity: 1, request_id: hex64(1000 + i), guest: { name: `P${i}`, whatsapp: `62812${String(i).padStart(8, '0')}` }, message: '' }))))
    const ok = results.filter((r) => r.status === 200)
    const sold = results.filter((r) => r.body.error === 'gift_unavailable')
    expect(ok).toHaveLength(1)
    expect(sold).toHaveLength(24)
    const { rows: [c] } = await db.pool.query(`select count(*)::int n from public.reservations r join public.gifts g on g.id = r.gift_id where g.gift_key = 'gift-solo'`)
    expect(c.n).toBe(1)
  })

  it('stok 3: 20 permintaan paralel → tepat 3 berhasil, tidak oversell', async () => {
    const cat = catalog({ invitation_id: 501, registry_id: 'registry-7-tri', document_id: 7, element_id: 'tri', gifts: [gift('gift-tri', 3, 3)] })
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      send('daftar_hadiah', dhBody('reserve', { ...cat, gift_id: 'gift-tri', quantity: 1, request_id: hex64(2000 + i), guest: { name: `T${i}`, whatsapp: `62813${String(i).padStart(8, '0')}` }, message: '' }))))
    expect(results.filter((r) => r.status === 200)).toHaveLength(3)
    expect(results.every((r) => r.status === 200 || r.body.error === 'gift_unavailable')).toBe(true)
  })

  it('request identik paralel (retry/timeout) → satu reservasi, receipt sama', async () => {
    const cat = catalog({ invitation_id: 502, registry_id: 'registry-7-dup', document_id: 7, element_id: 'dup', gifts: [gift('gift-dup', 5, 5)] })
    const body = dhBody('reserve', { ...cat, gift_id: 'gift-dup', quantity: 1, request_id: hex64(3000), guest: { name: 'Sama', whatsapp: '6281400000000' }, message: '' })
    const results = await Promise.all(Array.from({ length: 10 }, () => send('daftar_hadiah', body)))
    const ids = new Set(results.map((r) => (r.body.data as any)?.reservation_id))
    expect(results.every((r) => r.status === 200)).toBe(true)
    expect(ids.size).toBe(1)
    const { rows: [c] } = await db.pool.query(`select count(*)::int n from public.reservations where request_id = $1`, [hex64(3000)])
    expect(c.n).toBe(1)
  })
})

describe('Form Order', () => {
  const fields = {
    groom_name: 'Andi', bank_account: '0012345678', phone: '081200000000', addons: ['musik', 'galeri'],
    akad_date: '2026-12-01', akad_time: '08:30', custom_field_x: 'nilai bebas',
  }
  const labels = { groom_name: 'Nama Pria', bank_account: 'Nomor Rekening', phone: 'Telepon', addons: 'Tambahan', akad_date: 'Tanggal Akad', akad_time: 'Jam Akad', custom_field_x: 'Catatan' }
  const submission = { post_id: 5, post_title: 'Pesan Undangan', document_id: 5, element_id: 'order1', request_id: 'a'.repeat(64), fields, labels }

  it('ping: storage_ready & scope, tidak membuat pesanan', async () => {
    const res = await send('form_order', foBody('ping'))
    expect(res.status).toBe(200)
    expect(res.body.data).toStrictEqual({ visibility: 'admin_only', storage_ready: true, scope: { website_id: SITE_A } })
    expect((await db.pool.query('select count(*)::int n from public.form_orders')).rows[0].n).toBe(0)
  })

  it('submit: 201, receipt saja (tanpa fields), JSONB mempertahankan custom field/array/angka nol', async () => {
    const res = await send('form_order', foBody('submit', submission))
    expect(res.status).toBe(201)
    const d = res.body.data as Record<string, any>
    expect(Object.keys(d).sort()).toEqual(['order_id', 'request_id', 'scope', 'status', 'timestamp', 'visibility'])
    expect(d.scope).toStrictEqual({ website_id: SITE_A, post_id: 5, document_id: 5, element_id: 'order1' })
    expect(d.order_id).toMatch(UUID)
    expect(d.timestamp).toMatch(ISO_Z)
    const { rows: [row] } = await db.pool.query('select fields, labels from public.form_orders where id = $1', [d.order_id])
    expect(row.fields).toStrictEqual(fields)
    expect(row.labels).toStrictEqual(labels)
  })

  it('retry identik → order_id & timestamp sama, tanpa duplikat; payload berbeda → request_conflict', async () => {
    const a = await send('form_order', foBody('submit', submission))
    const b = await send('form_order', foBody('submit', submission))
    expect(a.status).toBe(200)
    expect((a.body.data as any).order_id).toBe((b.body.data as any).order_id)
    expect((a.body.data as any).timestamp).toBe((b.body.data as any).timestamp)
    expect((await db.pool.query('select count(*)::int n from public.form_orders')).rows[0].n).toBe(1)
    const c = await send('form_order', foBody('submit', { ...submission, fields: { ...fields, groom_name: 'Budi' } }))
    expect(c.status).toBe(409)
    expect(c.body.error).toBe('request_conflict')
  })

  it('Token Website tidak memiliki operasi baca Form Order', async () => {
    for (const op of ['list', 'read', 'export', 'reservations']) {
      const res = await send('form_order', foBody(op))
      expect(res.body.success).toBe(false)
      expect(res.body.data).toBeNull()
    }
  })

  it('visibility selain admin_only ditolak', async () => {
    const res = await send('form_order', { ...foBody('ping'), visibility: 'public' })
    expect(res.body.error).toBe('invalid_request')
  })

  it('backend gagal tidak mengembalikan sukses palsu', async () => {
    const broken: IntegrationDeps = { ...deps, rpc: async (fn, args) => fn === 'api_form_order_submit' ? { data: null, error: { code: 'XX000', message: 'boom' } } : db.rpc(fn, args) }
    const res = await handleIntegration('form_order', { method: 'POST', headers: { authorization: `Bearer ${TOKEN_A}`, 'content-type': 'application/json' }, rawBody: JSON.stringify(foBody('submit', { ...submission, request_id: 'b'.repeat(64) })) }, broken)
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.data).toBeNull()
    const down: IntegrationDeps = { ...deps, rpc: async () => { throw new Error('network down') } }
    const res2 = await handleIntegration('daftar_hadiah', { method: 'POST', headers: { authorization: `Bearer ${TOKEN_A}`, 'content-type': 'application/json' }, rawBody: JSON.stringify(dhBody('ping')) }, down)
    expect(res2.body.success).toBe(false)
    expect(res2.status).toBeGreaterThanOrEqual(500)
  })
})

describe('Token dicabut', () => {
  it('token revoked → 401', async () => {
    await db.pool.query('update public.website_tokens set revoked_at = now() where token_hash = $1', [hashToken(TOKEN_B, HASH_SECRET)])
    expect((await send('daftar_hadiah', dhBody('ping', {}, SITE_B, URL_B), TOKEN_B)).status).toBe(401)
  })
})
