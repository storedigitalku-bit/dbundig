/** Aturan akses di PostgreSQL 17 lokal: 1:1 — satu akun pelanggan = satu undangan, satu undangan = satu akun (dikunci database). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { startLocalDb, type LocalDb } from '../helpers/localdb'
import { catalog, gift } from '../helpers/fixtures'

let db: LocalDb
let website: string
let invA: string
let invB: string
const ADMIN = randomUUID()
const CUST = randomUUID()
const CUST2 = randomUUID()
const asAdmin = <T>(fn: (c: import('pg').PoolClient) => Promise<T>) => db.asRole('authenticated', ADMIN, fn)

beforeAll(async () => {
  db = await startLocalDb()
  website = (await db.pool.query(`insert into public.websites (name, site_url, external_site_id) values ('A', 'https://a.example/', 'site-${'a'.repeat(32)}') returning id`)).rows[0].id
  await db.pool.query(`insert into auth.users (id, email) values ($1, 'adm@akun.mdundig.invalid'), ($2, 'c1@akun.mdundig.invalid'), ($3, 'c2@akun.mdundig.invalid')`, [ADMIN, CUST, CUST2])
  await db.pool.query(`insert into public.platform_admins (user_id) values ($1)`, [ADMIN])
  const site = { website_id: 'site-' + 'a'.repeat(32) }
  await db.rpc('api_dh_catalog', { p_website: website, p: { ...site, ...catalog({ invitation_id: 501, owner_id: 'owner-1', registry_id: 'registry-501-a', gifts: [gift('gift-a', 1, 1)] }) } })
  await db.rpc('api_dh_catalog', { p_website: website, p: { ...site, ...catalog({ invitation_id: 502, invitation_title: 'Rina & Doni', registry_id: 'registry-502-b', gifts: [gift('gift-b', 1, 1)] }) } })
  const rows = (await db.pool.query(`select id from public.invitations where wp_post_id in (501, 502) order by wp_post_id`)).rows
  invA = rows[0].id; invB = rows[1].id
})
afterAll(async () => { await db?.stop() })

describe('akses 1:1', () => {
  it('akses kedua untuk akun yang sama ditolak; undangan yang sudah dipakai tidak bisa diberikan ke akun lain', async () => {
    await asAdmin((c) => c.query(`insert into public.invitation_access (invitation_id, user_id) values ($1, $2)`, [invA, CUST]))
    await expect(asAdmin((c) => c.query(`insert into public.invitation_access (invitation_id, user_id) values ($1, $2)`, [invB, CUST]))).rejects.toThrow(/invitation_access_one_per_user/)
    await expect(asAdmin((c) => c.query(`insert into public.invitation_access (invitation_id, user_id) values ($1, $2)`, [invA, CUST2]))).rejects.toThrow(/invitation_access_one_per_invitation/)
    expect((await db.pool.query(`select count(*)::int n from public.invitation_access where invitation_id = $1`, [invA])).rows[0].n).toBe(1)
  })
  it('ganti undangan: cabut dulu lalu beri', async () => {
    await asAdmin((c) => c.query(`delete from public.invitation_access where user_id = $1`, [CUST]))
    await asAdmin((c) => c.query(`insert into public.invitation_access (invitation_id, user_id) values ($1, $2)`, [invB, CUST]))
    expect((await db.pool.query(`select invitation_id from public.invitation_access where user_id = $1`, [CUST])).rows).toEqual([{ invitation_id: invB }])
  })
  it('akses eksplisit & pemetaan otomatis tidak boleh sekaligus, dan tidak boleh berebut undangan', async () => {
    // CUST memegang undangan B (owner bawaan fixture) → akun lain tidak boleh dipetakan ke pemilik undangan itu.
    const ownerB = (await db.pool.query(`select owner_external_id from public.invitations where id = $1`, [invB])).rows[0].owner_external_id as string | null
    if (ownerB) await expect(asAdmin((c) => c.query(`insert into public.owner_mappings (website_id, external_owner_id, user_id) values ($1, $2, $3)`, [website, ownerB, CUST2]))).rejects.toThrow(/invitation_taken/)
    await expect(asAdmin((c) => c.query(`insert into public.owner_mappings (website_id, external_owner_id, user_id) values ($1, 'owner-1', $2)`, [website, CUST]))).rejects.toThrow(/user_has_access/)
    await asAdmin((c) => c.query(`insert into public.owner_mappings (website_id, external_owner_id, user_id) values ($1, 'owner-1', $2)`, [website, CUST2]))
    await expect(asAdmin((c) => c.query(`insert into public.invitation_access (invitation_id, user_id) values ($1, $2)`, [invB, CUST2]))).rejects.toThrow(/user_has_access/)
    await expect(asAdmin((c) => c.query(`insert into public.owner_mappings (website_id, external_owner_id, user_id) values ($1, 'owner-2', $2)`, [website, CUST2]))).rejects.toThrow(/owner_mappings_one_per_user|user_has_access/)
    // Undangan A milik owner-1 (dipetakan ke CUST2) tidak bisa diberikan eksplisit ke akun lain.
    await asAdmin((c) => c.query(`delete from public.invitation_access where user_id = $1`, [CUST]))
    await expect(asAdmin((c) => c.query(`insert into public.invitation_access (invitation_id, user_id) values ($1, $2)`, [invA, CUST]))).rejects.toThrow(/invitation_taken/)
  })
  it('status kirim WhatsApp tersimpan per akun', async () => {
    await db.pool.query(`update public.profiles set whatsapp = '6281234567890', whatsapp_sent_at = now() where id = $1`, [CUST])
    expect((await db.pool.query(`select whatsapp_sent_at is not null as sent from public.profiles where id = $1`, [CUST])).rows[0].sent).toBe(true)
  })
})
