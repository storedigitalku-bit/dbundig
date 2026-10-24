#!/usr/bin/env node
/**
 * Pastikan tidak ada secret di bundle client maupun HTML yang dikirim server.
 * Menjalankan server hasil build DENGAN secret palsu, lalu memindai:
 *  - semua berkas .output/public (JS/CSS/HTML)
 *  - HTML /login dan / (berisi runtime config publik)
 * Keluar dengan kode 1 bila ditemukan kebocoran.
 */
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const server = join(root, '.output/server/index.mjs')
if (!existsSync(server)) { console.error('Jalankan `npm run build` terlebih dahulu.'); process.exit(2) }

const FAKE_SECRET_KEY = 'sb_secret_FAKEFAKEFAKE_bundle_check_0001'
const FAKE_HASH_SECRET = 'fake-token-hash-secret-for-bundle-check-0002'
const patterns = [
  { name: 'secret key Supabase', re: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  { name: 'nilai secret palsu', re: new RegExp(`${FAKE_SECRET_KEY}|${FAKE_HASH_SECRET}`) },
  { name: 'nama runtime config server', re: /supabaseSecretKey|tokenHashSecret/ },
  { name: 'JWT service_role', re: /"role"\s*:\s*"service_role"|c2VydmljZV9yb2xl/ },
  { name: 'Token Website', re: /mdh_[a-f0-9]{64}/ },
]

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const findings = []
const scan = (label, text) => {
  for (const p of patterns) if (p.re.test(text)) findings.push(`${label}: ${p.name}`)
}
for (const file of walk(join(root, '.output/public'))) {
  if (/\.(js|mjs|css|html|json|txt)$/.test(file)) scan(file.replace(root, '.'), readFileSync(file, 'utf8'))
}

const port = 3950 + Math.floor(Math.random() * 40)
const child = spawn(process.execPath, [server], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NUXT_SUPABASE_SECRET_KEY: FAKE_SECRET_KEY, NUXT_TOKEN_HASH_SECRET: FAKE_HASH_SECRET,
    NUXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' },
  stdio: 'ignore',
})
try {
  let ready = false
  for (let i = 0; i < 80 && !ready; i++) {
    try { await fetch(`http://127.0.0.1:${port}/login`); ready = true } catch { await new Promise((r) => setTimeout(r, 150)) }
  }
  if (!ready) throw new Error('server tidak menyala')
  for (const path of ['/', '/login', '/admin/koneksi']) {
    const html = await (await fetch(`http://127.0.0.1:${port}${path}`)).text()
    scan(`HTML ${path}`, html)
    if (!html.includes('sb_publishable_example')) findings.push(`HTML ${path}: publishable key tidak ditemukan (pemeriksaan tidak valid)`)
  }
} finally {
  child.kill()
}

if (findings.length) {
  console.error('KEBOCORAN TERDETEKSI:\n- ' + findings.join('\n- '))
  process.exit(1)
}
console.log('OK: tidak ada secret/Token Website di bundle client atau HTML (publishable key publik terdeteksi sebagaimana mestinya).')
