<script setup lang="ts">
import { ArrowLeft, Gift, ListChecks, Package, Trash2, Users } from 'lucide-vue-next'

interface Detail {
  invitation: { id: string; title: string; website_name: string | null; gift_count: number; reservation_count: number; created_at: string; updated_at: string
    wp_post_id?: number; owner_external_id?: string | null; mapped_user_count?: number; access_count?: number; website_id?: string }
  registries: Array<{ id: string; registry_key: string; document_id: number; element_id: string; catalog_version: number; updated_at: string }>
  gifts: Array<{ id: string; registry_id: string; gift_key: string; name: string; description: string; image_url: string; initial_quantity: number; capacity: number
    manual_status: string; active: boolean; reserved_quantity: number; available_quantity: number }>
}
const route = useRoute()
const id = computed(() => String(route.params.id))
const api = useApi()
const auth = useAuth()
const data = ref<Detail | null>(null)
const loading = ref(true)
const error = ref('')
async function load() {
  // Muat ulang diam-diam setelah perubahan (tanpa mengosongkan halaman).
  if (!data.value) loading.value = true
  error.value = ''
  try { data.value = await api.request<Detail>(`/api/app/invitations/${id.value}`) } catch (err) { error.value = errorMessage(err, 'Undangan tidak ditemukan atau Anda tidak memiliki akses.') } finally { loading.value = false }
}
onMounted(load)
useHead({ title: () => `${data.value?.invitation.title || 'Undangan'} — MDUNDIG` })
const activeGifts = computed(() => (data.value?.gifts ?? []).filter((g) => g.active))
const inactiveGifts = computed(() => (data.value?.gifts ?? []).filter((g) => !g.active))
// Ponsel: katalog ringkas 4 teratas tanpa gulir otomatis; tombol "Tampilkan semua" membuka sisanya.
const phone = useIsPhone()
const showAllGifts = ref(false)
const shownGifts = computed(() => (phone.value && !showAllGifts.value ? activeGifts.value.slice(0, PHONE_LIST_LIMIT) : activeGifts.value))
const toast = useToast()
const deleteOpen = ref(false)
const deleting = ref(false)
async function deleteInvitation() {
  if (deleting.value) return
  deleting.value = true
  try {
    await api.request(`/api/app/admin/invitations/${id.value}`, { method: 'DELETE' })
    toast.success('Undangan dihapus.')
    await navigateTo('/daftar-hadiah')
  } catch (err) {
    deleteOpen.value = false
    toast.error(errorMessage(err, 'Undangan gagal dihapus.'))
  } finally {
    deleting.value = false
  }
}
// Ringkasan stok katalog aktif.
const stock = computed(() => activeGifts.value.reduce((t, g) => ({
  initial: t.initial + g.initial_quantity, reserved: t.reserved + g.reserved_quantity, available: t.available + g.available_quantity,
}), { initial: 0, reserved: 0, available: 0 }))
// Jumlah akun yang dapat melihat: dari panel akses (selalu terbaru), atau dari data undangan sebelum panel termuat.
const accessLive = ref<number | null>(null)
const accessTotal = computed(() => accessLive.value ?? (data.value?.invitation.access_count ?? 0) + (data.value?.invitation.mapped_user_count ?? 0))
const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0)
// Warna kategori yang sama dengan Ringkasan.
const C = { blue: '#2563eb', peach: '#b85c22', lilac: '#6a53b8', rose: '#d4547e' }
// Desktop: kartu katalog setinggi isi panel akses (tanpa celah di bawah panel akses).
const accessEl = ref<{ $el: HTMLElement } | null>(null)
const accessH = ref(0)
let accessRo: ResizeObserver | undefined
watch(accessEl, (cmp) => {
  accessRo?.disconnect()
  if (!cmp?.$el) return
  accessRo = new ResizeObserver(([e]) => { accessH.value = Math.round(e!.target.getBoundingClientRect().height) })
  accessRo.observe(cmp.$el)
}, { flush: 'post' })
onBeforeUnmount(() => accessRo?.disconnect())
// Gambar hadiah diambil langsung dari WordPress. Bila gagal dimuat (mis. http:// di dashboard HTTPS, atau situs
// lokal seperti http://aperion.local yang hanya ada di komputer sendiri) tampilkan ikon, bukan gambar rusak.
const failedImg = reactive(new Set<string>())
// Gambar http:// sudah dilewatkan proksi server; catatan hanya muncul bila ada gambar yang tetap gagal dimuat.
const insecureImages = computed(() => activeGifts.value.some((g) => g.image_url && failedImg.has(g.id)))
const giftOptions = computed(() => (data.value?.gifts ?? []).map((g) => ({ id: g.id, name: g.active ? g.name : `${g.name} (dihapus)` })))
</script>

<template>
  <div class="page">
    <NuxtLink to="/daftar-hadiah" class="btn btn-ghost btn-sm self-start"><ArrowLeft :size="16" /> Daftar Hadiah</NuxtLink>
    <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
    <LoadingRows v-if="loading" :rows="4" class="card" />
    <template v-else-if="data">
      <div class="page-head">
        <div class="min-w-0">
          <h1 class="break-words">{{ data.invitation.title || 'Tanpa judul' }}</h1>
          <p class="text-caption">{{ data.invitation.website_name || '—' }} · Diperbarui {{ formatDateTime(data.invitation.updated_at) }}</p>
        </div>
        <button v-if="auth.isAdmin.value" class="btn btn-danger-ghost btn-sm shrink-0" type="button" @click="deleteOpen = true"><Trash2 :size="15" /> Hapus undangan</button>
      </div>

      <div class="kpis" :class="auth.isAdmin.value ? 'kpis-4' : 'kpis-3'">
        <KpiCard label="Hadiah aktif" :icon="Gift" :color="C.peach" :value="data.invitation.gift_count"
          :caption="inactiveGifts.length ? `${inactiveGifts.length} dihapus dari katalog` : 'Dari widget WordPress'" />
        <KpiCard label="Reservasi terkonfirmasi" :icon="ListChecks" :color="C.lilac" :value="data.invitation.reservation_count"
          :caption="`${formatNumber(stock.reserved)} hadiah dipesan`" />
        <KpiCard label="Stok tersedia" :icon="Package" :color="C.blue" :value="stock.available" :caption="`dari ${formatNumber(stock.initial)} jumlah awal`" />
        <KpiCard v-if="auth.isAdmin.value" label="Akses pelanggan" :icon="Users" :color="C.rose" :value="accessTotal"
          :caption="accessTotal ? 'akun dapat melihat & mengunduh' : 'hanya admin yang melihat'" />
      </div>

      <div class="main-grid" :class="{ 'with-side': auth.isAdmin.value }" :style="accessH ? { '--side-h': `${accessH}px` } : undefined">
        <section class="card catalog" aria-labelledby="gift-title">
          <div class="card-header">
            <div>
              <h2 id="gift-title" class="flex items-center gap-2"><Gift :size="18" /> Katalog hadiah</h2>
              <p class="text-caption">Nama &amp; jumlah dikelola di widget WordPress</p>
            </div>
            <span v-if="activeGifts.length" class="badge">{{ activeGifts.length }} hadiah</span>
          </div>
          <EmptyState v-if="!activeGifts.length" :icon="Gift" title="Katalog kosong" description="Hadiah ditambahkan dari widget Daftar Hadiah di Elementor." class="fill" />
          <template v-else>
            <div class="gift-grid gift-head" aria-hidden="true"><span>Hadiah</span><span>Ketersediaan</span><span class="num">Dipesan</span><span class="num">Kapasitas</span><span>Status</span></div>
            <div class="gift-body">
              <!-- Bergulir sendiri halus & menyambung bila hadiah lebih banyak dari tinggi kartu. -->
              <AutoScrollList auto label="Daftar katalog hadiah">
                <ul class="gift-list">
                  <li v-for="g in shownGifts" :key="g.id" class="gift-grid gift-row">
                    <div class="g-name">
                      <span class="thumb">
                        <img v-if="g.image_url && !failedImg.has(g.id)" :src="g.image_url" :alt="`Foto ${g.name}`" width="44" height="44" loading="lazy" referrerpolicy="no-referrer" @error="failedImg.add(g.id)">
                        <Gift v-else :size="18" aria-hidden="true" />
                      </span>
                      <div class="min-w-0"><span class="g-title block truncate">{{ g.name }}</span><span v-if="g.description" class="block text-caption line-clamp-1">{{ g.description }}</span></div>
                    </div>
                    <div class="g-stock">
                      <span class="stock-text"><strong>{{ g.available_quantity }}</strong> dari {{ g.initial_quantity }} tersedia</span>
                      <span class="stock-bar" role="img" :aria-label="`${g.available_quantity} dari ${g.initial_quantity} tersedia`"><span :style="{ width: `${pct(g.available_quantity, g.initial_quantity)}%` }" /></span>
                    </div>
                    <div class="g-num g-res"><span class="m-label">Dipesan</span>{{ g.reserved_quantity }}</div>
                    <div class="g-num g-cap"><span class="m-label">Kapasitas</span>{{ g.capacity }}</div>
                    <div class="g-status">
                      <span v-if="g.manual_status !== 'available'" class="badge tone-neutral">Dinonaktifkan</span>
                      <span v-else-if="g.available_quantity > 0" class="badge badge-dot tone-ok">Tersedia</span>
                      <span v-else class="badge badge-dot tone-neutral">Habis</span>
                    </div>
                  </li>
                </ul>
              </AutoScrollList>
              <button v-if="phone && activeGifts.length > PHONE_LIST_LIMIT" class="btn btn-ghost btn-sm show-all" type="button" data-testid="catalog-toggle" @click="showAllGifts = !showAllGifts">
                {{ showAllGifts ? 'Tampilkan lebih sedikit' : `Tampilkan semua ${activeGifts.length} hadiah` }}
              </button>
            </div>
            <p v-if="insecureImages" class="catalog-note text-caption" data-testid="insecure-images">Sebagian gambar tidak dapat dimuat dari website WordPress (alamat lokal/tidak publik atau gambar sudah dihapus). Gambar akan tampil setelah website dapat diakses publik.</p>
            <p v-if="inactiveGifts.length" class="catalog-note text-caption">{{ inactiveGifts.length }} hadiah telah dihapus dari katalog. Riwayat reservasinya tetap tersimpan.</p>
          </template>
        </section>

        <AccessPanel v-if="auth.isAdmin.value" ref="accessEl" class="side-panel" :invitation-id="data.invitation.id" @changed="load" @count="accessLive = $event" />
      </div>

      <ReservationTable :invitation-id="data.invitation.id" :gifts="giftOptions" :show-invitation="false" @changed="load" />

      <details class="disclosure">
        <summary>Detail teknis</summary>
        <div class="disclosure-body">
          <dl class="tech">
            <template v-if="auth.isAdmin.value">
              <dt>ID post WordPress</dt><dd class="text-mono">{{ data.invitation.wp_post_id }}</dd>
              <dt>ID pemilik eksternal</dt><dd class="text-mono">{{ data.invitation.owner_external_id ?? 'null (belum dipetakan oleh WordPress)' }}</dd>
            </template>
            <template v-for="r in data.registries" :key="r.id">
              <dt>Registry</dt><dd class="text-mono">{{ r.registry_key }} · revisi {{ r.catalog_version }}</dd>
            </template>
          </dl>
        </div>
      </details>
    </template>
    <ConfirmDialog :open="deleteOpen" title="Hapus undangan?" :loading="deleting" confirm-label="Hapus undangan"
      :message="`Undangan dihapus permanen beserta ${data?.invitation.reservation_count ?? 0} reservasi terkonfirmasi, katalog hadiah, dan akses pelanggannya. Jika halaman undangan di WordPress masih aktif, undangan akan tercatat lagi tanpa reservasi lama saat widget dibuka.`"
      @close="deleteOpen = false" @confirm="deleteInvitation" />
  </div>
</template>

<style scoped>
.kpis { display: grid; gap: 0.75rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 640px) { .kpis { gap: 1rem; } }
@media (min-width: 1280px) { .kpis-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); } .kpis-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1279.98px) { .kpis-3 > :last-child { grid-column: 1 / -1; } }
.main-grid { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
@media (min-width: 1024px) { .main-grid.with-side { grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); align-items: start; } }
/* Katalog & panel akses setinggi sama (desktop); isi katalog bergulir di dalam kartu. */
.catalog { display: flex; flex-direction: column; min-width: 0; height: 360px; }
/* Panel akses setinggi isinya (maks. 480px, lalu digulir); katalog mengikuti tingginya. */
@media (min-width: 1024px) {
  /* Setinggi isinya (tanpa ruang kosong di bawah); minimal 240px agar katalog di sebelahnya tetap terbaca. */
  .main-grid.with-side > .side-panel { height: auto; min-height: 240px; max-height: 480px; }
  .main-grid.with-side > .catalog { height: var(--side-h, 360px); min-height: 240px; }
}
@media (max-width: 1023.98px) { .catalog { height: auto; max-height: 520px; } }
/* Ponsel: katalog setinggi isinya (4 teratas + tombol tampilkan semua), tanpa gulir di dalam kartu. */
@media (max-width: 767.98px) { .catalog { max-height: none; } }
.show-all { align-self: center; margin-top: 0.5rem; }
.fill { flex: 1; justify-content: center; }
/* Kepala & catatan kartu tidak ikut menyusut; hanya daftar yang dibatasi tinggi. */
.catalog > .card-header, .gift-head, .catalog-note { flex-shrink: 0; }
.g-title { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); }
.gift-grid { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(130px, 1.3fr) 64px 72px 104px; gap: 1rem; align-items: center; }
.gift-head { padding: 0 1.25rem; height: 40px; background: var(--bg-subtle); border-bottom: 1px solid var(--border); font-size: var(--fs-caption); font-weight: var(--fw-medium); color: var(--text-muted); }
.gift-head .num, .g-num { text-align: right; }
/* Area gulir berjarak dari kepala kolom & tepi bawah kartu (seperti panel Ringkasan). */
.gift-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0.4rem 1.25rem 1rem; }
.gift-list { list-style: none; margin: 0; padding: 0; }
.gift-row { padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
.gift-row:last-child { border-bottom: 0; }
/* Pita tanpa ujung: garis pemisah tetap ada di sambungan antar-salinan. */
.looping .gift-row:last-child { border-bottom: 1px solid var(--border); }
.g-name { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
.g-num { font-size: var(--fs-body); color: var(--text-body); }
.m-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.catalog-note { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border); }
@media (max-width: 639.98px) {
  .gift-head { display: none; }
  .gift-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; grid-template-areas: 'name name name' 'stock stock stock' 'res cap status'; gap: 0.6rem 1rem; }
  .g-name { grid-area: name; } .g-stock { grid-area: stock; } .g-res { grid-area: res; text-align: left; } .g-cap { grid-area: cap; text-align: left; } .g-status { grid-area: status; }
  .m-label { position: static; width: auto; height: auto; clip-path: none; margin-right: 0.35rem; font-size: var(--fs-caption); color: var(--text-muted); }
}
.thumb { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: var(--r-sm); background: var(--n-100); color: var(--n-500); overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.stock-text { display: block; font-size: var(--fs-caption); color: var(--text-muted); white-space: nowrap; }
.stock-text strong { font-weight: var(--fw-medium); color: var(--text-heading); font-size: var(--fs-label); }
.stock-bar { display: block; height: 6px; margin-top: 0.35rem; border-radius: 999px; background: var(--n-100); overflow: hidden; }
.stock-bar span { display: block; height: 100%; border-radius: 999px; background: var(--brand); }
.tech { display: grid; grid-template-columns: minmax(140px, max-content) 1fr; gap: 0.5rem 1rem; margin: 0; }
.tech dt { color: var(--text-muted); }
.tech dd { margin: 0; min-width: 0; }
@media (max-width: 640px) { .tech { grid-template-columns: 1fr; } .tech dd { margin-bottom: 0.5rem; } }
</style>
