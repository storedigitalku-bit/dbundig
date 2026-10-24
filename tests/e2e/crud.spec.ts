import { expect, test, type Page } from '@playwright/test'
import { installMocks, login } from './mocks'

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

test('reservasi: tambah (stok habis tidak bisa dipilih) → ubah status → hapus', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/daftar-hadiah/reservasi')
  await page.getByRole('button', { name: 'Tambah reservasi' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Undangan').selectOption({ label: 'Andi & Sari — Undangan Utama' })
  const gift = dialog.getByLabel('Hadiah')
  await expect(gift.locator('option', { hasText: 'Blender — habis' })).toBeDisabled()
  await gift.selectOption({ label: 'Rice Cooker — tersedia 3' })
  await dialog.getByLabel('Nama tamu').fill('Tamu Telepon')
  await dialog.getByLabel('WhatsApp').fill('081299990000')
  await dialog.getByLabel('Pesan tamu (opsional)').fill('Pesan lewat telepon')
  await dialog.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('toast')).toContainText('Reservasi ditambahkan')
  await expect(page.getByRole('row', { name: /Tamu Telepon/ })).toContainText('Ditambahkan admin')

  await page.getByRole('button', { name: 'Ubah reservasi Tamu Telepon' }).click()
  await page.getByRole('dialog').getByLabel('Status').selectOption('cancelled')
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('toast')).toContainText('Reservasi diperbarui')
  await expect(page.getByRole('row', { name: /Tamu Telepon/ })).toContainText('Dibatalkan')

  await page.getByRole('button', { name: 'Hapus reservasi Tamu Telepon' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click()
  await expect(page.getByTestId('toast')).toContainText('Reservasi dihapus')
  await expect(page.getByRole('row', { name: /Tamu Telepon/ })).toHaveCount(0)
  expect(state.mutations).toEqual(['reservation.create', 'reservation.update', 'reservation.delete'])
  await noHorizontalOverflow(page)
})

test('order undangan: tambah manual → detail popup → ubah status & isi → hapus', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/order-undangan')
  await page.getByRole('button', { name: 'Tambah order' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Judul / sumber').fill('Order via WhatsApp')
  await form.getByLabel('Isi field Nama pemesan').fill('Rina')
  await form.getByLabel('Isi field WhatsApp').fill('081200000000')
  await form.getByLabel('Isi field Paket').fill('Premium')
  await form.getByRole('button', { name: 'Simpan' }).click()
  // Setelah dibuat, detail terbuka sebagai popup (tidak pindah halaman).
  await expect(page).toHaveURL(/\/order-undangan$/)
  const detail = page.getByTestId('order-detail')
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Order via WhatsApp' })).toBeVisible()
  await expect(detail).toContainText('081200000000')

  await detail.locator('#od-status').selectOption('selesai')
  await expect(page.getByTestId('toast')).toContainText('Selesai')

  // Order input manual: isi bisa diubah penuh.
  await page.getByRole('dialog').getByRole('button', { name: 'Ubah', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Isi field Paket').fill('Gold')
  await page.getByRole('dialog').getByLabel('Catatan admin (opsional)').fill('Sudah dibayar')
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('toast')).toContainText('Order diperbarui')
  await expect(detail).toContainText('Gold')
  await expect(detail).toContainText('Sudah dibayar')

  await page.getByRole('dialog', { name: 'Order via WhatsApp' }).getByRole('button', { name: 'Hapus', exact: true }).click()
  await page.getByRole('dialog', { name: 'Hapus order?' }).getByRole('button', { name: 'Hapus', exact: true }).click()
  await expect(page.getByTestId('toast')).toContainText('Order dihapus')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('cell', { name: /Order via WhatsApp/ })).toHaveCount(0)
  expect(state.mutations).toEqual(['order.create', 'order.update', 'order.update', 'order.delete'])
})

test('order undangan: ringkasan satu baris & popup per bagian, field kosong disembunyikan', async ({ page }) => {
  const entries = [
    { key: 'customer_name', label: 'Nama Pemesan', value: 'Rina' },
    { key: 'groom_full_name', label: 'Pria: Nama Lengkap', value: 'Budi Santoso' },
    { key: 'bride_full_name', label: 'Wanita: Nama Lengkap', value: 'Sari Dewi' },
    { key: 'bride_phone', label: 'Wanita: No. WhatsApp', value: '0857000' },
    { key: 'akad_date', label: 'Akad — Hari/Tanggal', value: '' },
    { key: 'akad_time', label: 'Akad — Waktu', value: '' },
  ]
  await installMocks(page, 'admin', { orders: [{ id: '66666666-6666-4666-8666-666666666666', website_id: 'w', post_title: 'Form Order', post_id: 5, status: 'baru', source: 'widget', admin_note: '', created_at: '2026-10-16T10:00:00.000Z', entries }] })
  await login(page, 'admin')
  await page.goto('/order-undangan')
  const summary = page.locator('.summary-text').first()
  await expect(summary).toBeVisible()
  expect(await summary.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap')
  await page.getByRole('button', { name: 'Detail order Form Order' }).click()
  const detail = page.getByTestId('order-detail')
  await expect(detail.getByRole('region', { name: 'Wanita' })).toContainText('No. WhatsApp')
  await expect(detail.getByRole('region', { name: 'Wanita' })).not.toContainText('Wanita:')
  await expect(detail.getByRole('region', { name: 'Akad' })).toHaveCount(0)
  await detail.getByRole('button', { name: 'Tampilkan 2 field kosong' }).click()
  await expect(detail.getByRole('region', { name: 'Akad' })).toContainText('Hari/Tanggal')
})

test('order undangan: Cerita Cinta satu bagian, tiap cerita bersub-judul (judul, tanggal, isi bersama)', async ({ page }) => {
  // Label asli widget: judul berawalan nama cerita, tanggal & isi tanpa awalan.
  const entries = [
    { key: 'customer_name', label: 'Nama Pemesan', value: 'Rina' },
    { key: 'love_extra_1_title', label: 'Cerita Cinta: Judul Perjalanan', value: 'Hidup Bahagia' },
    { key: 'love_journey_title', label: 'Menuju Pernikahan: Judul Perjalanan', value: 'Menuju Pernikahan' },
    { key: 'love_meeting_title', label: 'Pertama Bertemu: Judul Perjalanan', value: 'Awal Kisah' },
    { key: 'love_meeting_date', label: 'Tanggal Pertama Bertemu', value: '12 Januari 2020' },
    { key: 'love_meeting_story', label: 'Cerita Pertama Bertemu', value: 'Bertemu di kampus' },
    { key: 'love_engagement_title', label: 'Pertunangan: Judul Perjalanan', value: 'Pertunangan' },
    { key: 'bank_name_1', label: 'Nama Bank 1', value: 'BCA' },
  ]
  await installMocks(page, 'admin', { orders: [{ id: '77777777-7777-4777-8777-777777777777', website_id: 'w', post_title: 'Form Order', post_id: 5, status: 'baru', source: 'widget', admin_note: '', created_at: '2026-10-16T10:00:00.000Z', entries }] })
  await login(page, 'admin')
  await page.goto('/order-undangan')
  await page.getByRole('button', { name: 'Detail order Form Order' }).click()
  const detail = page.getByTestId('order-detail')
  const love = detail.getByRole('region', { name: 'Cerita Cinta' })
  await expect(love).toHaveCount(1)
  // Bukan bagian terpisah per cerita, dan tanggal/isi tidak jatuh ke "Lainnya".
  for (const name of ['Pertama Bertemu', 'Pertunangan', 'Menuju Pernikahan']) await expect(detail.getByRole('region', { name, exact: true })).toHaveCount(0)
  await expect(detail.getByRole('region', { name: 'Lainnya' })).toHaveCount(0)
  await expect(love.locator('.group-title')).toHaveText(['Pertama Bertemu', 'Pertunangan', 'Menuju Pernikahan', 'Cerita tambahan 1'])
  await expect(love.locator('.group-rows').first()).toContainText('JudulAwal Kisah')
  await expect(love.locator('.group-rows').first()).toContainText('Tanggal12 Januari 2020')
  await expect(love.locator('.group-rows').first()).toContainText('CeritaBertemu di kampus')
  await expect(love).not.toContainText('Judul Perjalanan')
  // Bagian lain tetap seperti biasa.
  await expect(detail.getByRole('region', { name: 'Rekening 1' })).toContainText('BCA')
})

test('order dari widget: isi hanya-lihat; status & catatan admin tetap bisa diubah', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/order-undangan')
  await page.getByRole('button', { name: /^Detail order/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Pesan Undangan' })
  await expect(dialog.getByTestId('order-readonly')).toContainText('hanya-lihat')
  await expect(dialog.getByRole('button', { name: 'Ubah', exact: true })).toHaveCount(0)
  await dialog.locator('#od-status').selectOption('diproses')
  await expect(page.getByTestId('toast')).toContainText('Diproses')
  await dialog.getByRole('button', { name: 'Ubah catatan' }).click()
  await dialog.getByLabel('Catatan admin').fill('Dikonfirmasi via WhatsApp')
  await dialog.getByRole('button', { name: 'Simpan catatan' }).click()
  await expect(page.getByTestId('toast')).toContainText('Catatan admin disimpan')
  await expect(dialog.getByTestId('order-detail')).toContainText('Dikonfirmasi via WhatsApp')
  expect(state.orders[0]).toMatchObject({ status: 'diproses', admin_note: 'Dikonfirmasi via WhatsApp' })
  // Tetap bisa dihapus (mis. data uji/spam).
  await expect(dialog.getByRole('button', { name: 'Hapus', exact: true })).toBeVisible()
})

test('daftar hadiah: pilih beberapa undangan lalu hapus sekaligus', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/daftar-hadiah')
  await page.getByRole('checkbox', { name: 'Pilih semua undangan di halaman ini' }).check()
  await expect(page.getByText('2 undangan dipilih')).toBeVisible()
  await page.getByRole('button', { name: 'Hapus terpilih' }).click()
  await expect(page.getByRole('dialog')).toContainText('2 undangan dihapus permanen beserta 1 reservasi')
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus permanen' }).click()
  await expect(page.getByTestId('toast')).toContainText('2 undangan dan 1 reservasi dihapus')
  await expect(page.getByText('Belum ada undangan')).toBeVisible()
  expect(state.mutations).toEqual(['invitation.delete:2'])
})

test('website: hapus ditolak bila masih punya data, pesan jelas', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/admin/website')
  await page.getByRole('button', { name: 'Hapus website Undangan Utama' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click()
  await expect(page.getByTestId('toast')).toContainText('Ubah status menjadi Nonaktif')
  expect(state.mutations).toContain('website.delete')
})

test('token: ubah label, cabut, lalu hapus', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/admin/koneksi')
  await page.getByRole('button', { name: 'Buat token' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Buat token' }).click()
  await page.getByRole('button', { name: 'Sudah disalin' }).click()
  await page.getByRole('button', { name: 'Ubah label Produksi' }).click()
  await page.getByRole('dialog').getByLabel('Label').fill('Server utama')
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('toast')).toContainText('Label token diperbarui')
  await expect(page.getByText('Server utama')).toBeVisible()
  await page.getByRole('button', { name: 'Cabut' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cabut token' }).click()
  await page.getByRole('button', { name: 'Hapus token Server utama' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click()
  await expect(page.getByTestId('toast')).toContainText('Token dihapus')
  expect(state.tokens).toHaveLength(0)
})

test('pengguna: ubah (jadikan admin) lalu hapus; akun sendiri tidak bisa dihapus', async ({ page }) => {
  const state = await installMocks(page, 'admin')
  await login(page, 'admin')
  await page.goto('/admin/pengguna')
  await expect(page.getByRole('button', { name: 'Hapus akun admin' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tambah akun' }).click()
  const add = page.getByRole('dialog')
  await add.getByLabel('Username').fill('toko.bunga')
  await add.getByLabel('Nomor WhatsApp aktif').fill('0812-9876-5432')
  await add.getByLabel('Password', { exact: true }).fill('rahasia-toko-1')
  await add.getByLabel('Ulangi password').fill('rahasia-toko-1')
  await add.getByRole('button', { name: 'Berikutnya' }).click()
  await add.getByRole('button', { name: 'Buat akun' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akun toko.bunga dibuat')
  await add.getByRole('button', { name: 'Tutup' }).click()

  await page.getByRole('button', { name: 'Ubah akun toko.bunga' }).click()
  const edit = page.getByRole('dialog')
  await edit.getByLabel('Nama tampilan').fill('Toko Bunga Melati')
  await edit.getByLabel('Peran').selectOption('admin')
  await edit.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akun diperbarui')
  await expect(page.getByRole('cell', { name: 'Toko Bunga Melati' })).toBeVisible()

  await page.getByRole('button', { name: 'Hapus akun toko.bunga' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click()
  await expect(page.getByTestId('toast')).toContainText('Akun dihapus')
  await expect(page.getByRole('cell', { name: 'toko.bunga', exact: true })).toHaveCount(0)
  expect(state.mutations).toEqual(['user.update:admin', 'user.delete'])
})

test('pelanggan: tidak ada tombol tambah/ubah/hapus', async ({ page }) => {
  await installMocks(page, 'customer')
  await login(page, 'customer')
  await page.goto('/daftar-hadiah/reservasi')
  await expect(page.getByRole('cell', { name: 'Rice Cooker' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tambah reservasi' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Ubah reservasi/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Hapus reservasi/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Unduh PDF' })).toBeVisible()
})

test('koneksi: peringatan bila APP_URL lokal diabaikan & bila website diisi alamat MDUNDIG sendiri', async ({ page }) => {
  await installMocks(page, 'admin')
  // Meniru server Vercel yang env-nya masih http://localhost:3000, dan website yang salah diisi alamat aplikasi.
  await page.route('**/api/app/admin/connection', (r) => r.fulfill({ json: {
    daftar_hadiah_url: 'https://mdundig.vercel.app/api/daftar-hadiah', form_order_url: 'https://mdundig.vercel.app/api/form-order', https: true, ignored_app_url: 'http://localhost:3000',
  } }))
  await page.route('**/api/app/admin/websites', (r) => r.request().method() === 'GET'
    ? r.fulfill({ json: { items: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Apeiron.ID', site_url: `${new URL(page.url() || 'http://127.0.0.1:3123').origin}/`, external_site_id: null, bound_at: null, status: 'active', created_at: '2026-10-01T00:00:00Z', active_tokens: 1, last_used_at: null }] } })
    : r.fallback())
  await login(page, 'admin')
  await page.goto('/admin/koneksi')
  await expect(page.getByTestId('app-url-warning')).toContainText('http://localhost:3000')
  await expect(page.getByRole('textbox', { name: 'URL API Daftar Hadiah' })).toHaveValue('https://mdundig.vercel.app/api/daftar-hadiah')
  await expect(page.getByTestId('website-is-app')).toContainText('sama dengan alamat MDUNDIG')
})

test('gambar hadiah yang gagal dimuat diganti ikon (bukan gambar rusak)', async ({ page }) => {
  await installMocks(page, 'admin')
  await page.route('**/api/app/invitations/11111111-1111-4111-8111-111111111111', (r) => r.fulfill({ json: {
    invitation: { id: '11111111-1111-4111-8111-111111111111', title: 'Andi & Sari', website_name: 'Undangan Utama', gift_count: 1, reservation_count: 0, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-16T08:00:00.000Z' },
    registries: [],
    gifts: [{ id: 'g1', registry_id: 'x', gift_key: 'gift-1', name: 'Rice Cooker', description: '', image_url: 'http://tidak-ada.invalid/rice.webp', initial_quantity: 5, capacity: 4, manual_status: 'available', active: true, reserved_quantity: 1, available_quantity: 3 }],
  } }))
  await login(page, 'admin')
  await page.goto('/daftar-hadiah/11111111-1111-4111-8111-111111111111')
  const list = page.getByRole('region', { name: 'Daftar katalog hadiah' })
  await expect(list.getByText('Rice Cooker').first()).toBeVisible()
  await expect(list.locator('img')).toHaveCount(0)
})
