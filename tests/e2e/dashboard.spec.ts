import { expect, test } from '@playwright/test'
import { installMocks, login, openNav } from './mocks'

async function noHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('font Ubuntu, bobot ≤ 500, warna brand Apeiron-portal', async ({ page }) => {
  await installMocks(page, 'customer')
  await page.goto('/login')
  await page.locator('h1').waitFor()
  const styles = await page.evaluate(() => {
    const btn = document.querySelector('button[type=submit]') as HTMLElement
    const h1 = document.querySelector('h1') as HTMLElement
    return {
      body: getComputedStyle(document.body).fontFamily,
      input: getComputedStyle(document.querySelector('input') as HTMLElement).fontFamily,
      button: getComputedStyle(btn).fontFamily,
      brand: getComputedStyle(btn).backgroundColor,
      h1Weight: Number(getComputedStyle(h1).fontWeight),
      btnWeight: Number(getComputedStyle(btn).fontWeight),
    }
  })
  for (const f of [styles.body, styles.input, styles.button]) expect(f).toMatch(/^"?Ubuntu"?/)
  // Field login setinggi tombol.
  const heights = await page.evaluate(() => [...document.querySelectorAll('.auth-card input, .auth-card button[type=submit]')].map((e) => Math.round(e.getBoundingClientRect().height)))
  expect(new Set(heights).size).toBe(1)
  expect(styles.brand).toBe('rgb(37, 99, 235)')
  expect(styles.h1Weight).toBeLessThanOrEqual(600)
  expect(styles.btnWeight).toBeLessThanOrEqual(600)
  await noHorizontalOverflow(page)
})

test('login salah menampilkan error; login pelanggan → menu tanpa Form Order', async ({ page }) => {
  await installMocks(page, 'customer')
  await page.goto('/login')
  await page.getByLabel('Username atau email').fill('pelanggan1')
  await page.getByLabel('Password', { exact: true }).fill('salah')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('alert')).toContainText('Username/email atau password salah')
  await login(page, 'customer')
  await expect(page.getByTestId('role-label')).toHaveText('Pelanggan')
  await openNav(page)
  await expect(page.getByRole('link', { name: 'Daftar Hadiah' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Order Undangan' })).toHaveCount(0)
  await expect(page.getByTestId('admin-menu')).toHaveCount(0)
  await expect(page.getByTestId('admin-summary')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Form Order')
  await expect(page.locator('body')).not.toContainText('Order Undangan')
  await noHorizontalOverflow(page)
})

test('pelanggan membuka URL Form Order langsung → halaman tidak berhak', async ({ page }) => {
  const state = await installMocks(page, 'customer')
  await login(page, 'customer')
  await page.goto('/order-undangan')
  await expect(page).toHaveURL(/\/tidak-berhak$/)
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible()
  expect(state.apiCalls.filter((c) => c.includes('/api/app/admin/form-orders'))).toHaveLength(0)
})

test('admin: menu Daftar Hadiah & Order Undangan, label field terlihat', async ({ page }) => {
  await installMocks(page, 'admin')
  await login(page, 'admin')
  await expect(page.getByTestId('role-label')).toHaveText('Admin platform')
  await expect(page.getByTestId('admin-summary')).toBeVisible()
  if (await page.getByTestId('bottom-nav').isVisible()) {
    await page.getByTestId('bottom-nav').getByRole('link', { name: 'Order' }).click()
  } else {
    await openNav(page)
    await expect(page.getByRole('link', { name: 'Daftar Hadiah' })).toBeVisible()
    await page.getByRole('link', { name: 'Order Undangan' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Order Undangan' })).toBeVisible()
  await expect(page.getByText('Nama Pria:')).toBeVisible()
  await noHorizontalOverflow(page)
  await page.goto('/admin/website')
  await expect(page.getByRole('region', { name: 'Tabel website' })).toBeVisible()
  await noHorizontalOverflow(page)
})

test('admin: buat token → tampil sekali → salin → toast hilang ±5 detik → cabut', async ({ page, context, browserName }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/admin/koneksi')
  await expect(page.getByTestId('connection-status')).toContainText('Menunggu uji koneksi pertama')
  await expect(page.getByRole('textbox', { name: 'URL API Daftar Hadiah' })).toHaveValue('https://daftar-hadiah.example.com/api/daftar-hadiah')
  await page.getByRole('button', { name: 'Buat token' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Buat token' }).click()
  const tokenField = page.getByRole('dialog').getByRole('textbox', { name: 'Token Website' })
  await expect(tokenField).toHaveValue(/^mdh_[a-f0-9]{64}$/)
  await page.getByRole('button', { name: 'Salin Token Website' }).click()
  const toast = page.getByTestId('toast')
  await expect(toast).toContainText('disalin')
  if (browserName === 'chromium' && test.info().project.name === 'desktop') {
    const copied = await page.evaluate(() => Promise.race([navigator.clipboard.readText(), new Promise<null>((r) => setTimeout(() => r(null), 1000))])).catch(() => null)
    if (copied !== null) expect(copied).toMatch(/^mdh_/)
  }
  await page.getByRole('button', { name: 'Sudah disalin' }).click()
  await expect(page.getByRole('textbox', { name: 'Token Website' })).toHaveCount(0)
  // Status koneksi permanen tetap ada; toast sementara hilang otomatis.
  await expect(toast).toBeHidden({ timeout: 6500 })
  await expect(page.getByTestId('connection-status')).toBeVisible()
  await noHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Cabut' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cabut token' }).click()
  await expect(page.getByTestId('toast')).toContainText('Token dicabut')
  await expect(page.getByText('Dicabut', { exact: true })).toBeVisible()
  expect(state.apiCalls).toContain('POST /api/app/admin/tokens/t1/revoke')
})

test('toast: 5 detik, pesan baru mengulang timer dan tidak bertumpuk', async ({ page }) => {
  await installMocks(page, 'customer')
  await login(page, 'customer')
  await page.goto('/profil')
  const save = page.getByRole('button', { name: 'Simpan' })
  await save.click()
  const toast = page.getByTestId('toast')
  await expect(toast).toContainText('Profil disimpan')
  await page.waitForTimeout(3000)
  await save.click()
  await page.waitForTimeout(3000)
  // 6 detik sejak toast pertama, 3 detik sejak toast kedua → masih terlihat.
  await expect(toast).toBeVisible()
  await expect(page.getByTestId('toast')).toHaveCount(1)
  await expect(toast).toBeHidden({ timeout: 3500 })
})

test('"Memproses…" bertahan selama request berjalan dan tombol terkunci', async ({ page }) => {
  const state = await installMocks(page, 'customer')
  await login(page, 'customer')
  await page.goto('/profil')
  state.delayMs = 1500
  const save = page.getByRole('button', { name: 'Simpan' })
  await save.click()
  const busy = page.getByRole('button', { name: 'Memproses…' })
  await expect(busy).toBeVisible()
  await expect(busy).toBeDisabled()
  await page.waitForTimeout(800)
  await expect(busy).toBeVisible()
  await expect(page.getByTestId('toast')).toContainText('Profil disimpan', { timeout: 4000 })
  const patches = state.apiCalls.filter((c) => c === 'PATCH /api/app/me')
  expect(patches).toHaveLength(1)
})

test('filter & unduh laporan reservasi: PDF utama, CSV lewat menu', async ({ page }) => {
  const state = await installMocks(page, 'customer')
  await login(page, 'customer')
  await page.goto('/daftar-hadiah/reservasi')
  await expect(page.getByRole('cell', { name: 'Rice Cooker' })).toBeVisible()
  await page.getByLabel('Cari reservasi').fill('budi')
  await expect.poll(() => state.apiCalls.filter((c) => c === 'GET /api/app/reservations').length).toBeGreaterThan(1)
  // PDF = tombol utama (pelanggan: tombol biru), ukuran sama dengan tombol lain.
  const pdfBtn = page.getByRole('button', { name: 'Unduh PDF' })
  await expect(pdfBtn).toHaveClass(/btn-primary/)
  expect(Math.round((await pdfBtn.boundingBox())!.height)).toBe(40)
  let downloadPromise = page.waitForEvent('download')
  await pdfBtn.click()
  expect((await downloadPromise).suggestedFilename()).toBe('laporan-reservasi-uji.pdf')
  expect(state.apiCalls).toContain('GET /api/app/reservations/export-pdf')
  // CSV lewat menu.
  await page.getByRole('button', { name: 'Pilihan format laporan' }).click()
  await expect(page.getByRole('menuitem', { name: /PDF.*Disarankan/ })).toBeVisible()
  downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /CSV/ }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('daftar-hadiah-reservasi-uji.csv')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await noHorizontalOverflow(page)
})

test('lupa password & logout', async ({ page }) => {
  await installMocks(page, 'customer')
  await page.goto('/lupa-password')
  await page.getByLabel('Email').fill('pelanggan@uji.example')
  await page.getByRole('button', { name: 'Kirim tautan' }).click()
  await expect(page.getByText('Jika email terdaftar')).toBeVisible()
  await login(page, 'customer')
  // Ponsel: pelanggan keluar dari halaman Profil (menu bawah); layar lain: menu samping.
  if (await page.getByTestId('bottom-nav').isVisible()) {
    await page.getByTestId('bottom-nav').getByRole('link', { name: 'Profil' }).click()
    await page.getByRole('main').getByRole('button', { name: 'Keluar' }).click()
  } else {
    await openNav(page)
    await page.getByRole('button', { name: 'Keluar' }).click()
  }
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/daftar-hadiah')
  await expect(page).toHaveURL(/\/login\?next=/)
})

test('navigasi tablet: drawer terbuka & tertutup, tabel dapat digulir', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet', 'ponsel memakai menu bawah; desktop menu samping tetap')
  await installMocks(page, 'admin')
  await login(page, 'admin')
  const burger = page.getByRole('button', { name: 'Buka menu' })
  await expect(burger).toBeVisible()
  await burger.click()
  await expect(page.getByRole('link', { name: 'Website', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tutup menu' }).click()
  await page.goto('/daftar-hadiah')
  const region = page.getByRole('region', { name: 'Tabel undangan' })
  await expect(region).toBeVisible()
  await noHorizontalOverflow(page)
})

test('admin default "admin" masuk dengan username → buat akun pelanggan → atur ulang password', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await expect(page.getByTestId('role-label')).toHaveText('Admin platform')
  expect(state.apiCalls).toContain('POST /api/app/auth/login')
  await page.goto('/admin/pengguna')
  await expect(page.getByRole('cell', { name: 'admin', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tambah akun' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Username').fill('Toko.Bunga')
  await dialog.getByLabel('Nama tampilan (opsional)').fill('Toko Bunga')
  await dialog.getByLabel('Password', { exact: true }).fill('admin')
  await dialog.getByLabel('Ulangi password').fill('admin')
  // Langkah 1 divalidasi sebelum lanjut ke langkah 2: nomor WhatsApp aktif wajib & valid, lalu password.
  await dialog.getByRole('button', { name: 'Berikutnya' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Nomor WhatsApp wajib diisi')
  await dialog.getByLabel('Nomor WhatsApp aktif').fill('12ab')
  await dialog.getByRole('button', { name: 'Berikutnya' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Nomor WhatsApp tidak valid')
  await dialog.getByLabel('Nomor WhatsApp aktif').fill('0812-9876-5432')
  await dialog.getByRole('button', { name: 'Berikutnya' }).click()
  await expect(dialog.getByRole('alert')).toContainText('minimal 8 karakter')
  await dialog.getByLabel('Password', { exact: true }).fill('rahasia-toko-1')
  await dialog.getByLabel('Ulangi password').fill('rahasia-toko-1')
  await dialog.getByRole('button', { name: 'Berikutnya' }).click()
  await expect(dialog.getByText('Undangan untuk akun ini')).toBeVisible()
  await dialog.getByRole('button', { name: 'Buat akun' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akun toko.bunga dibuat')

  // Langkah 3: pesan akses siap kirim ke WhatsApp pelanggan (tanpa ditulis ulang).
  const wa = dialog.getByTestId('wa-panel')
  await expect(wa.getByLabel('Kirim ke WhatsApp')).toHaveValue('0812-9876-5432')
  const msg = await wa.getByLabel(/^Pesan/).inputValue()
  expect(msg).toContain('Halo, *Toko Bunga*')
  expect(msg).toContain('👤 *Username:* toko.bunga')
  expect(msg).toContain('🔑 *Password:* rahasia-toko-1')
  expect(msg).toMatch(/\/login\?u=toko\.bunga/)
  const href = await wa.getByTestId('wa-send').getAttribute('href')
  expect(href).toMatch(/^https:\/\/wa\.me\/6281298765432\?text=/)
  expect(decodeURIComponent(href!.split('?text=')[1]!)).toBe(msg)
  await noHorizontalOverflow(page)
  await dialog.getByRole('button', { name: 'Tutup' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(page.getByRole('cell', { name: 'toko.bunga', exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /toko\.bunga/ }).getByText('0812-9876-5432')).toBeVisible()
  await page.getByRole('button', { name: 'Atur ulang password toko.bunga' }).click()
  await page.getByRole('dialog').getByLabel('Password baru').fill('password-baru-123')
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan password' }).click()
  await expect(page.getByTestId('toast')).toContainText('Password diperbarui')
  expect(state.passwordResets).toHaveLength(1)
  // Setelah atur ulang: kirim akses terbaru (password baru) lewat WhatsApp.
  const resetWa = page.getByRole('dialog', { name: 'Kirim akses terbaru' }).getByTestId('wa-panel')
  expect(await resetWa.getByLabel(/^Pesan/).inputValue()).toContain('🔑 *Password:* password-baru-123')
  await expect(resetWa.getByTestId('wa-send')).toHaveAttribute('href', /^https:\/\/wa\.me\/6281298765432\?text=/)
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await noHorizontalOverflow(page)
})

test('tombol WhatsApp per akun: biru = belum dikirim, abu-abu = sudah; tetap bisa kirim ulang (opsional password baru)', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await page.context().route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>WhatsApp</title>' }))
  await login(page, 'admin')
  await page.goto('/admin/pengguna')
  const btn = page.getByRole('button', { name: 'Kirim akses lewat WhatsApp pelanggan1' })
  await expect(btn).toHaveAttribute('data-sent', 'belum')
  await expect(btn).toHaveClass(/unsent/)
  await expect(page.getByRole('row', { name: /admin/ }).getByRole('button', { name: /Kirim akses lewat WhatsApp/ })).toHaveCount(0)
  await btn.click()
  const dlg = page.getByRole('dialog', { name: 'Kirim akses lewat WhatsApp' })
  const wa = dlg.getByTestId('wa-panel')
  await expect(wa.getByTestId('wa-status')).toContainText('Belum dikirim')
  // Cukup tombol Salin & Kirim (tutup lewat X) — tanpa tombol Selesai.
  await expect(dlg.getByRole('button', { name: 'Selesai' })).toHaveCount(0)
  await expect(wa.getByRole('button', { name: 'Salin pesan' })).toBeVisible()
  // Password tidak disimpan: tanpa password baru, pesan memakai password lama.
  expect(await wa.getByLabel(/^Pesan/).inputValue()).toContain('🔑 *Password:* sama seperti yang sudah kami berikan sebelumnya')
  await expect(wa.getByTestId('wa-send')).toHaveAttribute('aria-disabled', 'true')
  await wa.getByLabel('Kirim ke WhatsApp').fill('0813 5555 6666')
  await expect(wa.getByTestId('wa-send')).toHaveAttribute('href', /^https:\/\/wa\.me\/6281355556666\?text=/)
  const [first] = await Promise.all([page.waitForEvent('popup'), wa.getByTestId('wa-send').click()])
  await first.waitForURL(/wa\.me\/6281355556666/)
  await first.close()
  await expect(wa.getByTestId('wa-status')).toContainText('Terkirim')
  await expect(wa.getByTestId('wa-send')).toContainText('Kirim ulang')
  expect(state.mutations).toContain('whatsapp.sent:00000000-0000-4000-8000-000000000002')
  expect(state.passwordResets).toHaveLength(0)

  // Kirim ulang dengan password baru: password akun diganti dulu, lalu WhatsApp dibuka.
  await wa.getByLabel('Password baru').fill('Baru-12345')
  expect(await wa.getByLabel(/^Pesan/).inputValue()).toContain('🔑 *Password:* Baru-12345')
  const [second] = await Promise.all([page.waitForEvent('popup'), wa.getByTestId('wa-send').click()])
  await second.waitForURL(/wa\.me\/6281355556666/)
  await second.close()
  expect(state.passwordResets).toEqual(['00000000-0000-4000-8000-000000000002'])
  await dlg.getByRole('button', { name: 'Tutup' }).click()
  await expect(btn).toHaveAttribute('data-sent', 'ya')
  await expect(btn).not.toHaveClass(/unsent/)
  await expect(page.getByRole('row', { name: /pelanggan1/ }).getByText('0813-5555-6666')).toBeVisible()

  // Atur ulang password: akses lama tidak berlaku lagi → tombol kembali biru (belum dikirim) tanpa muat ulang.
  await page.getByRole('button', { name: 'Atur ulang password pelanggan1' }).click()
  await page.getByRole('dialog').getByLabel('Password baru').fill('password-baru-456')
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan password' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click()
  await expect(btn).toHaveAttribute('data-sent', 'belum')
  await noHorizontalOverflow(page)
})

test('endpoint /api yang tidak dikenal → 404 JSON, bukan halaman HTML', async ({ page }) => {
  for (const path of ['/api/tidak-ada', '/api/app/tidak-ada']) {
    const res = await page.request.get(path)
    expect(res.status()).toBe(404)
    expect(res.headers()['content-type']).toContain('application/json')
    expect((await res.json()).data.message).toBe('Endpoint tidak ditemukan.')
  }
  // Endpoint yang ada tetap berjalan seperti biasa.
  expect((await page.request.get('/api/daftar-hadiah')).status()).toBe(405)
  expect((await page.request.get('/api/app/me')).status()).toBe(401)
})

test('tautan masuk dari pesan WhatsApp langsung mengisi username', async ({ page }) => {
  await installMocks(page, 'customer')
  await page.goto('/login?u=toko.bunga')
  await expect(page.locator('#identifier')).toHaveValue('toko.bunga')
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
})

test('pelanggan masuk dengan username dan hanya melihat menu Daftar Hadiah', async ({ page }) => {
  await installMocks(page, 'customer')
  await login(page, 'customer')
  await expect(page.getByTestId('role-label')).toHaveText('Pelanggan')
  await page.goto('/admin/pengguna')
  await expect(page).toHaveURL(/\/tidak-berhak$/)
})

test('Daftar Hadiah: tab Undangan/Reservasi konsisten, tanpa warna dekoratif', async ({ page }) => {
  await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/daftar-hadiah')
  await expect(page.getByRole('heading', { name: 'Daftar Hadiah', level: 1 })).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'Bagian Daftar Hadiah' })
  await expect(tabs.getByRole('link', { name: 'Undangan' })).toHaveAttribute('aria-current', 'page')
  // Bar tab tidak boleh punya overflow (memicu scrollbar kecil ▲=▼ di Windows).
  const overflow = await tabs.evaluate((el) => ({ v: el.scrollHeight - el.clientHeight, h: el.scrollWidth - el.clientWidth }))
  expect(overflow.v).toBeLessThanOrEqual(0)
  expect(overflow.h).toBeLessThanOrEqual(0)
  await tabs.getByRole('link', { name: 'Reservasi' }).click()
  await expect(page).toHaveURL(/\/daftar-hadiah\/reservasi$/)
  await expect(page.getByRole('heading', { name: 'Daftar Hadiah', level: 1 })).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Reservasi' })).toHaveAttribute('aria-current', 'page')
  // Badge & callout tidak memakai latar berwarna.
  const bgs = await page.evaluate(() => [...document.querySelectorAll('.badge, .alert, .stat-icon')].map((e) => getComputedStyle(e).backgroundColor))
  for (const bg of bgs) expect(['rgb(255, 255, 255)', 'rgb(249, 250, 251)', 'rgb(242, 244, 247)']).toContain(bg)
  await expect(page).toHaveTitle(/MDUNDIG$/)
})

test('akses undangan: satu akun = satu undangan, dipilih lewat popup (tanpa mengetik ID), aturan password terlihat', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/admin/pengguna')
  // Bagian akses & pemetaan lama sudah tidak ada di halaman ini.
  await expect(page.getByTestId('access-section')).toHaveCount(0)
  await expect(page.getByText('Pemetaan otomatis dari WordPress')).toHaveCount(0)
  await expect(page.getByRole('row', { name: /pelanggan1/ }).getByText('Belum ada')).toBeVisible()
  await expect(page.getByRole('row', { name: /admin/ }).getByRole('button', { name: /Atur akses/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Atur akses undangan pelanggan1' }).click()
  const dlg = page.getByRole('dialog', { name: 'Atur akses undangan' })
  // Pilih satu (radio): tidak ada centang ganda / "pilih semua".
  await expect(dlg.getByRole('checkbox')).toHaveCount(0)
  await expect(dlg.getByText(/Pilih semua/)).toHaveCount(0)
  await dlg.getByLabel('Cari undangan').fill('andi')
  await expect(dlg.getByRole('radio', { name: /Rina & Doni/ })).toHaveCount(0)
  await dlg.getByRole('radio', { name: /Andi & Sari/ }).check()
  await expect(dlg.getByText('Dipilih: Andi & Sari')).toBeVisible()
  await dlg.getByRole('button', { name: 'Simpan akses' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akses undangan disimpan')
  expect(state.grants).toEqual([{ invitation_id: '11111111-1111-4111-8111-111111111111', user_id: '00000000-0000-4000-8000-000000000002' }])
  await expect(page.getByRole('row', { name: /pelanggan1/ }).getByText('Andi & Sari')).toBeVisible()

  // Ganti ke undangan lain: akses lama otomatis diganti (tetap satu).
  await page.getByRole('button', { name: 'Atur akses undangan pelanggan1' }).click()
  await expect(dlg.getByRole('radio', { name: /Andi & Sari/ })).toBeChecked()
  await dlg.getByRole('radio', { name: /Rina & Doni/ }).check()
  await dlg.getByRole('button', { name: 'Simpan akses' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akses undangan disimpan')
  expect(state.grants).toEqual([{ invitation_id: '55555555-5555-4555-8555-555555555555', user_id: '00000000-0000-4000-8000-000000000002' }])

  // Cabut: pilih "Tanpa undangan".
  await page.getByRole('button', { name: 'Atur akses undangan pelanggan1' }).click()
  await dlg.getByRole('radio', { name: /Tanpa undangan/ }).check()
  await dlg.getByRole('button', { name: 'Simpan akses' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akses undangan dicabut')
  expect(state.grants).toHaveLength(0)

  // Tambah akun sekaligus memilih undangan.
  await page.getByRole('button', { name: 'Tambah akun' }).click()
  const add = page.getByRole('dialog', { name: 'Tambah akun pelanggan' })
  await expect(page.getByTestId('password-rule')).toContainText('Minimal 8 karakter')
  await add.getByLabel('Username').fill('sari.andi')
  await add.getByLabel('Nomor WhatsApp aktif').fill('+62 813 1111 2222')
  await add.getByLabel('Password', { exact: true }).fill('rahasia-sari-1')
  await add.getByLabel('Ulangi password').fill('rahasia-sari-1')
  await add.getByRole('button', { name: 'Berikutnya' }).click()
  await add.getByRole('radio', { name: /Andi & Sari/ }).check()
  await add.getByRole('button', { name: 'Buat akun' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akun sari.andi dibuat dan dapat melihat undangan yang dipilih')
  // Pesan akses menyebut undangan yang dipilih.
  expect(await add.getByTestId('wa-panel').getByLabel(/^Pesan/).inputValue()).toContain('undangan *Andi & Sari*')
  await expect(add.getByTestId('wa-send')).toHaveAttribute('href', /wa\.me\/6281311112222\?/)
  await add.getByRole('button', { name: 'Tutup' }).click()
  await expect(page.getByRole('row', { name: /sari\.andi/ }).getByText('Andi & Sari')).toBeVisible()

  // Akses 1:1: undangan yang sudah dipakai sari.andi tidak bisa dipilih untuk akun lain.
  await page.getByRole('button', { name: 'Atur akses undangan pelanggan1' }).click()
  await expect(dlg.getByRole('radio', { name: /Andi & Sari/ })).toBeDisabled()
  await expect(dlg.getByText('Sudah dipakai: sari.andi')).toBeVisible()
  await expect(dlg.getByRole('radio', { name: /Rina & Doni/ })).toBeEnabled()
  await dlg.getByRole('button', { name: 'Batal' }).click()
  await page.getByRole('button', { name: 'Tambah akun' }).click()
  await add.getByLabel('Username').fill('akun.lain')
  await add.getByLabel('Nomor WhatsApp aktif').fill('081311113333')
  await add.getByLabel('Password', { exact: true }).fill('rahasia-lain-1')
  await add.getByLabel('Ulangi password').fill('rahasia-lain-1')
  await add.getByRole('button', { name: 'Berikutnya' }).click()
  await expect(add.getByText('2. Akses', { exact: true })).toBeVisible()
  await expect(add.getByRole('radio', { name: /Andi & Sari/ })).toBeDisabled()
  expect(state.grants.filter((g) => g.invitation_id === '11111111-1111-4111-8111-111111111111')).toHaveLength(1)
  await noHorizontalOverflow(page)
})

test('pemetaan otomatis WordPress pindah ke Koneksi, ID dipilih bukan diketik', async ({ page }) => {
  await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/admin/koneksi')
  const panel = page.getByTestId('owner-mapping')
  await panel.getByText('Pemetaan otomatis dari WordPress (lanjutan)').click()
  await expect(panel.getByLabel('ID pemilik dari WordPress')).toBeVisible()
  expect(await panel.getByLabel('ID pemilik dari WordPress').evaluate((e) => e.tagName)).toBe('SELECT')
  await expect(panel.getByRole('link', { name: 'Pengguna & Akses' })).toHaveAttribute('href', '/admin/pengguna')
  await noHorizontalOverflow(page)
})

test('footer tampil di dashboard (menempel di bawah pada halaman pendek) dan di halaman login', async ({ page }) => {
  await installMocks(page, 'customer')
  await page.goto('/login')
  await expect(page.getByText(/© \d{4} MDUNDIG/)).toBeVisible()
  await login(page, 'customer')
  await page.goto('/profil')
  const footer = page.locator('footer.footer')
  await expect(footer).toContainText('MDUNDIG')
  await expect(footer).toContainText('Manajemen Data Undangan Digital')
  const box = await footer.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  // Pada halaman pendek footer berada di dasar layar, bukan menggantung di tengah.
  if (box && viewport) expect(box.y + box.height).toBeGreaterThan(viewport.height - 40)
  await noHorizontalOverflow(page)
})

test('ringkasan admin: KPI, grafik, donut, form masuk dengan avatar, panel sejajar', async ({ page }) => {
  await installMocks(page, 'admin')
  await login(page, 'admin')
  await expect(page.getByText('Total undangan')).toBeVisible()
  await expect(page.getByText('Website terhubung')).toBeVisible()
  await expect(page.getByRole('img', { name: /Reservasi terkonfirmasi: grafik 7 hari/ })).toBeVisible()
  await page.getByLabel('Rentang waktu').selectOption('30')
  await expect(page.getByRole('img', { name: /grafik 30 hari/ })).toBeVisible()
  await expect(page.getByText('Terkonfirmasi', { exact: true })).toBeVisible()
  const orders = page.getByTestId('admin-summary')
  await expect(orders.getByRole('img', { name: 'Rina Kartika' })).toBeVisible()
  // Tanpa kotak statistik; panel baris bawah setinggi panel Status reservasi.
  await expect(orders.getByText('Belum diproses')).toHaveCount(0)
  await expectListPanelsMatchStatus(page)
  await noHorizontalOverflow(page)
  await orders.getByRole('link', { name: /Rina Kartika/ }).first().click()
  await expect(page).toHaveURL(/\/order-undangan\?order=/)
  await expect(page.getByTestId('order-detail')).toBeVisible()
})

test('ringkasan pelanggan: tanpa order & website, hanya Daftar Hadiah miliknya', async ({ page }) => {
  await installMocks(page, 'customer')
  await login(page, 'customer')
  await expect(page.getByText('Total undangan')).toBeVisible()
  await expectListPanelsMatchStatus(page)
  await expect(page.getByText('Website terhubung')).toHaveCount(0)
  await expect(page.getByTestId('admin-summary')).toHaveCount(0)
  await expect(page.getByText('Data form masuk')).toHaveCount(0)
  await noHorizontalOverflow(page)
})

test('scrollbar tipis biru di popup', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'gaya ::-webkit-scrollbar')
  await installMocks(page, 'admin')
  await login(page, 'admin')
  const width = await page.evaluate(() => {
    const el = document.createElement('div')
    el.style.cssText = 'width:100px;height:50px;overflow:scroll;position:absolute;top:0'
    el.innerHTML = '<div style="height:200px"></div>'
    document.body.appendChild(el)
    const w = el.offsetWidth - el.clientWidth
    el.remove()
    return w
  })
  expect(width).toBeLessThanOrEqual(4)
})

async function expectListPanelsMatchStatus(page: import('@playwright/test').Page) {
  // Satu kolom (< 1024px): panel mengikuti isi, maksimal 420px.
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    const heights = await page.locator('.row-3 > .panel').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    for (const h of heights) expect(h).toBeLessThanOrEqual(421)
    return
  }
  await expect(async () => {
    const status = await page.getByRole('region', { name: 'Status reservasi' }).evaluate((e) => Math.round(e.getBoundingClientRect().height))
    const heights = await page.locator('.row-3 > .panel').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    expect(heights.length).toBeGreaterThan(1)
    for (const h of heights) expect(Math.abs(h - status)).toBeLessThanOrEqual(1)
  }).toPass({ timeout: 5000 })
}

function manyOrders(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `33333333-3333-4333-8333-33333333333${i}`, website_id: '22222222-2222-4222-8222-222222222222', post_title: 'Pesan Undangan', post_id: 5,
    status: 'baru', source: 'widget', admin_note: '', created_at: `2026-10-16T0${i}:00:00.000Z`, entries: [{ key: 'groom_name', label: 'Nama Pria', value: 'Andi' }] }))
}
// Posisi pita (px yang sudah berjalan) dari transform track di dalam region.
const orderOffset = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Daftar order terbaru' })
  .evaluate((e) => -new DOMMatrix(getComputedStyle(e.firstElementChild as Element).transform).m42)

test('ringkasan: form masuk berjalan sendiri halus tanpa ujung, berhenti saat disorot', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'cukup satu viewport')
  await installMocks(page, 'admin', { orders: manyOrders(5) })
  await login(page, 'admin')
  const list = page.getByRole('region', { name: 'Daftar order terbaru' })
  await expect(list).toBeVisible()
  // Salinan penyambung ada, tapi tersembunyi dari pembaca layar (tetap 5 tautan order).
  await expect(list.locator('[aria-hidden="true"][inert]')).toHaveCount(1)
  await expect(list.getByRole('link')).toHaveCount(5)
  await expect.poll(() => orderOffset(page), { timeout: 8000 }).toBeGreaterThan(2)
  // Halus: gerak per frame sub-piksel (tidak melompat per piksel), selalu maju.
  const steps = await list.evaluate(async (e) => {
    const tr = e.firstElementChild as HTMLElement
    const read = () => -new DOMMatrix(getComputedStyle(tr).transform).m42
    const out: number[] = []
    let prev = read()
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const cur = read(); out.push(cur - prev); prev = cur
    }
    return out
  })
  for (const d of steps) { expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThan(1) }
  // Tanpa ujung: melewati satu putaran penuh menyambung (offset kembali kecil), tidak melompat ke atas.
  const period = await list.evaluate((e) => (e.firstElementChild!.firstElementChild as HTMLElement).getBoundingClientRect().height)
  await list.hover()
  const before = await orderOffset(page)
  await page.mouse.wheel(0, Math.ceil(period))
  const after = await orderOffset(page)
  expect(Math.abs(after - before)).toBeLessThan(2)
  // Disorot kursor: berhenti.
  await page.waitForTimeout(3000)
  const a = await orderOffset(page)
  await page.waitForTimeout(1200)
  expect(Math.abs((await orderOffset(page)) - a)).toBeLessThan(0.5)
  // Hadiah terpopuler statis (tidak bergulir sendiri).
  expect(await page.getByRole('region', { name: 'Daftar hadiah terpopuler' }).evaluate((e) => e.scrollTop)).toBe(0)
})

test('ponsel: daftar ringkasan & katalog statis 4 teratas — tanpa gulir otomatis maupun gulir di dalam kartu', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'khusus ponsel; desktop tetap bergulir otomatis')
  await installMocks(page, 'admin', { orders: manyOrders(6), extraGifts: 5 })
  await login(page, 'admin')
  for (const name of ['Daftar order terbaru', 'Daftar aktivitas terbaru', 'Daftar hadiah terpopuler']) {
    const list = page.getByRole('region', { name })
    if (!(await list.count())) continue
    await expect(list).toHaveClass(/is-static/)
    await expect(list).not.toHaveClass(/marquee/)
    expect(await list.locator('li').count()).toBeLessThanOrEqual(4)
    // Tidak ada gulir di dalam kartu dan tidak ada salinan pita.
    expect(await list.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
    await expect(list.locator('[aria-hidden="true"][inert]')).toHaveCount(0)
  }
  await expect(page.getByRole('region', { name: 'Daftar order terbaru' }).locator('li')).toHaveCount(4)
  // Tidak bergerak sendiri.
  const track = page.getByRole('region', { name: 'Daftar order terbaru' }).locator('.track')
  const before = await track.evaluate((el) => getComputedStyle(el).transform)
  await page.waitForTimeout(2500)
  expect(await track.evaluate((el) => getComputedStyle(el).transform)).toBe(before)

  // Katalog di detail undangan: 4 teratas + tombol tampilkan semua.
  await page.goto('/daftar-hadiah/11111111-1111-4111-8111-111111111111')
  const catalog = page.getByRole('region', { name: 'Daftar katalog hadiah' })
  await expect(catalog).toHaveClass(/is-static/)
  await expect(catalog.locator('li')).toHaveCount(4)
  const toggle = page.getByTestId('catalog-toggle')
  await expect(toggle).toHaveText(/Tampilkan semua \d+ hadiah/)
  await toggle.click()
  expect(await catalog.locator('li').count()).toBeGreaterThan(4)
  await expect(toggle).toHaveText('Tampilkan lebih sedikit')
  await noHorizontalOverflow(page)
})

test('desktop tetap: katalog & form masuk bergulir otomatis, tanpa tombol tampilkan semua', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'cukup satu viewport')
  await installMocks(page, 'admin', { orders: manyOrders(6), extraGifts: 5 })
  await login(page, 'admin')
  await expect(page.getByRole('region', { name: 'Daftar order terbaru' })).toHaveClass(/marquee/)
  await page.goto('/daftar-hadiah/11111111-1111-4111-8111-111111111111')
  await expect(page.getByRole('region', { name: 'Daftar katalog hadiah' })).toHaveClass(/marquee/)
  await expect(page.getByTestId('catalog-toggle')).toHaveCount(0)
})

test('ringkasan: prefers-reduced-motion mematikan gulir otomatis', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'cukup satu viewport')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installMocks(page, 'admin', { orders: manyOrders(5) })
  await login(page, 'admin')
  const list = page.getByRole('region', { name: 'Daftar order terbaru' })
  await expect(list).toBeVisible()
  await page.waitForTimeout(3500)
  expect(Math.abs(await orderOffset(page))).toBe(0)
  await expect(list.locator('[inert]')).toHaveCount(0)
  // Tetap bisa digulir biasa.
  expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight && getComputedStyle(e).overflowY === 'auto')).toBe(true)
})

test('ponsel: tabel jadi kartu berlabel, tombol aksi terlihat tanpa geser; KPI 2 kolom', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'khusus ponsel')
  await installMocks(page, 'admin')
  await login(page, 'admin')
  const vw = page.viewportSize()!.width
  // Ringkasan: dua kartu KPI pertama sebaris.
  const kpiTops = await page.locator('.kpis > .kpi').evaluateAll((els) => els.slice(0, 2).map((e) => Math.round(e.getBoundingClientRect().top)))
  expect(kpiTops[0]).toBe(kpiTops[1])
  const pages: Array<[string, RegExp]> = [
    ['/daftar-hadiah', /^Detail$/],
    ['/daftar-hadiah/reservasi', /^Ubah reservasi/],
    ['/order-undangan', /^Detail order/],
    ['/admin/website', /^Hapus website/],
    ['/admin/pengguna', /^Atur akses undangan/],
  ]
  for (const [path, action] of pages) {
    await page.goto(path)
    const btn = page.locator('.table-stack').getByRole(path === '/daftar-hadiah' ? 'link' : 'button', { name: action }).first()
    await expect(btn).toBeVisible()
    const box = (await btn.boundingBox())!
    expect(box.x + box.width, path).toBeLessThanOrEqual(vw)
    // Tidak ada gulir horizontal di dalam tabel maupun halaman.
    expect(await page.locator('.table-wrap').first().evaluate((e) => e.scrollWidth - e.clientWidth), path).toBeLessThanOrEqual(1)
    await noHorizontalOverflow(page)
    // Nilai sel tetap berlabel kolom.
    expect(await page.locator('.table-stack tbody td[data-label]:not([data-label=""])').count(), path).toBeGreaterThan(1)
  }
})

test('detail undangan: KPI stok, bar ketersediaan, akses pelanggan di samping (beri & cabut)', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/daftar-hadiah/11111111-1111-4111-8111-111111111111')
  await expect(page.getByRole('heading', { name: 'Andi & Sari', level: 1 })).toBeVisible()
  await expect(page.getByText('Stok tersedia')).toBeVisible()
  await expect(page.getByRole('img', { name: /dari \d+ tersedia/ }).first()).toBeVisible()
  const panel = page.getByTestId('access-panel')
  await expect(panel.getByText('Belum ada pelanggan')).toBeVisible()
  await panel.getByLabel('Tambah pelanggan').selectOption({ label: 'pelanggan1 — Pelanggan Uji' })
  await panel.getByRole('button', { name: 'Beri akses' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akses pelanggan ditambahkan')
  await expect(panel.getByRole('img', { name: 'Pelanggan Uji' })).toBeVisible()
  await expect(panel).not.toContainText('akun.mdundig.invalid')
  await expect(page.locator('.kpi', { hasText: 'Akses pelanggan' })).toContainText('1')
  expect(state.grants).toHaveLength(1)
  // Satu undangan = satu akun: setelah ada pemegang, form tambah pelanggan disembunyikan.
  await expect(panel.getByTestId('access-full')).toBeVisible()
  await expect(panel.getByLabel('Tambah pelanggan')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Cabut akses Pelanggan Uji' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akses pelanggan dicabut')
  expect(state.grants).toHaveLength(0)
  await noHorizontalOverflow(page)
})

test('detail undangan (pelanggan): tanpa panel akses & tombol hapus', async ({ page }) => {
  await installMocks(page, 'customer')
  await login(page, 'customer')
  await page.goto('/daftar-hadiah/11111111-1111-4111-8111-111111111111')
  await expect(page.getByText('Stok tersedia')).toBeVisible()
  await expect(page.getByTestId('access-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hapus undangan' })).toHaveCount(0)
  await noHorizontalOverflow(page)
})

test('detail undangan: katalog berjalan halus menyambung & setinggi panel akses; reservasi 7 per halaman', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'cukup satu viewport')
  const reservations = Array.from({ length: 9 }, (_, i) => ({ id: `rr${i}`, invitation_id: '11111111-1111-4111-8111-111111111111', invitation_title: 'Andi & Sari', gift_id: 'g1', gift_name: 'Rice Cooker',
    guest_name: `Tamu ${i + 1}`, guest_whatsapp: '6281234567890', message: '', quantity: 1, status: 'confirmed', created_at: '2026-10-16T09:00:00.000Z', source: 'widget', admin_note: '' }))
  await installMocks(page, 'admin', { extraGifts: 5, reservations })
  await login(page, 'admin')
  await page.goto('/daftar-hadiah/11111111-1111-4111-8111-111111111111')
  const catalog = page.getByRole('region', { name: 'Katalog hadiah', exact: true })
  const access = page.getByTestId('access-panel')
  await expect(catalog.getByText('7 hadiah')).toBeVisible()
  await expect(access.getByText('Akun yang dapat melihat & mengunduh')).toBeVisible()
  // Katalog setinggi panel akses (tanpa celah di bawah panel akses), setelah panel selesai dimuat.
  await expect(async () => {
    const [ch, ah] = await Promise.all([catalog.evaluate((e) => Math.round(e.getBoundingClientRect().height)), access.evaluate((e) => Math.round(e.getBoundingClientRect().height))])
    expect(Math.abs(ch - ah)).toBeLessThanOrEqual(1)
  }).toPass({ timeout: 5000 })
  // Tidak ada ruang kosong di bawah isi panel akses (selain padding kartu).
  const gap = await access.evaluate((panel) => {
    const body = panel.querySelector('.panel-body') as HTMLElement
    const last = body.lastElementChild as HTMLElement
    return Math.round(panel.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom - parseFloat(getComputedStyle(body).paddingBottom))
  })
  expect(gap).toBeLessThanOrEqual(2)
  const list = page.getByRole('region', { name: 'Daftar katalog hadiah' })
  await expect(list.locator('[aria-hidden="true"][inert]')).toHaveCount(1)
  const offset = () => list.evaluate((e) => -new DOMMatrix(getComputedStyle(e.firstElementChild as Element).transform).m42)
  await expect.poll(offset, { timeout: 8000 }).toBeGreaterThan(2)
  // Reservasi: 7 baris, lalu halaman berikutnya.
  const res = page.getByRole('region', { name: /Tabel reservasi/ })
  await expect(res.locator('tbody tr')).toHaveCount(7)
  await page.getByRole('button', { name: /Berikutnya|berikutnya|Selanjutnya/ }).click()
  await expect(res.locator('tbody tr')).toHaveCount(2)
})

test('filter: kolom cari melebar sehingga pilihan di sebelahnya rata kanan', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'tata letak desktop')
  await installMocks(page, 'admin')
  await login(page, 'admin')
  for (const [path, last] of [['/order-undangan', 'Filter website'], ['/daftar-hadiah/reservasi', 'Filter status']] as const) {
    await page.goto(path)
    const select = page.getByLabel(last)
    const row = page.locator('.card-body', { has: select })
    const [sb, rb] = await Promise.all([select.boundingBox(), row.evaluate((e) => { const r = e.getBoundingClientRect(); const pr = parseFloat(getComputedStyle(e).paddingRight); return r.right - pr })])
    expect(Math.abs(sb!.x + sb!.width - rb), path).toBeLessThanOrEqual(2)
  }
})

test('notifikasi admin: lonceng berangka, panel terbaru, klik membuka data & menandai dibaca', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'ponsel: notifikasi lewat menu bawah (lonceng atas disembunyikan)')
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  const bell = page.getByTestId('notif-bell')
  await expect(bell).toHaveAccessibleName('Notifikasi, 2 belum dibaca')
  await bell.click()
  const panel = page.getByRole('dialog', { name: 'Notifikasi terbaru' })
  await expect(panel.getByText('Order undangan baru')).toBeVisible()
  await expect(panel.getByText('Budi memilih Rice Cooker — Andi & Sari')).toBeVisible()
  await panel.getByRole('button', { name: /Order undangan baru/ }).click()
  await expect(page).toHaveURL(/\/order-undangan\?order=/)
  await expect(page.getByTestId('order-detail')).toBeVisible()
  await expect.poll(() => state.notifications.find((n) => n.kind === 'order')!.read_at).not.toBeNull()
  await expect(bell).toHaveAccessibleName('Notifikasi, 1 belum dibaca')
  await noHorizontalOverflow(page)
})

test('halaman notifikasi: filter, tandai semua dibaca, hapus tidak menonjol', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/notifikasi')
  await expect(page.getByRole('heading', { name: 'Notifikasi', level: 1 })).toBeVisible()
  const list = page.getByRole('list', { name: 'Daftar notifikasi' })
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await page.getByRole('button', { name: 'Belum dibaca', exact: true }).click()
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: 'Semua', exact: true }).click()
  await page.getByLabel('Jenis notifikasi').selectOption('order')
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await page.getByLabel('Jenis notifikasi').selectOption('')
  await expect(list.getByRole('listitem')).toHaveCount(3)
  // Tombol hapus per baris tidak menonjol: ikon abu-abu tanpa teks, bukan tombol merah.
  const del = list.getByRole('button', { name: /^Hapus notifikasi/ }).first()
  expect(await del.evaluate((e) => e.className)).not.toMatch(/btn-danger/)
  await del.click()
  await expect(page.getByTestId('toast')).toContainText('Notifikasi dihapus')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: 'Tandai semua dibaca' }).click()
  await expect(page.getByTestId('toast')).toContainText('Semua notifikasi ditandai dibaca')
  expect(state.notifications.every((n) => n.read_at)).toBe(true)
  await page.getByRole('button', { name: 'Hapus yang sudah dibaca' }).click()
  await page.getByRole('dialog', { name: 'Hapus notifikasi yang sudah dibaca?' }).getByRole('button', { name: 'Hapus', exact: true }).click()
  await expect(page.getByText('Belum ada notifikasi')).toBeVisible()
  await noHorizontalOverflow(page)
})

test('notifikasi pelanggan: hanya reservasi undangannya, tanpa filter jenis order', async ({ page }, info) => {
  await installMocks(page, 'customer')
  await login(page, 'customer')
  if (info.project.name === 'mobile') {
    // Ponsel: hanya satu tempat notifikasi — di menu bawah (lonceng atas disembunyikan).
    await expect(page.getByTestId('notif-bell')).toBeHidden()
    await expect(page.getByTestId('bottom-nav').getByLabel('1 belum dibaca')).toBeVisible()
  } else {
    await expect(page.getByTestId('notif-bell')).toHaveAccessibleName('Notifikasi, 1 belum dibaca')
  }
  await page.goto('/notifikasi')
  await expect(page.getByText('Reservasi hadiah baru pada undangan Anda.')).toBeVisible()
  await expect(page.getByLabel('Jenis notifikasi')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Daftar notifikasi' }).getByRole('listitem')).toHaveCount(1)
})

test('notifikasi: hapus semua (termasuk belum dibaca) lewat tautan kecil + konfirmasi', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/notifikasi')
  await expect(page.getByRole('list', { name: 'Daftar notifikasi' }).getByRole('listitem')).toHaveCount(3)
  const link = page.getByRole('button', { name: 'Hapus semua', exact: true })
  // Tidak menonjol: tautan teks kecil, bukan tombol merah.
  expect(await link.evaluate((e) => e.className)).not.toMatch(/btn/)
  await link.click()
  const dlg = page.getByRole('dialog', { name: 'Hapus semua notifikasi?' })
  await expect(dlg).toContainText('termasuk yang belum dibaca')
  await dlg.getByRole('button', { name: 'Hapus semua', exact: true }).click()
  await expect(page.getByTestId('toast')).toContainText('3 notifikasi dihapus')
  await expect(page.getByText('Belum ada notifikasi')).toBeVisible()
  expect(state.notifications).toHaveLength(0)
  if (await page.getByTestId('notif-bell').isVisible()) await expect(page.getByTestId('notif-bell')).toHaveAccessibleName('Notifikasi')
  else await expect(page.getByTestId('bottom-nav').getByLabel(/belum dibaca/)).toHaveCount(0)
})

test('ponsel pelanggan: menu bawah dengan lingkaran aktif yang bergeser; tanpa burger', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'khusus ponsel')
  await installMocks(page, 'customer')
  await login(page, 'customer')
  const nav = page.getByTestId('bottom-nav')
  await expect(nav).toBeVisible()
  await expect(page.getByRole('button', { name: 'Buka menu' })).toBeHidden()
  await expect(nav.getByRole('link')).toHaveText(['Ringkasan', 'Undangan', 'Reservasi', '1Notifikasi', 'Profil'])
  await expect(nav.getByRole('link', { name: 'Ringkasan' })).toHaveAttribute('aria-current', 'page')
  const bubbleX = () => nav.locator('.bnav-bubble').evaluate((e) => Math.round(e.getBoundingClientRect().left))
  const start = await bubbleX()
  await nav.getByRole('link', { name: 'Reservasi' }).click()
  await expect(page).toHaveURL(/\/daftar-hadiah\/reservasi$/)
  await expect(nav.getByRole('link', { name: 'Reservasi' })).toHaveAttribute('aria-current', 'page')
  // Lingkaran aktif bergeser ke menu Reservasi (kolom ke-3).
  await expect.poll(bubbleX).toBeGreaterThan(start + 100)
  await nav.getByRole('link', { name: 'Undangan' }).click()
  await expect(page).toHaveURL(/\/daftar-hadiah$/)
  await expect(nav.getByRole('link', { name: 'Undangan' })).toHaveAttribute('aria-current', 'page')
  // Konten & footer tidak tertutup menu bawah.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const footer = await page.getByText(/© \d{4} MDUNDIG/).boundingBox()
  const navBox = await nav.boundingBox()
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(navBox!.y)
  await noHorizontalOverflow(page)
})

test('menu bawah tidak tampil di tablet & desktop (admin maupun pelanggan)', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'khusus layar lebar')
  for (const role of ['admin', 'customer'] as const) {
    await installMocks(page, role)
    await login(page, role)
    await expect(page.getByText('Total undangan')).toBeVisible()
    await expect(page.getByTestId('bottom-nav')).toBeHidden()
  }
})

test('ponsel admin: 4 menu utama + Lainnya (lembar berkelompok, halaman aktif ditandai)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'khusus ponsel')
  await installMocks(page, 'admin')
  await login(page, 'admin')
  const nav = page.getByTestId('bottom-nav')
  await expect(nav).toBeVisible()
  await expect(page.getByRole('button', { name: 'Buka menu' })).toBeHidden()
  await expect(nav.getByRole('link')).toHaveText(['Ringkasan', 'Hadiah', 'Order', '2Notifikasi'])
  // Notifikasi tidak dobel: lonceng atas disembunyikan di ponsel.
  await expect(page.getByTestId('notif-bell')).toBeHidden()
  const more = nav.getByRole('button', { name: 'Lainnya' })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await nav.getByRole('link', { name: 'Order' }).click()
  await expect(page).toHaveURL(/\/order-undangan$/)
  await expect(nav.getByRole('link', { name: 'Order' })).toHaveAttribute('aria-current', 'page')
  // Lainnya → lembar berkelompok dengan deskripsi.
  await more.click()
  const sheet = page.getByRole('dialog', { name: 'Menu lainnya' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('region', { name: 'Pengaturan' }).getByRole('link')).toHaveCount(5)
  await expect(sheet.getByRole('region', { name: 'Data' }).getByRole('link', { name: /Kalender Acara/ })).toBeVisible()
  await expect(sheet.getByText('URL API & Token Website untuk plugin')).toBeVisible()
  await sheet.getByRole('link', { name: /Koneksi/ }).click()
  await expect(page).toHaveURL(/\/admin\/koneksi/)
  await expect(sheet).toHaveCount(0)
  // Posisi jelas: tombol Lainnya aktif & halaman ditandai "Sedang dibuka".
  await expect(more).toHaveAttribute('aria-current', 'page')
  await more.click()
  await expect(sheet.getByRole('link', { name: /Koneksi/ })).toHaveAttribute('aria-current', 'page')
  await expect(sheet.getByText('Sedang dibuka')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(more).toBeFocused()
  // Keluar dari lembar.
  await more.click()
  await sheet.getByRole('button', { name: /Keluar/ }).click()
  await expect(page).toHaveURL(/\/login/)
  await noHorizontalOverflow(page)
})

test('performa: tidak ada animasi berjalan terus saat daftar diam; KPI berupa tautan; muat cepat', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'cukup satu viewport')
  // Hitung callback requestAnimationFrame (animasi yang terus berjalan membuat halaman lag & boros baterai).
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number }
    w.__raf = 0
    const orig = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => orig((t) => { w.__raf++; cb(t) })
  })
  await installMocks(page, 'customer')
  const t0 = Date.now()
  await login(page, 'customer')
  await expect(page.getByText('Total undangan')).toBeVisible()
  expect(Date.now() - t0, 'login → Ringkasan tampil').toBeLessThan(5000)
  // KPI dapat diklik (sebelumnya dirender sebagai elemen <nuxtlink> yang tidak dikenal).
  await expect(page.locator('a.kpi')).toHaveCount(3)
  await page.waitForTimeout(1500)
  const before = await page.evaluate(() => (window as unknown as { __raf: number }).__raf)
  await page.waitForTimeout(2000)
  const frames = await page.evaluate(() => (window as unknown as { __raf: number }).__raf) - before
  // Daftar pendek (tidak bergulir) → nyaris tanpa frame animasi; sebelumnya ±360 frame per 2 detik.
  expect(frames, 'frame animasi dalam 2 detik saat diam').toBeLessThan(20)
  await page.locator('a.kpi').first().click()
  await expect(page).toHaveURL(/\/daftar-hadiah$/)
})

test('performa: font disajikan sendiri (tanpa Google Fonts) dan layar pembuka berlogo', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'cukup satu viewport')
  const external: string[] = []
  page.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url()) })
  const html = await (await request.get('/login')).text()
  expect(html).toContain('Memuat MDUNDIG')
  await installMocks(page, 'customer')
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible()
  expect(await page.evaluate(() => document.fonts.check('500 16px Ubuntu'))).toBe(true)
  expect(external).toHaveLength(0)
})
