# MDUNDIG — Kontrak API integrasi

Modul **Daftar Hadiah** = `POST /api/daftar-hadiah`; modul **Order Undangan** (widget Form Order) = `POST /api/form-order`.

Sumber kontrak: kode plugin `wp-content/plugins/Apeiron/src/Support/DaftarHadiahGateway.php`, `DaftarHadiahCatalog.php`, `Admin/Ajax/DaftarHadiahHandler.php`, `Rest/DaftarHadiahController.php`, `Support/FormOrderSettings.php` (serta referensi Code.gs pada `Admin/Tabs/DaftarHadiahTab.php`). Backend mengikuti plugin; plugin tidak diubah.

## Transport (kedua endpoint)

```http
POST /api/daftar-hadiah   |   POST /api/form-order
Content-Type: application/json
Authorization: Bearer TOKEN_WEBSITE
```

- Tidak ada redirect (termasuk trailing slash). Semua respons JSON, `Cache-Control: no-store`.
- GET/metode lain → `405` JSON (`success:false`, `data:null`). Endpoint ini tidak pernah menjadi pembaca data publik.
- Token hanya di header. Body berisi `token`/`secret` ditolak.
- Batas body: 400 KB (Daftar Hadiah), 600 KB (Form Order).
- Token divalidasi (HMAC di server → hash di DB), lalu `website_url` (dinormalisasi) wajib sama dengan URL website terdaftar, dan `website_id` wajib sama dengan identitas yang terikat. Pengikatan pertama terjadi otomatis saat permintaan pertama yang valid (biasanya *Uji Koneksi*).

### Envelope respons

```json
{
  "service": "apeiron-daftar-hadiah",
  "version": "registry-api-v1",
  "schema_version": 1,
  "operation": "<sama dengan request>",
  "correlation_id": "<sama dengan request>",
  "success": true,
  "data": {},
  "error": null
}
```

Form Order memakai `service: "apeiron-form-order"`, `version: "form-order-api-v1"`.

### Kode error

| error | HTTP | Keterangan |
|---|---|---|
| `invalid_request` | 422 (400 bila JSON rusak) | envelope/scope/data tamu tidak valid |
| `invalid_catalog` | 422 | katalog tidak valid (ID, jumlah, >200 hadiah, registry_id ≠ `registry-{document_id}-{element_id}`) |
| `catalog_stale` | 409 | revisi lebih lama, atau revisi sama dengan hash berbeda |
| `gift_unavailable` | 409 | stok habis / hadiah nonaktif / tidak ada di katalog |
| `request_conflict` | 409 | `request_id` sama dengan isi berbeda |
| `unauthorized` | 401 | token tidak ada / tidak dikenal / dicabut |
| `forbidden` | 403 | izin modul tidak ada, website nonaktif, URL/website_id tidak cocok |
| `rate_limited` | 429 | melewati batas per token per menit |
| `busy` | 503 | lock/timeout database sementara — aman dicoba ulang |
| `not_initialized` | 503 | konfigurasi server/migrasi belum siap |
| `script_error` | 500 | kegagalan internal (tanpa detail SQL) |

Contoh error:

```json
{"service":"apeiron-daftar-hadiah","version":"registry-api-v1","schema_version":1,"operation":"reserve","correlation_id":"9b1c…","success":false,"data":null,"error":"gift_unavailable"}
```

## Daftar Hadiah

### ping

```json
{"service":"apeiron-daftar-hadiah","schema_version":1,"operation":"ping","correlation_id":"c1","website_id":"site-0123456789abcdef0123456789abcdef","website_url":"https://undangan.example.com/"}
```
```json
{"service":"apeiron-daftar-hadiah","version":"registry-api-v1","schema_version":1,"operation":"ping","correlation_id":"c1","success":true,"data":{"backend_ready":true},"error":null}
```
Tidak membuat undangan/katalog/reservasi. `backend_ready:true` hanya setelah token, binding, dan skema database terverifikasi.

### Konteks katalog (semua operation selain ping)

```json
{
  "service": "apeiron-daftar-hadiah", "schema_version": 1, "operation": "availability", "correlation_id": "c2",
  "website_id": "site-0123456789abcdef0123456789abcdef", "website_url": "https://undangan.example.com/",
  "invitation_id": 101, "invitation_title": "Andi & Sari",
  "registry_id": "registry-900-abc", "document_id": 900, "element_id": "abc",
  "catalog_version": "1760000000001", "catalog_hash": "<64 hex dari WordPress>",
  "owner_id": null,
  "gifts": [
    {"gift_id":"gift-stable","name":"Rice Cooker","description":"","image_url":"","purchase_url":"","initial_quantity":5,"available_quantity":4,"availability":"available"}
  ]
}
```

- `catalog_version` string digit; `catalog_hash` tidak dihitung ulang (hanya dibandingkan).
- `available_quantity` di request = **kapasitas manual**; `available = 0` bila `availability:"unavailable"`, selain itu `max(0, kapasitas − reservasi confirmed)`.
- Scope stok/reservasi: `website + invitation_id + registry_id + gift_id`.

### availability / sync_catalog

```json
{"service":"apeiron-daftar-hadiah","version":"registry-api-v1","schema_version":1,"operation":"availability","correlation_id":"c2","success":true,
 "data":{"scope":{"website_id":"site-0123456789abcdef0123456789abcdef","invitation_id":101,"registry_id":"registry-900-abc","owner_id":null},
         "gifts":[{"gift_id":"gift-stable","initial_quantity":5,"available_quantity":4,"availability":"available"}]},"error":null}
```
Panggilan pertama membuat undangan, registry, dan katalog otomatis. Daftar `gifts` selalu tepat seluruh katalog request.

### reserve

Request = konteks katalog + :
```json
{"gift_id":"gift-stable","quantity":1,"request_id":"<64 hex dari WordPress>","guest":{"name":"Budi","whatsapp":"6281234567890"},"message":"Selamat untuk kalian."}
```
Respons:
```json
{"service":"apeiron-daftar-hadiah","version":"registry-api-v1","schema_version":1,"operation":"reserve","correlation_id":"c3","success":true,
 "data":{"scope":{"website_id":"site-0123456789abcdef0123456789abcdef","invitation_id":101,"registry_id":"registry-900-abc","owner_id":null},
         "status":"confirmed","reservation_id":"4d65c42d-93b7-4b5a-ab89-8f51b09ffe9e","gift_id":"gift-stable","quantity":1,
         "timestamp":"2026-10-16T12:00:00.000Z","already_reserved":false,
         "gifts":[{"gift_id":"gift-stable","initial_quantity":5,"available_quantity":3,"availability":"available"}]},"error":null}
```
Satu transaksi PostgreSQL (`public.api_dh_reserve`): upsert katalog → cek revisi → idempotensi `request_id` → cek tamu (nomor WhatsApp) → `SELECT … FOR UPDATE` baris hadiah → cek stok → insert → receipt + stok. Retry identik mengembalikan receipt yang sama (`already_reserved:true`); WhatsApp sama + hadiah sama di undangan yang sama → reservasi lama.

### reservations

Request = konteks katalog + `{"offset": 0}`. Respons:
```json
{"service":"apeiron-daftar-hadiah","version":"registry-api-v1","schema_version":1,"operation":"reservations","correlation_id":"c4","success":true,
 "data":{"scope":{"website_id":"site-0123456789abcdef0123456789abcdef","invitation_id":101,"registry_id":"registry-900-abc","owner_id":null},
         "reservations":[{"reservation_id":"4d65c42d-93b7-4b5a-ab89-8f51b09ffe9e","gift_id":"gift-stable","gift_name":"Rice Cooker","quantity":1,
                          "guest":{"id":"guest-<64 hex>","name":"Budi","whatsapp":"6281234567890"},"message":"Selamat untuk kalian.",
                          "timestamp":"2026-10-16T12:00:00.000Z","status":"confirmed"}],
         "total":1,"next_offset":null},"error":null}
```
Maks. 30 baris, terbaru dahulu, `[]` bila kosong, dibatasi website pemilik token.

## Form Order

### ping
```json
{"service":"apeiron-form-order","schema_version":1,"operation":"ping","correlation_id":"f1","website_id":"site-0123456789abcdef0123456789abcdef","website_url":"https://undangan.example.com/","visibility":"admin_only"}
```
```json
{"service":"apeiron-form-order","version":"form-order-api-v1","schema_version":1,"operation":"ping","correlation_id":"f1","success":true,
 "data":{"visibility":"admin_only","storage_ready":true,"scope":{"website_id":"site-0123456789abcdef0123456789abcdef"}},"error":null}
```
Butuh izin modul `form_order` pada token; koneksi Daftar Hadiah saja tidak cukup.

### submit
```json
{"service":"apeiron-form-order","schema_version":1,"operation":"submit","correlation_id":"f2","website_id":"site-0123456789abcdef0123456789abcdef","website_url":"https://undangan.example.com/","visibility":"admin_only",
 "post_id":5,"post_title":"Pesan Undangan","document_id":5,"element_id":"order1","request_id":"<64 hex>",
 "fields":{"groom_name":"Andi","bank_account":"0012345678","addons":["musik","galeri"],"akad_date":"2026-12-01","akad_time":"08:30"},
 "labels":{"groom_name":"Nama Pria","bank_account":"Nomor Rekening","addons":"Tambahan","akad_date":"Tanggal Akad","akad_time":"Jam Akad"}}
```
Respons `201` (baru) atau `200` (retry identik):
```json
{"service":"apeiron-form-order","version":"form-order-api-v1","schema_version":1,"operation":"submit","correlation_id":"f2","success":true,
 "data":{"visibility":"admin_only","scope":{"website_id":"site-0123456789abcdef0123456789abcdef","post_id":5,"document_id":5,"element_id":"order1"},
         "status":"stored","order_id":"12345678-1234-4234-8234-123456789abc","request_id":"<64 hex>","timestamp":"2026-10-16T12:00:00.000Z"},"error":null}
```
`fields`/`labels` disimpan apa adanya sebagai JSONB (custom field, array checkbox, angka nol). **Opsional (plugin baru):** `field_sections` `{ key: "Nama step" }` dan `option_labels` `{ key: { kode: "Teks opsi" } }` disimpan di kolom `meta` untuk tampilan dashboard; bagian yang tidak valid dibuang tanpa menolak order, dan tidak ikut hash idempotensi (kiriman ulang dengan/tanpa meta tetap duplikat yang sama). Respons hanya receipt. Tidak ada operasi baca untuk token website; data Form Order hanya lewat route admin berbasis session.

## Endpoint dashboard (session Supabase)

`POST /api/app/auth/login` `{"identifier":"admin","password":"…"}` — login dengan username **atau** email. Respons `{"session":{access_token,refresh_token,expires_in,token_type}}`; gagal → 401 dengan pesan yang sama untuk username tidak ada maupun password salah; dibatasi 10 percobaan/menit per identitas dan 40/menit per IP (tersimpan di PostgreSQL).

Endpoint lain memerlukan `Authorization: Bearer <access_token Supabase>`; query berjalan atas nama pengguna sehingga RLS PostgreSQL berlaku.

| Method & path | Peran |
|---|---|
| `GET/PATCH /api/app/me` | semua |
| `GET /api/app/summary` | semua (Form Order hanya di bagian `platform` milik admin) |
| `GET /api/app/invitations`, `GET /api/app/invitations/:id` | semua (pelanggan: hanya undangan yang diberikan) |
| `GET /api/app/notifications`, `GET /api/app/notifications/count`, `POST /api/app/notifications/read`, `POST /api/app/notifications/delete` (milik sendiri, RLS) | semua |
| `GET /api/app/reservations`, `GET /api/app/reservations/export` (CSV, pemisah `;`), `GET /api/app/reservations/export-pdf` (PDF A4, font Ubuntu) | semua (scope RLS) |
| `GET/POST /api/app/admin/websites`, `PATCH /api/app/admin/websites/:id` | admin |
| `GET/POST /api/app/admin/websites/:id/tokens`, `POST /api/app/admin/tokens/:id/rotate`, `POST /api/app/admin/tokens/:id/revoke` | admin |
| `GET /api/app/admin/connection` | admin |
| `GET /api/app/admin/users`, `POST /api/app/admin/users` (buat akun: username, password, `whatsapp` wajib — dinormalisasi ke `62…`, nama/email & `invitation_ids` opsional, maks. satu), `PATCH /api/app/admin/users/:id` (termasuk `whatsapp`; kosong = hapus), `POST /api/app/admin/users/:id/whatsapp-sent` (`{ whatsapp? }` → catat akses sudah dikirim lewat WhatsApp; daftar akun memuat `whatsapp_sent_at` & `access_invitation_id`). Akses 1:1: undangan yang sudah dipegang akun lain ditolak `409 invitation_taken`, `POST /api/app/admin/users/:id/password` (atur ulang), `GET`/`PUT /api/app/admin/users/:id/access` (lihat / samakan akses undangan akun pelanggan: `{ invitation_ids }`) | admin |
| `GET/POST /api/app/admin/owner-mappings`, `DELETE /api/app/admin/owner-mappings/:id` | admin |
| `GET/POST /api/app/admin/invitations/:id/access`, `DELETE …/access/:userId` | admin |
| `GET /api/app/admin/form-orders`, `GET /api/app/admin/form-orders/:id`, `GET /api/app/admin/form-orders/export` (CSV, pemisah `;`), `GET /api/app/admin/form-orders/export-pdf` (PDF) | admin |
| `GET /api/app/admin/events?from=YYYY-MM-DD&to=YYYY-MM-DD` (kalender acara akad/resepsi/ngunduh, rentang ≤ 400 hari) | admin |
| `GET /api/app/admin/audit?action=&page=` (riwayat aktivitas), `GET/DELETE /api/app/admin/errors` (log error 30 hari) | admin |
| `GET/PUT /api/app/admin/settings/whatsapp` (`{ access_template, recap_template }`; null = bawaan; placeholder wajib dicek) | admin |
| `GET /api/app/admin/invitations/:id/recap` (jumlah reservasi terkonfirmasi + 6 terbaru `latest[{gift, guest}]` + pemegang undangan, untuk dikirim lewat WhatsApp) | admin |
| `POST /api/app/client-error` (laporan error browser, ringkas) | semua |
| `POST/DELETE /api/app/push/subscribe` (langganan push perangkat ini; endpoint hanya layanan push resmi) | semua |
| `GET /api/img?u=&e=&s=` (proksi gambar hadiah `http://`; hanya URL bertanda tangan server, alamat privat ditolak, maks. 5 MB, raster saja) | publik |

**Verifikasi dua langkah:** akun yang punya faktor TOTP terverifikasi (Supabase MFA) wajib sesi `aal2` — semua endpoint di atas menjawab `401 mfa_required` sampai kode authenticator dimasukkan (halaman `/verifikasi`).
