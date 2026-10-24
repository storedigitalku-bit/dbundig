/** CRUD admin di PostgreSQL 17 lokal (fixture lokal): reservasi, order, undangan, token. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { hashToken } from '../../server/lib/integration'
import { startLocalDb, type LocalDb } from '../helpers/localdb'
import { HASH_SECRET, catalog, gift } from '../helpers/fixtures'

let db: LocalDb
let website: string
let giftSolo: string
let invitation: string
const ADMIN = randomUUID()
const CUSTOMER = randomUUID()

const asAdmin = <T>(fn: (c: import('pg').PoolClient) => Promise<T>) => db.asRole('authenticated', ADMIN, fn)
const asCustomer = <T>(fn: (c: import('pg').PoolClient) => Promise<T>) => db.asRole('authenticated', CUSTOMER, fn)
const avail = async (giftId: string) =>
  (await db.pool.query(`select available_quantity from public.gift_stock where id = $1`, [giftId])).rows[0].available_quantity as number

beforeAll(async () => {
  db = await startLocalDb()
  website = (await db.pool.query(`insert into public.websites (name, site_url, external_site_id) values ('A', 'https://a.example/', 'site-${'a'.repeat(32)}') returning id`)).rows[0].id
  await db.pool.query(`insert into public.website_tokens (website_id, token_hash, scopes) values ($1, $2, array['daftar_hadiah'])`, [website, hashToken('mdh_' + 'a'.repeat(64), HASH_SECRET)])
  await db.pool.query(`insert into auth.users (id, email) values ($1, 'admin@akun.mdundig.invalid'), ($2, 'cust@akun.mdundig.invalid')`, [ADMIN, CUSTOMER])
  await db.pool.query(`insert into public.platform_admins (user_id) values ($1)`, [ADMIN])
  await db.rpc('api_dh_catalog', { p_website: website, p: { website_id: 'site-' + 'a'.repeat(32), ...catalog({ gifts: [gift('gift-solo', 2, 1), gift('gift-big', 5, 5)] }) } })
  const g = (await db.pool.query(`select id, invitation_id from public.gifts where gift_key = 'gift-solo'`)).rows[0]
  giftSolo = g.id
  invitation = g.invitation_id
})
afterAll(async () => { await db?.stop() })

describe('reservasi (admin)', () => {
  let id: string
  it('tambah manual mengurangi stok; stok habis → gift_unavailable', async () => {
    id = (await asAdmin((c) => c.query(`select public.admin_reservation_create($1, 'Budi', '6281234567890', 'Lewat telepon', 'catatan') as id`, [giftSolo]))).rows[0].id
    expect(await avail(giftSolo)).toBe(0)
    const { rows: [r] } = await db.pool.query('select source, status, admin_note, guest_id from public.reservations where id = $1', [id])
    expect(r).toMatchObject({ source: 'admin', status: 'confirmed', admin_note: 'catatan' })
    expect(r.guest_id).toMatch(/^guest-[a-f0-9]{64}$/)
    await expect(asAdmin((c) => c.query(`select public.admin_reservation_create($1, 'Sari', '6280000000001', '', '')`, [giftSolo]))).rejects.toThrow('gift_unavailable')
  })
  it('batal → stok kembali; aktifkan lagi saat stok penuh → gift_unavailable', async () => {
    await asAdmin((c) => c.query(`select public.admin_reservation_update($1, 'Budi S', '6281234567890', 'Ubah', 'cancelled', '')`, [id]))
    expect(await avail(giftSolo)).toBe(1)
    const other = (await asAdmin((c) => c.query(`select public.admin_reservation_create($1, 'Sari', '6280000000001', '', '') as id`, [giftSolo]))).rows[0].id
    await expect(asAdmin((c) => c.query(`select public.admin_reservation_update($1, 'Budi S', '6281234567890', '', 'confirmed', '')`, [id]))).rejects.toThrow('gift_unavailable')
    await asAdmin((c) => c.query(`select public.admin_reservation_delete($1)`, [other]))
    await asAdmin((c) => c.query(`select public.admin_reservation_update($1, 'Budi S', '6281234567890', '', 'confirmed', '')`, [id]))
    expect(await avail(giftSolo)).toBe(0)
  })
  it('WhatsApp ganda pada hadiah yang sama ditolak; validasi input', async () => {
    const big = (await db.pool.query(`select id from public.gifts where gift_key = 'gift-big'`)).rows[0].id
    await asAdmin((c) => c.query(`select public.admin_reservation_create($1, 'A', '6281111111111', '', '')`, [big]))
    await expect(asAdmin((c) => c.query(`select public.admin_reservation_create($1, 'B', '6281111111111', '', '')`, [big]))).rejects.toThrow('duplicate_guest')
    await expect(asAdmin((c) => c.query(`select public.admin_reservation_create($1, '', '6281111111112', '', '')`, [big]))).rejects.toThrow('invalid_request')
    await expect(asAdmin((c) => c.query(`select public.admin_reservation_create($1, 'C', '0812', '', '')`, [big]))).rejects.toThrow('invalid_request')
  })
  it('hapus mengembalikan stok; pelanggan tidak dapat CRUD', async () => {
    await expect(asCustomer((c) => c.query(`select public.admin_reservation_delete($1)`, [id]))).rejects.toThrow('forbidden')
    await expect(asCustomer((c) => c.query(`select public.admin_reservation_create($1, 'X', '6289999999999', '', '')`, [giftSolo]))).rejects.toThrow('forbidden')
    await asAdmin((c) => c.query(`select public.admin_reservation_delete($1)`, [id]))
    expect(await avail(giftSolo)).toBe(1)
  })
})

describe('order undangan (admin)', () => {
  it('admin tambah/ubah/hapus; pelanggan & order widget tidak bisa dipalsukan', async () => {
    const id = (await asAdmin((c) => c.query(
      `insert into public.form_orders (website_id, request_id, payload_hash, post_title, fields, labels, status, admin_note, source)
       values ($1, $2, $2, 'Order manual', '{"nama":"Andi","rekening":"0012"}', '{"nama":"Nama","rekening":"Rekening"}', 'baru', '', 'admin') returning id`,
      [website, 'b'.repeat(64)]))).rows[0].id
    await asAdmin((c) => c.query(`update public.form_orders set status = 'diproses', admin_note = 'dihubungi', fields = fields || '{"tambahan":"x"}' where id = $1`, [id]))
    const { rows: [o] } = await db.pool.query('select status, admin_note, fields->>\'rekening\' rekening, fields->>\'tambahan\' tambahan, post_id from public.form_orders where id = $1', [id])
    expect(o).toEqual({ status: 'diproses', admin_note: 'dihubungi', rekening: '0012', tambahan: 'x', post_id: null })
    await expect(asAdmin((c) => c.query(`update public.form_orders set status = 'aneh' where id = $1`, [id]))).rejects.toThrow(/check/)
    await expect(asAdmin((c) => c.query(`update public.form_orders set payload_hash = 'x' where id = $1`, [id]))).rejects.toThrow(/permission denied/)
    await expect(asAdmin((c) => c.query(`insert into public.form_orders (website_id, request_id, payload_hash, fields, labels, source) values ($1, $2, $2, '{}', '{}', 'widget')`, [website, 'c'.repeat(64)]))).rejects.toThrow(/row-level security/)
    await expect(asCustomer((c) => c.query(`insert into public.form_orders (website_id, request_id, payload_hash, fields, labels, source) values ($1, $2, $2, '{}', '{}', 'admin')`, [website, 'd'.repeat(64)]))).rejects.toThrow(/row-level security/)
    const del = await asCustomer((c) => c.query(`delete from public.form_orders where id = $1`, [id]))
    expect(del.rowCount).toBe(0)
    await asAdmin((c) => c.query(`delete from public.form_orders where id = $1`, [id]))
    expect((await db.pool.query('select count(*)::int n from public.form_orders where id = $1', [id])).rows[0].n).toBe(0)
  })

  it('order dari widget: isi hanya-lihat (dikunci DB); status, catatan & hapus tetap bisa', async () => {
    const id = (await db.pool.query(
      `insert into public.form_orders (website_id, request_id, payload_hash, post_title, fields, labels, source)
       values ($1, $2, $2, 'Pesan Undangan', '{"nama":"Andi"}', '{"nama":"Nama"}', 'widget') returning id`,
      [website, 'e'.repeat(64)])).rows[0].id
    await asAdmin((c) => c.query(`update public.form_orders set status = 'selesai', admin_note = 'sudah dibuat' where id = $1`, [id]))
    await expect(asAdmin((c) => c.query(`update public.form_orders set fields = '{"nama":"Andri"}' where id = $1`, [id]))).rejects.toThrow(/widget_order_readonly/)
    await expect(asAdmin((c) => c.query(`update public.form_orders set labels = '{"nama":"X"}' where id = $1`, [id]))).rejects.toThrow(/widget_order_readonly/)
    await expect(asAdmin((c) => c.query(`update public.form_orders set post_title = 'Ganti' where id = $1`, [id]))).rejects.toThrow(/widget_order_readonly/)
    const { rows: [o] } = await db.pool.query(`select status, admin_note, fields->>'nama' nama, post_title from public.form_orders where id = $1`, [id])
    expect(o).toEqual({ status: 'selesai', admin_note: 'sudah dibuat', nama: 'Andi', post_title: 'Pesan Undangan' })
    await asAdmin((c) => c.query(`delete from public.form_orders where id = $1`, [id]))
    expect((await db.pool.query('select count(*)::int n from public.form_orders where id = $1', [id])).rows[0].n).toBe(0)
  })
})

describe('undangan & token (admin)', () => {
  it('undangan dengan reservasi tidak dapat dihapus; tanpa reservasi dapat', async () => {
    await expect(asAdmin((c) => c.query('delete from public.invitations where id = $1', [invitation]))).rejects.toThrow(/foreign key/)
    await db.rpc('api_dh_catalog', { p_website: website, p: { website_id: 'site-' + 'a'.repeat(32), ...catalog({ invitation_id: 777 }) } })
    const empty = (await db.pool.query('select id from public.invitations where wp_post_id = 777')).rows[0].id
    expect((await asCustomer((c) => c.query('delete from public.invitations where id = $1', [empty]))).rowCount).toBe(0)
    expect((await asAdmin((c) => c.query('delete from public.invitations where id = $1', [empty]))).rowCount).toBe(1)
  })
  it('hapus undangan beserta reservasi (banyak sekaligus); pelanggan ditolak', async () => {
    await db.rpc('api_dh_catalog', { p_website: website, p: { website_id: 'site-' + 'a'.repeat(32), ...catalog({ invitation_id: 801, gifts: [gift('gift-x', 5, 5)] }) } })
    await db.rpc('api_dh_catalog', { p_website: website, p: { website_id: 'site-' + 'a'.repeat(32), ...catalog({ invitation_id: 802, gifts: [gift('gift-x', 5, 5)] }) } })
    const ids = (await db.pool.query('select id from public.invitations where wp_post_id in (801, 802) order by wp_post_id')).rows.map((r) => r.id)
    const g = (await db.pool.query('select id from public.gifts where invitation_id = $1', [ids[0]])).rows[0].id
    await asAdmin((c) => c.query(`select public.admin_reservation_create($1, 'Tamu', '6281300000000', '', '')`, [g]))
    await expect(asCustomer((c) => c.query('select public.admin_invitations_delete($1)', [ids]))).rejects.toThrow('forbidden')
    const res = (await asAdmin((c) => c.query('select public.admin_invitations_delete($1) as r', [ids]))).rows[0].r
    expect(res).toEqual({ invitations: 2, reservations: 1 })
    expect((await db.pool.query('select count(*)::int n from public.gifts where invitation_id = any($1)', [ids])).rows[0].n).toBe(0)
  })

  it('token aktif tidak dapat dihapus, token dicabut dapat dihapus', async () => {
    const t = (await db.pool.query('select id from public.website_tokens limit 1')).rows[0].id
    expect((await asAdmin((c) => c.query('delete from public.website_tokens where id = $1', [t]))).rowCount).toBe(0)
    await db.pool.query('update public.website_tokens set revoked_at = now() where id = $1', [t])
    expect((await asAdmin((c) => c.query('delete from public.website_tokens where id = $1', [t]))).rowCount).toBe(1)
  })
})

describe('statistik dashboard', () => {
  it('admin mendapat KPI, tren, status, hadiah terpopuler, order & aktivitas; pelanggan hanya datanya', async () => {
    const big = (await db.pool.query(`select id from public.gifts where gift_key = 'gift-big'`)).rows[0].id
    await asAdmin((c) => c.query(`select public.admin_reservation_create($1, 'Dash', '6281500000000', '', '')`, [big]))
    const a = (await asAdmin((c) => c.query('select public.dashboard_stats(7) as s'))).rows[0].s
    expect(a.trend).toHaveLength(7)
    expect(a.kpis.reservations.series).toHaveLength(7)
    expect(a.kpis.reservations.total).toBe(a.status.confirmed)
    expect(a.kpis.reservations.this_week).toBe(a.trend.reduce((n: number, d: { confirmed: number }) => n + d.confirmed, 0))
    expect(a.top_gifts[0].count).toBeGreaterThanOrEqual(1)
    expect(a.orders).toBeDefined()
    expect(a.websites.total).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(a.activity)).toBe(true)
    const t30 = (await asAdmin((c) => c.query('select public.dashboard_stats(30) as s'))).rows[0].s
    expect(t30.trend).toHaveLength(30)
    const c = (await asCustomer((cl) => cl.query('select public.dashboard_stats(7) as s'))).rows[0].s
    expect(c.orders).toBeUndefined()
    expect(c.websites).toBeUndefined()
    expect(c.kpis.invitations.total).toBe(0)
    expect(c.status).toEqual({ confirmed: 0, cancelled: 0 })
  })
})

