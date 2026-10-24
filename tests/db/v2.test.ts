/** Fitur lanjutan di PostgreSQL 17 lokal: meta order, kalender acara, pengaturan, log error, push, Realtime, MFA. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { startLocalDb, type LocalDb } from '../helpers/localdb'

let db: LocalDb
let website: string
const ADMIN = randomUUID()
const CUST = randomUUID()
const CUST2 = randomUUID()
const asAdmin = <T>(fn: (c: import('pg').PoolClient) => Promise<T>) => db.asRole('authenticated', ADMIN, fn)
const asCust = <T>(fn: (c: import('pg').PoolClient) => Promise<T>) => db.asRole('authenticated', CUST, fn)
const order = (request: string, fields: Record<string, unknown>, meta?: unknown) => db.rpc('api_form_order_submit', {
  p_website: website,
  p: { post_id: 5, post_title: 'Pesan', document_id: 5, element_id: 'order1', request_id: request.padEnd(64, '0'), fields, labels: {}, ...(meta === undefined ? {} : { meta }) },
})

beforeAll(async () => {
  db = await startLocalDb()
  website = (await db.pool.query(`insert into public.websites (name, site_url, external_site_id) values ('A', 'https://a.example/', 'site-${'a'.repeat(32)}') returning id`)).rows[0].id
  await db.pool.query(`insert into auth.users (id, email) values ($1, 'adm@akun.mdundig.invalid'), ($2, 'c1@akun.mdundig.invalid'), ($3, 'c2@akun.mdundig.invalid')`, [ADMIN, CUST, CUST2])
  await db.pool.query(`insert into public.platform_admins (user_id) values ($1)`, [ADMIN])
})
afterAll(async () => { await db?.stop() })

describe('meta order dari widget', () => {
  it('meta disimpan; kiriman ulang (request sama) dengan/tanpa meta tetap duplikat, bukan konflik', async () => {
    const meta = { sections: { paket: 'Paket & Tema' }, options: { paket: { gold: 'Paket Gold' } } }
    const first = await order('a1', { paket: 'gold' }, meta)
    expect(first.error).toBeNull()
    expect((first.data as { duplicate: boolean }).duplicate).toBe(false)
    const again = await order('a1', { paket: 'gold' })
    expect(again.error).toBeNull()
    expect((again.data as { duplicate: boolean }).duplicate).toBe(true)
    const row = (await db.pool.query(`select meta from public.form_orders where request_id = $1`, ['a1'.padEnd(64, '0')])).rows[0]
    expect(row.meta).toEqual(meta)
    // Plugin lama tanpa meta → objek kosong; meta bukan objek diabaikan.
    await order('a2', { x: '1' })
    await order('a3', { x: '1' }, 'bukan-objek')
    const rows = (await db.pool.query(`select meta from public.form_orders where request_id in ($1, $2)`, ['a2'.padEnd(64, '0'), 'a3'.padEnd(64, '0')])).rows
    expect(rows.map((r) => r.meta)).toEqual([{}, {}])
  })
})

describe('kalender acara (order_events)', () => {
  it('hanya tanggal valid; order batal tidak ikut; khusus admin', async () => {
    await order('e1', { akad_date: '2026-12-01', akad_time: '08:00', reception_date: '2026-12-02', ngunduh_date: '', groom_nickname: 'Budi', bride_full_name: 'Sari Dewi', customer_name: 'Rina' })
    await order('e2', { akad_date: '2026-02-30', reception_date: 'besok', ngunduh_date: ['x'] })
    await order('e3', { akad_date: '2026-12-05' })
    await db.pool.query(`update public.form_orders set status = 'batal' where request_id = $1`, ['e3'.padEnd(64, '0')])
    const rows = await asAdmin((c) => c.query(`select kind, event_date::text d, event_time, groom, bride, customer from public.order_events order by event_date, kind`))
    expect(rows.rows).toEqual([
      { kind: 'akad', d: '2026-12-01', event_time: '08:00', groom: 'Budi', bride: 'Sari Dewi', customer: 'Rina' },
      { kind: 'resepsi', d: '2026-12-02', event_time: null, groom: 'Budi', bride: 'Sari Dewi', customer: 'Rina' },
    ])
    expect((await asCust((c) => c.query(`select * from public.order_events`))).rows).toEqual([])
  })
})

describe('pengaturan aplikasi', () => {
  it('admin bisa simpan & baca; pelanggan tidak bisa', async () => {
    await asAdmin((c) => c.query(`insert into public.app_settings (key, value, updated_by) values ('wa.access_template', '"Halo {nama}"', $1)`, [ADMIN]))
    expect((await asAdmin((c) => c.query(`select value from public.app_settings where key = 'wa.access_template'`))).rows[0].value).toBe('Halo {nama}')
    expect((await asCust((c) => c.query(`select * from public.app_settings`))).rows).toEqual([])
    await expect(asCust((c) => c.query(`insert into public.app_settings (key, value) values ('wa.x', '"x"')`))).rejects.toThrow(/row-level security/)
  })
})

describe('log error', () => {
  it('ditulis server; hanya admin yang membaca; lebih dari 30 hari dihapus otomatis', async () => {
    await db.pool.query(`insert into public.error_logs (source, status, path, message, created_at) values ('server', 500, '/x', 'lama', now() - interval '31 days')`)
    await db.pool.query(`insert into public.error_logs (source, status, path, message) values ('client', null, '/y', 'baru')`)
    const seen = await asAdmin((c) => c.query(`select message from public.error_logs order by id`))
    expect(seen.rows.map((r) => r.message)).toEqual(['baru'])
    expect((await asCust((c) => c.query(`select * from public.error_logs`))).rows).toEqual([])
    await expect(asAdmin((c) => c.query(`insert into public.error_logs (source, message) values ('client', 'x')`))).rejects.toThrow(/permission denied/)
  })
})

describe('langganan push', () => {
  it('pemilik melihat & menghapus miliknya saja', async () => {
    await db.pool.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/a', 'k', 'a'), ($2, 'https://push.example/b', 'k', 'a')`, [CUST, CUST2])
    expect((await asCust((c) => c.query(`select endpoint from public.push_subscriptions`))).rows).toEqual([{ endpoint: 'https://push.example/a' }])
    await asCust((c) => c.query(`delete from public.push_subscriptions`))
    expect((await db.pool.query(`select count(*)::int n from public.push_subscriptions`)).rows[0].n).toBe(1)
    await expect(db.pool.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'http://tidak-aman', 'k', 'a')`, [CUST])).rejects.toThrow(/check/)
  })
})

describe('Realtime & sesi', () => {
  it('notifications masuk publikasi Realtime', async () => {
    const r = await db.pool.query(`select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications'`)
    expect(r.rowCount).toBe(1)
  })
  it('session_info: peran admin, faktor 2 langkah terverifikasi, dan level sesi (aal)', async () => {
    const info = async (sub: string, aal?: string) => {
      const c = await db.pool.connect()
      try {
        await c.query('begin')
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated', ...(aal ? { aal } : {}) })])
        await c.query('set local role authenticated')
        const r = (await c.query(`select public.session_info() as i`)).rows[0].i
        await c.query('rollback')
        return r
      } finally { c.release() }
    }
    expect(await info(ADMIN)).toEqual({ is_admin: true, mfa_enrolled: false, aal: 'aal1' })
    expect(await info(CUST)).toEqual({ is_admin: false, mfa_enrolled: false, aal: 'aal1' })
    await db.pool.query(`insert into auth.mfa_factors (id, user_id, status) values ($1, $2, 'unverified')`, [randomUUID(), ADMIN])
    expect((await info(ADMIN)).mfa_enrolled).toBe(false)
    await db.pool.query(`update auth.mfa_factors set status = 'verified' where user_id = $1`, [ADMIN])
    expect(await info(ADMIN, 'aal2')).toEqual({ is_admin: true, mfa_enrolled: true, aal: 'aal2' })
    await expect(db.asRole('anon', null, (c) => c.query(`select public.session_info()`))).rejects.toThrow(/permission denied/)
  })
})
