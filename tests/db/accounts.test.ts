/** Akun username + throttle login di PostgreSQL 17 lokal (fixture lokal). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { startLocalDb, type LocalDb } from '../helpers/localdb'

let db: LocalDb
beforeAll(async () => { db = await startLocalDb() })
afterAll(async () => { await db?.stop() })

describe('akun dibuat admin', () => {
  it('profil otomatis membawa username dari metadata; username unik', async () => {
    const a = randomUUID()
    await db.pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'admin@akun.mdundig.invalid', '{"username":"Admin","display_name":"Admin"}')`, [a])
    const { rows: [p] } = await db.pool.query('select username, display_name from public.profiles where id = $1', [a])
    expect(p).toEqual({ username: 'admin', display_name: 'Admin' })
    const b = randomUUID()
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'b@akun.mdundig.invalid')`, [b])
    await expect(db.pool.query(`update public.profiles set username = 'admin' where id = $1`, [b])).rejects.toThrow(/duplicate|unique/)
  })

  it('bootstrap_platform_admin(email, username) menjadikan admin; tidak dapat dipanggil authenticated', async () => {
    const id = randomUUID()
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'root@akun.mdundig.invalid')`, [id])
    await db.asRole('service_role', null, (c) => c.query(`select public.bootstrap_platform_admin('root@akun.mdundig.invalid', 'root')`))
    const { rows: [r] } = await db.pool.query('select p.username, (a.user_id is not null) as admin from public.profiles p left join public.platform_admins a on a.user_id = p.id where p.id = $1', [id])
    expect(r).toEqual({ username: 'root', admin: true })
    await expect(db.asRole('authenticated', id, (c) => c.query(`select public.bootstrap_platform_admin('root@akun.mdundig.invalid', 'x')`))).rejects.toThrow(/permission denied/)
  })

  it('pelanggan tidak dapat mengubah username sendiri (hanya display_name)', async () => {
    const id = randomUUID()
    await db.pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'c@akun.mdundig.invalid', '{"username":"pelanggan1"}')`, [id])
    await expect(db.asRole('authenticated', id, (c) => c.query(`update public.profiles set username = 'admin2' where id = $1`, [id]))).rejects.toThrow(/permission denied/)
    await db.asRole('authenticated', id, (c) => c.query(`update public.profiles set display_name = 'Pelanggan' where id = $1`, [id]))
  })

  it('api_login_attempt membatasi per kunci & hanya service_role', async () => {
    const bucket = 'login:' + 'a'.repeat(64)
    const results: boolean[] = []
    for (let i = 0; i < 4; i++) {
      results.push((await db.asRole('service_role', null, (c) => c.query('select public.api_login_attempt($1, 3) as ok', [bucket]))).rows[0].ok)
    }
    expect(results).toEqual([true, true, true, false])
    await expect(db.asRole('anon', null, (c) => c.query('select public.api_login_attempt($1, 3)', [bucket]))).rejects.toThrow(/permission denied/)
  })
})
