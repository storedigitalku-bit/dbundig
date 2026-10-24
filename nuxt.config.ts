import tailwindcss from '@tailwindcss/vite'

// Satu proyek: dashboard (SPA) + server API (Nitro, preset Vercel).
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  devtools: { enabled: false },
  typescript: { strict: true },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  app: {
    head: {
      htmlAttrs: { lang: 'id' },
      title: 'MDUNDIG — Manajemen Data Undangan Digital',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
        // Aplikasi yang bisa dipasang di layar utama ponsel (PWA).
        { name: 'theme-color', content: '#2563eb' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'MDUNDIG' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
        // Font Ubuntu disajikan dari server sendiri (public/fonts) — tanpa koneksi ke Google Fonts; 2 bobot utama di-preload.
        { rel: 'preload', href: '/fonts/ubuntu-400.woff', as: 'font', type: 'font/woff', crossorigin: '' },
        { rel: 'preload', href: '/fonts/ubuntu-500.woff', as: 'font', type: 'font/woff', crossorigin: '' },
      ],
    },
  },
  runtimeConfig: {
    // Server-only. Diisi lewat env: NUXT_SUPABASE_SECRET_KEY, NUXT_TOKEN_HASH_SECRET, NUXT_INTEGRATION_RATE_LIMIT
    supabaseSecretKey: '',
    tokenHashSecret: '',
    integrationRateLimit: 1200,
    // Push notification ponsel (opsional): NUXT_VAPID_PRIVATE_KEY, NUXT_VAPID_SUBJECT (mailto:...). Kosong = push nonaktif.
    vapidPrivateKey: '',
    vapidSubject: '',
    public: {
      // Publik: NUXT_PUBLIC_SUPABASE_URL, NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NUXT_PUBLIC_APP_URL
      supabaseUrl: '',
      supabasePublishableKey: '',
      appUrl: '',
      // NUXT_PUBLIC_VAPID_PUBLIC_KEY — pasangan publik VAPID (aman dikirim ke browser).
      vapidPublicKey: '',
    },
  },
  nitro: {
    preset: process.env.NITRO_PRESET || (process.env.VERCEL ? 'vercel' : 'node-server'),
    vercel: { functions: { regions: ['sin1'], maxDuration: 30 } },
  },
  routeRules: {
    '/api/**': { headers: { 'cache-control': 'no-store, max-age=0', 'x-content-type-options': 'nosniff' } },
    // Proksi gambar: boleh di-cache browser (URL bertanda tangan & berbatas waktu).
    '/api/img': { headers: { 'cache-control': 'public, max-age=86400' } },
    // Service worker selalu versi terbaru (tidak di-cache), ikon boleh di-cache.
    '/sw.js': { headers: { 'cache-control': 'no-cache', 'service-worker-allowed': '/' } },
    '/icons/**': { headers: { 'cache-control': 'public, max-age=604800' } },
    '/fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  },
})
