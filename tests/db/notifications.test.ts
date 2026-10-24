/** Notifikasi di PostgreSQL 17 lokal: penerima per peran/akses, pembuat dikecualikan, RLS milik sendiri. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { startLocalDb, type LocalDb } from '../helpers/localdb'
import { catalog, gift } from '../helpers/fixtures'

let db: LocalDb
let website: string
let invitation: string
let giftId: string
let registry: string
const ADMIN = randomUUID()
const ADMIN2 = randomUUID()
const CUSTOMER = randomUUID()
const MAPPED = randomUUID()
const STRANGER = randomUUID()
const as = <T>(uid: string, fn: (c: import('pg').PoolClient) => Promise<T>) => db.asRole('authenticated', uid, fn)
const mine = (uid: string) => as(uid, (c) => c.query(`select kind, title, body, link, read_at from public.notifications order by created_at desc, id desc`)).then((r) => r.rows)

// Meniru jalur plugin (service role, tanpa auth.uid()).
async function widgetReservation(guest: string, wa: string) {
  return (await db.pool.query(
    `insert into public.reservations (website_id, invitation_id, registry_id, gift_id, request_id, payload_hash, quantity, guest_id, guest_name, guest_whatsapp, message, gift_name, invitation_title, status)
     values ($1, $2, $3, $4, $5, $5, 1, $6, $7, $8, '', 'Rice Cooker', '', 'confirmed') returning id`,
    [website, invitation, registry, giftId, randomUUID().replace(/-/g, '').padEnd(64, '0'), 'guest-' + 'a'.repeat(64).slice(0, 63) + wa.slice(-1), guest, wa])).rows[0].id as string
}

beforeAll(async () => {
  db = await startLocalDb()
  website = (await db.pool.query(`insert into public.websites (name, site_url, external_site_id) values ('A', 'https://a.example/', 'site-${'a'.repeat(32)}') returning id`)).rows[0].id
  await db.pool.query(`insert into auth.users (id, email) values ($1, 'a1@akun.mdundig.invalid'), ($2, 'a2@akun.mdundig.invalid'), ($3, 'c@akun.mdundig.invalid'), ($4, 'm@akun.mdundig.invalid'), ($5, 's@akun.mdundig.invalid')`,
    [ADMIN, ADMIN2, CUSTOMER, MAPPED, STRANGER])
  await db.pool.query(`insert into public.platform_admins (user_id) values ($1), ($2)`, [ADMIN, ADMIN2])
  await db.rpc('api_dh_catalog', { p_website: website, p: { website_id: 'site-' + 'a'.repeat(32), ...catalog({ owner_id: 'owner-7', gifts: [gift('gift-big', 9, 9, 'available', 'Rice Cooker')] }) } })
  const g = (await db.pool.query(`select id, invitation_id, registry_id from public.gifts where gift_key = 'gift-big'`)).rows[0]
  giftId = g.id; invitation = g.invitation_id; registry = g.registry_id
  await db.pool.query(`insert into public.invitation_access (invitation_id, user_id) values ($1, $2)`, [invitation, CUSTOMER])
  // Data lama sebelum aturan 1:1 (undangan sama lewat akses eksplisit & pemetaan): notifikasi tetap ke keduanya.
  const c = await db.pool.connect()
  try {
    await c.query(`set session_replication_role = replica`)
    await c.query(`insert into public.owner_mappings (website_id, external_owner_id, user_id) values ($1, 'owner-7', $2)`, [website, MAPPED])
  } finally {
    await c.query(`set session_replication_role = origin`)
    c.release()
  }
})
afterAll(async () => { await db?.stop() })

describe('notifikasi', () => {
  it('reservasi dari widget → semua admin + pelanggan berakses (eksplisit & pemetaan), bukan orang lain', async () => {
    await widgetReservation('Budi', '6281234567891')
    for (const uid of [ADMIN, ADMIN2, CUSTOMER, MAPPED]) {
      const rows = await mine(uid)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ kind: 'reservation', title: 'Reservasi hadiah baru', link: `/daftar-hadiah/${invitation}`, read_at: null })
      expect(rows[0].body).toBe('Budi memilih Rice Cooker — Andi & Sari')
    }
    expect(await mine(STRANGER)).toHaveLength(0)
  })

  it('order dari widget → hanya admin; pelanggan tidak menerima', async () => {
    const id = (await db.pool.query(`insert into public.form_orders (website_id, request_id, payload_hash, post_title, fields, labels)
      values ($1, $2, $2, 'Pesan Undangan', '{"customer_name":"Rina"}', '{}') returning id`, [website, 'f'.repeat(64)])).rows[0].id
    for (const uid of [ADMIN, ADMIN2]) {
      const [n] = await mine(uid)
      expect(n).toMatchObject({ kind: 'order', title: 'Order undangan baru', body: 'Rina · Pesan Undangan', link: `/order-undangan?order=${id}` })
    }
    expect((await mine(CUSTOMER)).filter((n) => n.kind === 'order')).toHaveLength(0)
  })

  it('pembuat perubahan tidak diberi notifikasi (admin tambah reservasi manual)', async () => {
    await as(ADMIN, (c) => c.query(`select public.admin_reservation_create($1, 'Sari', '6281234567892', '', '')`, [giftId]))
    expect((await mine(ADMIN)).filter((n) => n.title === 'Reservasi manual ditambahkan')).toHaveLength(0)
    expect((await mine(ADMIN2)).filter((n) => n.title === 'Reservasi manual ditambahkan')).toHaveLength(1)
    expect((await mine(CUSTOMER)).filter((n) => n.title === 'Reservasi manual ditambahkan')).toHaveLength(1)
  })

  it('RLS: hanya milik sendiri; tandai dibaca & hapus; tidak bisa membuat atau mengubah isi', async () => {
    const before = (await db.pool.query(`select count(*)::int n from public.notifications where user_id = $1`, [ADMIN2])).rows[0].n
    const upd = await as(CUSTOMER, (c) => c.query(`update public.notifications set read_at = now() where user_id = $1`, [ADMIN2]))
    expect(upd.rowCount).toBe(0)
    const del = await as(CUSTOMER, (c) => c.query(`delete from public.notifications where user_id = $1`, [ADMIN2]))
    expect(del.rowCount).toBe(0)
    expect((await db.pool.query(`select count(*)::int n from public.notifications where user_id = $1`, [ADMIN2])).rows[0].n).toBe(before)
    await expect(as(CUSTOMER, (c) => c.query(`update public.notifications set title = 'x'`))).rejects.toThrow(/permission denied/)
    await expect(as(CUSTOMER, (c) => c.query(`insert into public.notifications (user_id, kind, title) values ($1, 'order', 'palsu')`, [CUSTOMER]))).rejects.toThrow(/permission denied/)
    const read = await as(CUSTOMER, (c) => c.query(`update public.notifications set read_at = now() where read_at is null`))
    expect(read.rowCount).toBeGreaterThan(0)
    expect((await mine(CUSTOMER)).every((n) => n.read_at)).toBe(true)
    const gone = await as(CUSTOMER, (c) => c.query(`delete from public.notifications`))
    expect(gone.rowCount).toBeGreaterThan(0)
    expect(await mine(CUSTOMER)).toHaveLength(0)
  })

  it('order dihapus → notifikasinya ikut terhapus', async () => {
    const id = (await db.pool.query(`insert into public.form_orders (website_id, request_id, payload_hash, post_title, fields, labels)
      values ($1, $2, $2, 'Hapus', '{}', '{}') returning id`, [website, 'e'.repeat(64)])).rows[0].id
    expect((await db.pool.query(`select count(*)::int n from public.notifications where order_id = $1`, [id])).rows[0].n).toBe(2)
    await as(ADMIN, (c) => c.query(`delete from public.form_orders where id = $1`, [id]))
    expect((await db.pool.query(`select count(*)::int n from public.notifications where order_id = $1`, [id])).rows[0].n).toBe(0)
  })
})
