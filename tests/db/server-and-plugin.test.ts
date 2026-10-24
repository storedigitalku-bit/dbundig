/**
 * Server hasil build (node .output) + PostgreSQL lokal:
 *  1. Transport HTTP nyata (tanpa redirect, JSON, no-store, GET bukan pembaca).
 *  2. Kelas PHP asli plugin ApeironKit sebagai klien (tests/plugin-php/harness.php).
 *  3. Pengukuran p50/p95 lokal untuk availability, reserve, submit Form Order.
 * Fixture lokal — bukan Supabase/Vercel live.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { hashToken } from '../../server/lib/integration'
import { startLocalDb, type LocalDb } from '../helpers/localdb'
import { HASH_SECRET, catalog, gift, hex64 } from '../helpers/fixtures'

const ROOT = resolve(__dirname, '../..')
const SERVER = resolve(ROOT, '.output/server/index.mjs')
const PLUGIN_DIR = process.env.APEIRON_PLUGIN_DIR
  ?? 'C:/Users/mamay/Local Sites/aperion/app/public/wp-content/plugins/Apeiron'
// PHP plugin: dari PATH, atau XAMPP lokal (Windows) bila tersedia.
const PHP_BIN = process.env.PHP_BIN ?? (spawnSync('php', ['-v']).status === 0 ? 'php' : existsSync('C:/xamppTerbaru/php/php.exe') ? 'C:/xamppTerbaru/php/php.exe' : 'php')
const PHP = spawnSync(PHP_BIN, ['-v']).status === 0
const PLUGIN_TOKEN = 'mdh_' + 'ab'.repeat(32)
const PERF_TOKEN = 'mdh_' + 'cd'.repeat(32)
const PERF_SITE = 'site-' + 'e'.repeat(32)
const PERF_URL = 'https://perf.example.com/'

let db: LocalDb
let server: ChildProcess
const port = 3900 + Math.floor(Math.random() * 90)
const base = `http://127.0.0.1:${port}`

beforeAll(async () => {
  if (!existsSync(SERVER)) throw new Error('Jalankan `npm run build` terlebih dahulu.')
  db = await startLocalDb()
  for (const [url, token] of [['https://undangan-uji.example.com/', PLUGIN_TOKEN], [PERF_URL, PERF_TOKEN]] as const) {
    const { rows: [w] } = await db.pool.query(`insert into public.websites (name, site_url) values ('Uji', $1) returning id`, [url])
    await db.pool.query(`insert into public.website_tokens (website_id, token_hash, token_hint, scopes) values ($1, $2, 'x', array['daftar_hadiah','form_order'])`, [w.id, hashToken(token, HASH_SECRET)])
  }
  server = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NITRO_PORT: String(port), NITRO_HOST: '127.0.0.1', VERCEL: '',
      MDUNDIG_TEST_DATABASE_URL: db.connectionString, NUXT_TOKEN_HASH_SECRET: HASH_SECRET, NUXT_INTEGRATION_RATE_LIMIT: '100000' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/api/daftar-hadiah`); return } catch { await new Promise((r) => setTimeout(r, 150)) }
  }
  throw new Error('server tidak menyala')
})
afterAll(async () => {
  server?.kill()
  await db?.stop()
})

describe('Transport HTTP (server build)', () => {
  it('GET endpoint integrasi → 405 JSON, tidak redirect, no-store', async () => {
    for (const path of ['/api/daftar-hadiah', '/api/form-order']) {
      const res = await fetch(base + path, { redirect: 'manual' })
      expect(res.status).toBe(405)
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
      expect(res.headers.get('cache-control')).toMatch(/no-store/)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.data).toBeNull()
    }
  })

  it('POST tanpa token → 401 JSON; trailing slash tidak dialihkan', async () => {
    const res = await fetch(`${base}/api/daftar-hadiah`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', redirect: 'manual' })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('unauthorized')
    const slash = await fetch(`${base}/api/daftar-hadiah/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', redirect: 'manual' })
    expect([301, 302, 303, 307, 308]).not.toContain(slash.status)
    expect(slash.headers.get('content-type')).toMatch(/json/)
  })

  it('route dashboard tanpa session → 401 JSON (bukan HTML/redirect login)', async () => {
    const res = await fetch(`${base}/api/app/admin/form-orders`, { redirect: 'manual' })
    expect([401, 503]).toContain(res.status)
    expect(res.headers.get('content-type')).toMatch(/json/)
  })

  it('token website ditolak sebagai session dashboard', async () => {
    const res = await fetch(`${base}/api/app/admin/form-orders`, { headers: { authorization: `Bearer ${PLUGIN_TOKEN}` }, redirect: 'manual' })
    expect(res.status).not.toBe(200)
  })
})

describe.skipIf(!PHP || !existsSync(PLUGIN_DIR))('Kelas PHP asli plugin ApeironKit → server', () => {
  it('Gateway & FormOrderSettings plugin menerima seluruh respons', () => {
    const out = spawnSync(PHP_BIN, [resolve(ROOT, 'tests/plugin-php/harness.php')], {
      env: { ...process.env, PLUGIN_DIR, MDUNDIG_PORT: String(port), MDUNDIG_TOKEN: PLUGIN_TOKEN }, encoding: 'utf8', timeout: 120_000,
    })
    if (out.status !== 0) throw new Error(`${out.stdout}\n${out.stderr}`)
    const result = JSON.parse(out.stdout.trim().split('\n').at(-1) as string)
    expect(result.ok).toBe(true)
    expect(result.checks).toBeGreaterThanOrEqual(30)
    // Meta dari plugin tersimpan apa adanya; field yang tidak dikirim dibuang server.
    return db.pool.query(`select meta from public.form_orders where request_id = $1`, [result.meta_request_id]).then(({ rows }) => {
      expect(rows[0]?.meta).toEqual({
        sections: { paket: 'Paket & Tema', nomor: 'Paket & Tema' },
        options: { paket: { gold: 'Paket Gold' }, nomor: { 1: 'Meja satu', 2: 'Meja dua' } },
      })
    })
  })
})

describe('Pengukuran latensi lokal (HTTP → Nitro → PostgreSQL lokal)', () => {
  it('mencatat p50/p95', async () => {
    const post = async (path: string, body: unknown) => {
      const t = performance.now()
      const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${PERF_TOKEN}` }, body: JSON.stringify(body) })
      await res.json()
      if (res.status >= 300) throw new Error(`status ${res.status}`)
      return performance.now() - t
    }
    const env = (service: string, operation: string, extra: object) => ({ service, schema_version: 1, operation, correlation_id: randomUUID(), website_id: PERF_SITE, website_url: PERF_URL, ...extra })
    const cat = catalog({ gifts: Array.from({ length: 20 }, (_, i) => gift(`gift-p${i}`, 1000, 1000)) })
    await post('/api/daftar-hadiah', env('apeiron-daftar-hadiah', 'ping', {}))
    const N = 60
    const runs: Record<string, number[]> = { availability: [], reserve: [], form_order_submit: [] }
    for (let i = 0; i < N; i++) runs.availability!.push(await post('/api/daftar-hadiah', env('apeiron-daftar-hadiah', 'availability', cat)))
    for (let i = 0; i < N; i++) runs.reserve!.push(await post('/api/daftar-hadiah', env('apeiron-daftar-hadiah', 'reserve', { ...cat, gift_id: `gift-p${i % 20}`, quantity: 1, request_id: hex64(90000 + i), guest: { name: `Perf ${i}`, whatsapp: `62815${String(i).padStart(8, '0')}` }, message: '' })))
    for (let i = 0; i < N; i++) runs.form_order_submit!.push(await post('/api/form-order', env('apeiron-form-order', 'submit', { visibility: 'admin_only', post_id: 5, post_title: 'Form', document_id: 5, element_id: 'order1', request_id: hex64(70000 + i), fields: { nama: `Pemesan ${i}`, paket: ['a', 'b'] }, labels: { nama: 'Nama', paket: 'Paket' } })))
    const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]! * 10) / 10 }
    const report = Object.fromEntries(Object.entries(runs).map(([k, xs]) => [k, { n: xs.length, p50_ms: pct(xs, 50), p95_ms: pct(xs, 95) }]))
    const conditions = 'Lokal Windows 11, Node ' + process.version + ', server Nitro node-server hasil build, PostgreSQL 17 embedded di mesin yang sama, request berurutan, katalog 20 hadiah. BUKAN angka Vercel/Supabase.'
    mkdirSync(resolve(ROOT, 'reports'), { recursive: true })
    writeFileSync(resolve(ROOT, 'reports/latency-local.json'), JSON.stringify({ measured_at: new Date().toISOString(), conditions, results: report }, null, 2))
    console.info('LATENCY', JSON.stringify(report))
    expect(runs.reserve).toHaveLength(N)
  })
})
