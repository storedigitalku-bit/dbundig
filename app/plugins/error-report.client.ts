// Laporkan error di browser ke log error admin (menu Riwayat & Error). Hanya saat pengguna sudah masuk,
// maksimal 5 laporan per halaman dimuat, pesan sama tidak dikirim dua kali. Tidak memuat isi formulir/token.
export default defineNuxtPlugin((nuxtApp) => {
  const sent = new Set<string>()
  let count = 0
  function report(message: unknown, stack?: unknown) {
    const text = String(message ?? '').slice(0, 500)
    if (!text || count >= 5 || sent.has(text)) return
    // Bukan bug aplikasi: koneksi putus, navigasi dibatalkan, ekstensi browser, ResizeObserver.
    if (/ResizeObserver loop|Failed to fetch|NetworkError|Load failed|aborted|chrome-extension:|moz-extension:/i.test(text)) return
    const auth = useAuth()
    const token = auth.session.value?.access_token
    if (!token || !auth.me.value) return
    sent.add(text)
    count++
    void $fetch('/api/app/client-error', {
      method: 'POST', headers: { authorization: `Bearer ${token}` },
      body: { message: text, path: window.location.pathname, stack: typeof stack === 'string' ? stack.slice(0, 1500) : '' },
    }).catch(() => {})
  }
  nuxtApp.hook('vue:error', (err) => { report((err as Error)?.message ?? err, (err as Error)?.stack) })
  // Pesan dari objek error (tanpa awalan "Uncaught Error:" yang ditambahkan browser).
  window.addEventListener('error', (e) => { if (e.error || e.message) report((e.error as Error | undefined)?.message ?? e.message, (e.error as Error | undefined)?.stack) })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string; statusCode?: number } | undefined
    // Error API yang sudah ditangani (4xx) bukan bug.
    if (r && typeof r.statusCode === 'number' && r.statusCode < 500) return
    report(r?.message ?? r, r?.stack)
  })
})
