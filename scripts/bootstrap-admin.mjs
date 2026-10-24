#!/usr/bin/env node
/**
 * Membuat admin platform PERTAMA secara eksplisit (tanpa password hardcoded).
 *
 *   node --env-file=.env scripts/bootstrap-admin.mjs --username admin
 *   node --env-file=.env scripts/bootstrap-admin.mjs --username admin --email admin@domain.com
 *
 * Password diminta secara interaktif (tidak tampil di layar, tidak tersimpan di riwayat shell),
 * atau dari env MDUNDIG_ADMIN_PASSWORD untuk otomasi. Minimal 8 karakter.
 * Bila username sudah ada, akun itu dijadikan admin (password tidak diubah).
 */
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline'

const INTERNAL_DOMAIN = 'akun.mdundig.invalid'
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []))
const username = String(args.username ?? '').trim().toLowerCase()
const emailArg = String(args.email ?? '').trim().toLowerCase()
const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const secret = process.env.NUXT_SUPABASE_SECRET_KEY

if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
  console.error('Pemakaian: node --env-file=.env scripts/bootstrap-admin.mjs --username admin [--email admin@domain.com]')
  process.exit(2)
}
if (emailArg && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArg)) { console.error('Email tidak valid.'); process.exit(2) }
if (!url || !secret) { console.error('NUXT_PUBLIC_SUPABASE_URL dan NUXT_SUPABASE_SECRET_KEY wajib diisi (file .env).'); process.exit(2) }

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s) }
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer) })
  })
}

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
const existing = await supabase.from('profiles').select('id, email').eq('username', username).maybeSingle()
if (existing.error) { console.error('Gagal membaca profil (migrasi sudah diterapkan?):', existing.error.message); process.exit(1) }

let email = existing.data?.email
if (!existing.data) {
  let password = process.env.MDUNDIG_ADMIN_PASSWORD ?? ''
  if (!password) {
    password = await askHidden(`Password untuk "${username}" (min. 8 karakter): `)
    const again = await askHidden('Ulangi password: ')
    if (password !== again) { console.error('Password tidak sama.'); process.exit(1) }
  }
  if (password.length < 8) { console.error('Password minimal 8 karakter.'); process.exit(1) }
  email = emailArg || `${username}@${INTERNAL_DOMAIN}`
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, display_name: username } })
  if (created.error) { console.error('Akun gagal dibuat:', created.error.message); process.exit(1) }
  console.log(`Akun "${username}" dibuat.`)
}

const { error } = await supabase.rpc('bootstrap_platform_admin', { p_email: email, p_username: username })
if (error) { console.error('Bootstrap gagal:', error.message); process.exit(1) }
console.log(`"${username}" sekarang admin platform. Masuk ke dashboard dengan username tersebut.`)
