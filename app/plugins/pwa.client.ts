// Daftarkan service worker (push notification & aplikasi yang bisa dipasang di layar utama). Gagal → diam saja.
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, { once: true })
})
