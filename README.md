# MDUNDIG — Manajemen Data Undangan Digital

Platform penyimpanan data widget undangan ApeironKit + dashboard (satu proyek Nuxt 4 / Vue 3 / TypeScript strict / Tailwind 4).

| Modul (menu) | Admin | Pelanggan |
|---|---|---|
| **Daftar Hadiah** — undangan, katalog, reservasi, unduh laporan PDF (disarankan) / CSV | ✓ (semua) | ✓ (hanya undangan yang diberi akses) |
| **Order Undangan** — data widget Form Order, unduh laporan PDF / CSV | ✓ | ✗ |
| Pengaturan — Website, Koneksi (token), Pengguna & Akses | ✓ | ✗ |

Endpoint:

| Endpoint | Pemanggil | Autentikasi |
|---|---|---|
| `POST /api/daftar-hadiah` | backend WordPress (plugin) | `Authorization: Bearer <Token Website>` |
| `POST /api/form-order` | backend WordPress (plugin) | `Authorization: Bearer <Token Website>` |
| `/api/app/**` | dashboard (browser) | session Supabase Auth (JWT) + RLS |

Kontrak lengkap & contoh: [docs/API.md](docs/API.md). Hasil audit & pengujian: [docs/LAPORAN.md](docs/LAPORAN.md).

## Struktur

```
app/                 dashboard (pages, components, composables, CSS token Apeiron-portal)
server/api/          endpoint integrasi + dashboard
server/lib/          logika murni: kontrak, handler integrasi, CSV, laporan PDF, token
server/assets/fonts/ font Ubuntu (WOFF, lisensi Ubuntu Font Licence) untuk laporan PDF
supabase/migrations/ skema, RLS, fungsi transaksi (sudah diterapkan ke project Supabase)
tests/               unit, DB lokal (PostgreSQL 17), PHP plugin asli, Playwright, SQL live
scripts/             bootstrap admin, pemeriksaan secret bundle
```

## Setup (berurutan)

1. **Supabase** — project yang dipakai: `xksgdqwxqvxczzztgzuu` (ap-southeast-1). Migrasi di `supabase/migrations/` **sudah diterapkan** lewat connector. Untuk project lain: `supabase db push`, atau jalankan ketiga berkas berurutan di SQL Editor.
2. **Supabase Auth** (Dashboard → Authentication):
   - URL Configuration → *Site URL* = domain aplikasi (mis. `https://mdundig.vercel.app`); *Redirect URLs* tambahkan `https://DOMAIN/atur-password`.
   - Providers → Email: **matikan "Allow new users to sign up"** — semua akun dibuat langsung oleh admin di dashboard. Signup tetap tidak memberi akses apa pun walau dibiarkan aktif.
   - Password minimum Supabase bawaan 6 karakter; dashboard mewajibkan **minimal 8**.
   - SMTP hanya diperlukan bila ingin reset password lewat email; tanpa SMTP, admin mengatur ulang password dari dashboard.
3. **Vercel** — import folder ini sebagai proyek. Region fungsi: `sin1` (Singapura, sama dengan database) sudah diatur di `vercel.json` dan `nuxt.config.ts`.
4. **Environment variables** (Vercel → Settings → Environment Variables) — lihat `.env.example`:
   - Publik: `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NUXT_PUBLIC_APP_URL`.
   - **Server-only**: `NUXT_SUPABASE_SECRET_KEY` (secret key Supabase), `NUXT_TOKEN_HASH_SECRET` (≥ 32 karakter acak). Jangan beri prefiks `NUXT_PUBLIC_`.
5. **Deploy**, lalu buat admin pertama (sekali) dari komputer Anda — password diminta secara tersembunyi, tidak di-hardcode:
   ```bash
   node --env-file=.env scripts/bootstrap-admin.mjs --username admin
   ```
   Opsional `--email admin@domain.com`. Tanpa email, akun memakai email internal `admin@akun.mdundig.invalid` (tidak pernah menerima email). Login dashboard memakai **username**.
6. Masuk sebagai admin → **Website** → tambah URL beranda WordPress.
7. **Koneksi** → *Buat token* → salin **URL API Daftar Hadiah** dan **Token Website** (token hanya tampil sekali).
8. WordPress → ApeironKit → Daftar Hadiah → tab Koneksi: tempel URL + token → *Simpan* → *Uji Koneksi* → aktifkan reservasi → *Simpan*. Uji pertama mengikat identitas website. Form Order: pilih penyimpanan API lalu uji koneksinya.
9. Selesai. Undangan berikutnya tercatat otomatis saat widget dibuka; tidak ada sinkronisasi manual.

## Akun pelanggan (dibuat admin)

1. **Pengguna & Akses → Tambah akun**: username, nomor WhatsApp aktif (wajib), password (min. 8), nama/email opsional, lalu pilih satu undangan yang boleh dilihat (akses 1:1 — undangan yang sudah dipakai akun lain tidak bisa dipilih). Akun langsung aktif sebagai pelanggan, dan aksesnya (username, password, tautan masuk) dapat langsung dikirim lewat WhatsApp tanpa ditulis ulang. Atur ulang password juga menawarkan kirim akses terbaru. Tombol WhatsApp di tiap akun pelanggan berwarna biru bila akses belum dikirim dan abu-abu bila sudah (tetap bisa dikirim ulang).
2. Ubah akses kapan saja lewat tombol **Akses** pada baris akun (popup centang + cari), atau dari **detail undangan → Akses pelanggan**. (Alternatif lanjutan: **Koneksi → Pemetaan otomatis dari WordPress** untuk `owner_id` dari filter `apeiron_daftar_hadiah_owner_id`.)
3. Pelanggan masuk dengan username, melihat dan **mengunduh laporan PDF/CSV** Daftar Hadiah undangan miliknya saja. Form Order tidak pernah terlihat oleh pelanggan.
4. Lupa password → admin klik **Password** pada baris akun untuk mengatur ulang.

Aplikasi ini berfungsi sebagai penyimpanan data widget (katalog, stok, reservasi, Form Order) + dashboard; rendering widget tetap di WordPress.

## Kelola data (CRUD, khusus admin)

| Data | Tambah | Lihat | Ubah | Hapus |
|---|---|---|---|---|
| Reservasi | manual (stok dicek, tanpa oversell) | ✓ | data tamu, status Terkonfirmasi/Dibatalkan, catatan | ✓ (stok kembali) |
| Undangan | otomatis dari WordPress | ✓ | judul mengikuti WordPress | ✓ satu atau banyak sekaligus, beserta reservasi, katalog & akses |
| Hadiah | di widget WordPress | ✓ | di widget WordPress | — |
| Order Undangan | manual | ✓ (detail dalam popup per bagian) | status & catatan (semua order); isi field hanya order manual — isi dari widget hanya-lihat | ✓ |
| Website | ✓ | ✓ | nama, URL, status, lepas ikatan | ✓ bila belum ada data |
| Token Website | ✓ | ✓ | label, rotasi, cabut | ✓ token yang sudah dicabut |
| Pengguna | ✓ | ✓ | nama, username, email, WhatsApp, peran, password | ✓ (kecuali diri sendiri/admin terakhir) |
| Akses undangan | ✓ per akun (popup centang) atau per undangan | ✓ jumlah per akun | ✓ centang/hapus centang | ✓ |

Pelanggan hanya dapat melihat dan mengunduh laporan (PDF/CSV) Daftar Hadiah undangannya.

## Fitur tambahan (opsional)

- **Push notification ke ponsel/komputer** (order & reservasi baru muncul walau dashboard ditutup): jalankan sekali `node scripts/generate-vapid.mjs mailto:email-anda@domain.com` (kunci ditulis ke `.env`, tidak dicetak), lalu salin `NUXT_PUBLIC_VAPID_PUBLIC_KEY`, `NUXT_VAPID_PRIVATE_KEY`, `NUXT_VAPID_SUBJECT` ke Vercel → Settings → Environment Variables dan redeploy. Tiap pengguna mengaktifkannya di **Profil → Notifikasi di perangkat ini**. Di iPhone/iPad: pasang dulu ke Layar Utama (Safari → Bagikan → Tambahkan ke Layar Utama). Tanpa kunci, fitur ini nonaktif dan aplikasi tetap berjalan normal.
- **Pasang sebagai aplikasi (PWA):** di ponsel buka MDUNDIG → menu browser → *Install / Tambahkan ke Layar Utama*.
- **Verifikasi dua langkah admin:** Profil → *Aktifkan verifikasi dua langkah* → pindai QR dengan Google/Microsoft Authenticator. Fitur TOTP aktif bawaan di Supabase (Authentication → Multi-Factor). Setelah aktif, server menolak semua API sampai kode dimasukkan saat login.
- **Notifikasi langsung (Realtime)**, **kalender acara**, **riwayat & log error**, **template pesan WhatsApp**, **rekap reservasi via WhatsApp**, dan **proksi gambar http://** langsung aktif tanpa pengaturan tambahan.

## Domain & subdomain

- **Aplikasi MDUNDIG** tidak terikat ke alamat `*.vercel.app`. Pakai domain atau subdomain sendiri (mis. `data.domainanda.com`) lewat Vercel → Settings → Domains, atau jalankan di server Node mana pun (`npm run build` lalu `node .output/server/index.mjs`, atau preset Nitro lain). Syarat dari plugin: **HTTPS publik, tanpa port, bukan localhost/IP**. URL API di menu Koneksi, tautan login di pesan WhatsApp, dan tautan reset password **otomatis mengikuti domain yang sedang dibuka** bila `NUXT_PUBLIC_APP_URL` dikosongkan (disarankan). Bila diisi, nilai itu yang dipakai (hanya HTTPS publik; localhost/http diabaikan) — ubah juga saat pindah domain.
- **Saat pindah domain, yang tetap perlu diubah manual:** (1) URL API di pengaturan konektor ApeironKit pada setiap WordPress (salin ulang dari menu Koneksi; token tidak perlu diganti), (2) Supabase → Authentication → URL Configuration: Site URL & Redirect URLs `https://DOMAIN/atur-password` (hanya untuk akun yang memakai reset lewat email), (3) tautan login di pesan WhatsApp yang sudah terkirim tetap ke domain lama — domain `*.vercel.app` lama tetap aktif sehingga tautan lama masih bisa dibuka.
- **Website WordPress** yang dihubungkan boleh domain utama, subdomain (`undangan.domain.com`), maupun instalasi subdirektori (`domain.com/undangan/`) atau multisite. Daftarkan setiap alamat beranda sebagai Website terpisah, lalu buat Token Website masing-masing.

## Pengembangan & pengujian

```bash
npm install
npm run build
npm test              # unit + DB lokal + PHP plugin asli + latensi (butuh build & PHP)
npm run test:e2e      # Playwright desktop/tablet/mobile (auth & API di-mock)
npm run check:bundle  # memastikan secret tidak bocor ke client
npm run typecheck
```

`npm test` menjalankan PostgreSQL 17 lokal (paket `embedded-postgres`) dengan migrasi yang sama. Variabel `MDUNDIG_TEST_DATABASE_URL` hanya untuk uji lokal dan **diabaikan di Vercel**. Untuk menguji kelas PHP plugin, set `APEIRON_PLUGIN_DIR` bila lokasi plugin berbeda.

> Catatan lokasi: folder ini berada di OneDrive. Disarankan mengecualikan `node_modules/`, `.nuxt/`, `.output/` dari sinkronisasi OneDrive, atau memindahkan proyek ke folder non-sinkron.
