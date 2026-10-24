// Endpoint /api yang tidak dikenal → 404 JSON (bukan halaman HTML aplikasi dengan status 200),
// agar salah ketik URL dari WordPress/klien langsung terlihat sebagai kesalahan.
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, statusMessage: 'not_found', data: { message: 'Endpoint tidak ditemukan.' } })
})
