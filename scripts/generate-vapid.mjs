// Buat pasangan kunci VAPID untuk push notification lalu tulis ke berkas .env lokal (tidak di-commit).
// Kunci rahasia TIDAK dicetak ke layar; salin dari .env ke Environment Variables Vercel:
//   NUXT_PUBLIC_VAPID_PUBLIC_KEY, NUXT_VAPID_PRIVATE_KEY, NUXT_VAPID_SUBJECT (mailto:email-anda)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import webpush from 'web-push'

const file = new URL('../.env', import.meta.url)
const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
if (/^NUXT_VAPID_PRIVATE_KEY=.+$/m.test(current)) {
  console.log('Kunci VAPID sudah ada di .env — tidak diubah (mengganti kunci membuat langganan lama tidak berlaku).')
  process.exit(0)
}
const keys = webpush.generateVAPIDKeys()
const subject = process.argv[2] && /^mailto:.+@.+/.test(process.argv[2]) ? process.argv[2] : 'mailto:admin@example.com'
const lines = current.split(/\r?\n/).filter((l) => !/^NUXT_(PUBLIC_VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT)=/.test(l))
while (lines.length && lines.at(-1) === '') lines.pop()
lines.push(`NUXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`, `NUXT_VAPID_PRIVATE_KEY=${keys.privateKey}`, `NUXT_VAPID_SUBJECT=${subject}`, '')
writeFileSync(file, lines.join('\n'))
console.log('Kunci VAPID ditulis ke .env. Salin ketiga nilai NUXT_*VAPID* ke Vercel → Settings → Environment Variables, lalu redeploy.')
