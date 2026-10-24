/**
 * Transport RPC alternatif khusus pengujian lokal (MDUNDIG_TEST_DATABASE_URL).
 * Meniru PostgREST: satu transaksi per panggilan, sebagai role service_role.
 * Tidak pernah aktif di Vercel (lihat server/utils/supabase.ts).
 */
import type { Rpc } from './integration'

const NAME = /^[a-z_][a-z0-9_]{0,62}$/

export async function createPgRpc(connectionString: string): Promise<Rpc> {
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString, max: 20 })
  return async (fn, args) => {
    const names = Object.keys(args)
    if (!NAME.test(fn) || !names.every((n) => NAME.test(n))) return { data: null, error: { message: 'invalid_request' } }
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as result`
    const values = names.map((n) => {
      const v = args[n]
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
    })
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`)
      await client.query('set local role service_role')
      const result = await client.query(sql, values)
      await client.query('commit')
      return { data: result.rows[0]?.result ?? null, error: null }
    } catch (err) {
      await client.query('rollback').catch(() => {})
      const e = err as { code?: string; message: string }
      return { data: null, error: { code: e.code, message: e.message } }
    } finally {
      client.release()
    }
  }
}
