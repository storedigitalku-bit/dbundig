import { defineConfig, devices } from '@playwright/test'

// Uji browser memakai server hasil build + Supabase Auth & API dashboard yang DI-MOCK
// lewat network routing (fixture). Tidak ada akun nyata yang dibuat atau dipakai.
const PORT = 3123

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'off', screenshot: 'only-on-failure', locale: 'id-ID', timezoneId: 'Asia/Jakarta' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node .output/server/index.mjs',
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT), HOST: '127.0.0.1',
      NUXT_PUBLIC_SUPABASE_URL: 'https://supabase.mock',
      NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
      NUXT_PUBLIC_APP_URL: 'https://daftar-hadiah.example.com',
    },
  },
})
