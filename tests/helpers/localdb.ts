/**
 * PostgreSQL 17 lokal sungguhan (embedded-postgres) + shim minimum Supabase
 * (role anon/authenticated/service_role, schema auth, auth.uid()).
 * Migrasi yang dimuat adalah berkas yang sama dengan yang diterapkan ke Supabase.
 * Ini fixture lokal — BUKAN pengujian live terhadap Supabase.
 */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Rpc } from '../../server/lib/integration'

const SHIM = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key, email text, aud text, role text, raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;
create table if not exists auth.mfa_factors (
  id uuid primary key, user_id uuid not null, factor_type text not null default 'totp', status text not null default 'unverified'
);
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
`

export interface LocalDb {
  pool: pg.Pool
  connectionString: string
  rpc: Rpc
  /** Jalankan fn sebagai role tertentu (seperti PostgREST) dalam transaksi. */
  asRole<T>(role: 'anon' | 'authenticated' | 'service_role', sub: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T>
  stop(): Promise<void>
}

export async function startLocalDb(): Promise<LocalDb> {
  // Port acak dapat bentrok; coba ulang dengan port lain.
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await startOnPort(54000 + Math.floor(Math.random() * 900))
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

async function startOnPort(port: number): Promise<LocalDb> {
  const dir = mkdtempSync(join(tmpdir(), 'mdundig-pg-'))
  const server = new EmbeddedPostgres({
    databaseDir: dir, user: 'postgres', password: 'local-test-only', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {}, onError: () => {},
  })
  await server.initialise()
  try {
    await server.start()
  } catch (err) {
    await server.stop().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
    throw err
  }
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'local-test-only', database: 'postgres', max: 40 })
  await pool.query(SHIM)
  const migrationsDir = resolve(__dirname, '../../supabase/migrations')
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'))
  }

  const asRole: LocalDb['asRole'] = async (role, sub, fn) => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })])
      await client.query(`set local role ${role}`)
      const out = await fn(client)
      await client.query('commit')
      return out
    } catch (err) {
      await client.query('rollback').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  // Meniru PostgREST: setiap RPC = satu transaksi sebagai service_role.
  const rpc: Rpc = async (fn, args) => {
    const names = Object.keys(args)
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as result`
    const values = names.map((n) => {
      const v = args[n]
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
    })
    try {
      const data = await asRole('service_role', null, async (c) => (await c.query(sql, values)).rows[0]?.result)
      return { data, error: null }
    } catch (err) {
      const e = err as { code?: string; message: string }
      return { data: null, error: { code: e.code, message: e.message } }
    }
  }

  return {
    pool, rpc, asRole,
    connectionString: `postgres://postgres:local-test-only@127.0.0.1:${port}/postgres`,
    async stop() {
      await pool.end()
      await server.stop()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
