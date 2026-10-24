// URL yang ditempel ke konektor ApeironKit. Bukan rahasia; tetap khusus admin.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { base, ignored } = appBase(event)
  return {
    daftar_hadiah_url: `${base}/api/daftar-hadiah`,
    form_order_url: `${base}/api/form-order`,
    https: base.startsWith('https://'),
    // NUXT_PUBLIC_APP_URL yang diabaikan (mis. http://localhost:3000 tersalin ke Vercel) — ditampilkan sebagai peringatan.
    ignored_app_url: ignored,
  }
})
