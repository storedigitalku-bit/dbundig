import { expect, test, type Page } from '@playwright/test'
import { installMocks, login, openNav } from './mocks'

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
}

test('menu admin: Kalender Acara, Pesan WhatsApp, Riwayat & Error; tidak tampil untuk pelanggan', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'menu samping; ponsel diuji lewat lembar Lainnya')
  await installMocks(page, 'admin')
  await login(page, 'admin')
  await openNav(page)
  for (const name of ['Kalender Acara', 'Pesan WhatsApp', 'Riwayat & Error']) await expect(page.getByRole('link', { name })).toBeVisible()
})

test('pelanggan tidak bisa membuka halaman admin baru', async ({ page }) => {
  await installMocks(page, 'customer')
  await login(page, 'customer')
  for (const path of ['/kalender', '/admin/riwayat', '/admin/pesan-whatsapp']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/tidak-berhak$/)
  }
})

test('kalender acara: acara 14 hari ke depan, kisi bulan, rincian tanggal & tautan ke order', async ({ page }) => {
  await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/kalender')
  const up = page.getByTestId('upcoming')
  await expect(up.getByText('Andi & Sari').first()).toBeVisible()
  await expect(up.getByText('2 hari lagi').first()).toBeVisible()
  // Acara 30 hari lagi tidak masuk daftar 14 hari.
  await expect(up.getByText('Doni & Rina')).toHaveCount(0)
  // Pilih tanggal acara di kisi → rincian Akad & Resepsi.
  const d = new Date(); d.setDate(d.getDate() + 2)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (d.getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Bulan berikutnya' }).click()
  await page.locator(`.cal-day[data-date="${iso}"]`).click()
  const detail = page.getByTestId('day-detail')
  await expect(detail.getByText('Akad', { exact: true })).toBeVisible()
  await expect(detail.getByText('Resepsi', { exact: true })).toBeVisible()
  await expect(detail.getByRole('link', { name: 'Buka peta Andi & Sari' })).toHaveAttribute('href', 'https://maps.example/a')
  await detail.getByRole('link', { name: 'Detail' }).first().click()
  await expect(page).toHaveURL(/\/order-undangan\?order=33333333-3333-4333-8333-333333333333/)
  await expect(page.getByTestId('order-detail')).toBeVisible()
})

test('kalender: tampilan ponsel ringkas tanpa luapan', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'khusus ponsel')
  await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/kalender')
  await expect(page.locator('.cal-day').first()).toBeVisible()
  await noHorizontalOverflow(page)
})

test('riwayat & error: aktivitas berbahasa sehari-hari, filter, error bisa dikosongkan', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/admin/riwayat')
  await expect(page.getByText('Memberi akses undangan')).toBeVisible()
  await expect(page.getByText('Membuat akun')).toBeVisible()
  await page.getByLabel('Jenis aktivitas').selectOption('user')
  await expect(page.getByText('Memberi akses undangan')).toHaveCount(0)
  await page.getByRole('tab', { name: /Error sistem/ }).click()
  await expect(page.getByText('Contoh error server')).toBeVisible()
  await page.getByRole('button', { name: 'Kosongkan' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Kosongkan' }).click()
  await expect(page.getByText('Tidak ada error')).toBeVisible()
  expect(state.mutations).toContain('errors.clear')
  await noHorizontalOverflow(page)
})

test('pesan WhatsApp: template bisa diubah dengan pratinjau; placeholder wajib dicek; dipakai di popup Pengguna', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/admin/pesan-whatsapp')
  const access = page.getByTestId('tpl-access')
  const area = access.getByLabel('Template')
  await expect(area).toHaveValue(/\{password\}/)
  await expect(page.getByTestId('preview-access')).toContainText('Contoh-123')
  // Hapus {password} → peringatan & tombol simpan nonaktif.
  await area.fill('Halo {nama}, akun {username}\n{link_login}')
  await expect(access.getByRole('alert')).toContainText('{password}')
  await expect(access.getByRole('button', { name: 'Simpan pesan akses akun' })).toBeDisabled()
  // Sisipkan lewat tombol placeholder.
  await area.focus()
  await page.keyboard.press('End')
  await access.getByRole('button', { name: '{password}' }).click()
  await expect(area).toHaveValue(/\{password\}/)
  await expect(page.getByTestId('preview-access')).toContainText('Halo Rina, akun rina.doni')
  await access.getByRole('button', { name: 'Simpan pesan akses akun' }).click()
  await expect(page.getByTestId('toast')).toContainText('Template pesan akses akun disimpan')
  expect(state.waTemplates.access).toContain('{password}')
  // Popup WhatsApp di Pengguna memakai template baru.
  await page.goto('/admin/pengguna')
  await page.getByRole('button', { name: 'Kirim akses lewat WhatsApp pelanggan1' }).click()
  await expect(page.getByRole('dialog').getByLabel(/^Pesan/)).toHaveValue(/^Halo Pelanggan Uji, akun pelanggan1/)
})

test('rekap reservasi: dikirim ke pelanggan pemegang undangan lewat WhatsApp', async ({ page }) => {
  await installMocks(page, 'admin', { grants: [{ invitation_id: '11111111-1111-4111-8111-111111111111', user_id: '00000000-0000-4000-8000-000000000002' }] })
  await login(page, 'admin')
  await page.goto('/daftar-hadiah/11111111-1111-4111-8111-111111111111')
  await page.getByTestId('recap-open').click()
  const dlg = page.getByRole('dialog', { name: 'Kirim rekap reservasi' })
  const composer = dlg.getByTestId('wa-composer')
  await expect(composer.getByLabel('Kirim ke WhatsApp')).toHaveValue('0812-7777-8888')
  const msg = await composer.getByLabel(/^Pesan/).inputValue()
  expect(msg).toContain('Rice Cooker')
  expect(msg).toContain('Budi')
  expect(msg).toContain('/login?u=pelanggan1')
  await expect(composer.getByTestId('wc-send')).toHaveAttribute('href', /^https:\/\/wa\.me\/6281277778888\?text=/)
})

test('rekap 115 reservasi: menyebut jumlahnya + 6 terbaru, sisanya diarahkan ke web', async ({ page }) => {
  const reservations = Array.from({ length: 115 }, (_, i) => ({ id: `rr${i}`, invitation_id: '11111111-1111-4111-8111-111111111111', invitation_title: 'Andi & Sari', gift_id: `g${i % 10}`,
    gift_name: `Hadiah ${(i % 10) + 1}`, guest_name: `Tamu ${i + 1}`, guest_whatsapp: '6281234567890', message: '', quantity: 1, status: 'confirmed',
    created_at: new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString(), source: 'widget', admin_note: '' }))
  await installMocks(page, 'admin', { reservations, grants: [{ invitation_id: '11111111-1111-4111-8111-111111111111', user_id: '00000000-0000-4000-8000-000000000002' }] })
  await login(page, 'admin')
  await page.goto('/daftar-hadiah/11111111-1111-4111-8111-111111111111')
  await page.getByTestId('recap-open').click()
  const dlg = page.getByRole('dialog', { name: 'Kirim rekap reservasi' })
  await expect(dlg).toContainText('115 reservasi')
  const msg = await dlg.getByTestId('wa-composer').getByLabel(/^Pesan/).inputValue()
  expect(msg).toContain('*115 reservasi*')
  expect(msg.match(/🎁/g)).toHaveLength(6)
  // 6 terbaru = tamu 115 s.d. 110; tamu lama tidak disebut.
  expect(msg).toContain('Tamu 115')
  expect(msg).toContain('Tamu 110')
  expect(msg).not.toContain('Tamu 109')
  expect(msg).toContain('…dan 109 reservasi lainnya')
  expect(msg).toContain('/login?u=pelanggan1')
  const href = await dlg.getByTestId('wc-send').getAttribute('href')
  expect(href!.length).toBeLessThan(1500)
})

test('verifikasi dua langkah: aktifkan dari Profil, lalu login wajib kode authenticator', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'alur sama di semua ukuran layar')
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/profil')
  const card = page.getByTestId('mfa-card')
  await expect(card.getByText('Nonaktif', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: /Aktifkan verifikasi dua langkah/ }).click()
  await expect(card.getByRole('img', { name: 'Kode QR verifikasi dua langkah' })).toBeVisible()
  await expect(card.getByText('JBSWY3DPEHPK3PXP')).toBeVisible()
  await card.getByLabel('Kode 6 digit').fill('000000')
  await card.getByRole('button', { name: 'Aktifkan', exact: true }).click()
  await expect(card.getByRole('alert')).toContainText('Kode salah')
  await card.getByLabel('Kode 6 digit').fill('123456')
  await card.getByRole('button', { name: 'Aktifkan', exact: true }).click()
  await expect(page.getByTestId('toast')).toContainText('Verifikasi dua langkah aktif')
  await expect(card.getByText('Aktif', { exact: true })).toBeVisible()
  expect(state.factors.filter((f) => f.status === 'verified')).toHaveLength(1)

  // Login ulang: password saja tidak cukup → halaman verifikasi.
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByLabel('Username atau email').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('kata-sandi-uji')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page).toHaveURL(/\/verifikasi/)
  await page.goto('/order-undangan')
  await expect(page).toHaveURL(/\/verifikasi/)
  await page.getByLabel('Kode verifikasi').fill('111111')
  await page.getByRole('button', { name: 'Verifikasi' }).click()
  await expect(page.getByRole('alert')).toContainText('Kode salah')
  await page.getByLabel('Kode verifikasi').fill('123456')
  await page.getByRole('button', { name: 'Verifikasi' }).click()
  await expect(page.getByRole('heading', { name: 'Order Undangan', level: 1 })).toBeVisible()
})

test('halaman verifikasi tanpa perlu kode → kembali ke ringkasan', async ({ page }) => {
  await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/verifikasi')
  await expect(page.getByRole('heading', { name: 'Ringkasan' })).toBeVisible()
})

test('notifikasi perangkat: tampil jelas walau push belum dikonfigurasi', async ({ page }) => {
  await installMocks(page, 'customer')
  await login(page, 'customer')
  await page.goto('/profil')
  const card = page.getByTestId('push-card')
  await expect(card.getByText('Belum diaktifkan oleh admin.')).toBeVisible()
  await expect(page.getByTestId('mfa-card')).toHaveCount(0)
})

test('detail order: meta plugin baru — nama step & teks pilihan dipakai', async ({ page }) => {
  const entries = [
    { key: 'customer_name', label: 'Nama Pemesan', value: 'Rina' },
    { key: 'field_abc', label: 'Pilihan Paket', value: ['gold'] },
    { key: 'invitation_side', label: 'Undangan dari pihak', value: 'pria' },
  ]
  await installMocks(page, 'admin', { orders: [{ id: '88888888-8888-4888-8888-888888888888', website_id: 'w', post_title: 'Form Order', post_id: 5, status: 'baru', source: 'widget', admin_note: '', created_at: '2026-10-16T10:00:00.000Z',
    entries, meta: { sections: { field_abc: 'Paket & Tema' }, options: { field_abc: { gold: 'Paket Gold' } } } }] })
  await login(page, 'admin')
  await page.goto('/order-undangan?order=88888888-8888-4888-8888-888888888888')
  const detail = page.getByTestId('order-detail')
  await expect(detail.getByRole('region', { name: 'Paket & Tema' })).toContainText('Paket Gold')
  await expect(detail.getByRole('region', { name: 'Pemesan' })).toContainText('Pria')
  await expect(detail.getByRole('region', { name: 'Lainnya' })).toHaveCount(0)
})

test('error di browser dilaporkan ke log error admin', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.evaluate(() => { setTimeout(() => { throw new Error('Uji error browser') }, 0) })
  await expect.poll(() => state.clientErrors).toContain('Uji error browser')
})

test('PWA: manifest, ikon, service worker tersedia; proksi gambar menolak URL tanpa tanda tangan', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest.short_name).toBe('MDUNDIG')
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512'])
  for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png']) {
    const res = await page.request.get(icon)
    expect(res.status(), icon).toBe(200)
    expect(res.headers()['content-type']).toContain('image/png')
  }
  const sw = await page.request.get('/sw.js')
  expect(sw.status()).toBe(200)
  expect(await sw.text()).toContain("addEventListener('push'")
  expect((await page.request.get('/api/img?u=http%3A%2F%2Fexample.com%2Fa.jpg&e=9999999999&s=' + 'a'.repeat(32))).status()).toBe(403)
  expect((await page.request.get('/api/img')).status()).toBe(403)
})
