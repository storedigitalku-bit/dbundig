<script setup lang="ts">
import { Gift, Trash2 } from 'lucide-vue-next'

useHead({ title: 'Daftar Hadiah — MDUNDIG' })
interface Row {
  id: string; title: string; website_name: string | null; gift_count: number; reservation_count: number; updated_at: string
  owner_external_id?: string | null; mapped_user_count?: number; access_count?: number; wp_post_id?: number; website_id?: string
}
const auth = useAuth()
const api = useApi()
const toast = useToast()
const route = useRoute()
const q = ref('')
const unmapped = ref(route.query.belum === '1')
const website = ref('')
const websites = ref<Array<{ id: string; name: string }>>([])
const filters = computed(() => ({ q: q.value || undefined, unmapped: unmapped.value ? '1' : undefined, website: website.value || undefined }))
const list = usePagedList<Row>('/api/app/invitations', filters)
onMounted(async () => {
  void list.load()
  if (auth.isAdmin.value) {
    try { websites.value = (await api.request<{ items: Array<{ id: string; name: string }> }>('/api/app/admin/websites')).items } catch { /* filter opsional */ }
  }
})
const isMapped = (r: Row) => (r.mapped_user_count ?? 0) > 0 || (r.access_count ?? 0) > 0

// ---- Pilih & hapus (admin)
const selected = ref<Set<string>>(new Set())
watch(() => list.items.value, () => { selected.value = new Set() })
const allSelected = computed(() => list.items.value.length > 0 && list.items.value.every((r) => selected.value.has(r.id)))
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(list.items.value.map((r) => r.id))
}
function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
const deleteIds = ref<string[]>([])
const deleteRows = computed(() => list.items.value.filter((r) => deleteIds.value.includes(r.id)))
const deleteReservations = computed(() => deleteRows.value.reduce((n, r) => n + r.reservation_count, 0))
const deleteMessage = computed(() => {
  const n = deleteIds.value.length
  const what = n === 1 ? `Undangan "${deleteRows.value[0]?.title || 'Tanpa judul'}"` : `${n} undangan`
  return `${what} dihapus permanen beserta ${deleteReservations.value} reservasi terkonfirmasi, katalog hadiah, dan akses pelanggannya. `
    + 'Jika halaman undangan di WordPress masih aktif, undangan akan tercatat lagi tanpa reservasi lama saat widget dibuka.'
})
const deleting = ref(false)
async function confirmDelete() {
  if (deleting.value || !deleteIds.value.length) return
  deleting.value = true
  try {
    const res = await api.request<{ invitations: number; reservations: number }>('/api/app/admin/invitations/delete', { method: 'POST', body: { ids: deleteIds.value } })
    toast.success(`${res.invitations} undangan dan ${res.reservations} reservasi dihapus.`)
    deleteIds.value = []
    await list.load()
  } catch (err) {
    toast.error(errorMessage(err, 'Undangan gagal dihapus.'))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Daftar Hadiah</h1>
        <p class="text-caption">Undangan tercatat otomatis saat widget Daftar Hadiah pertama kali dibuka.</p>
      </div>
    </div>
    <DaftarHadiahTabs />
    <section class="card" aria-labelledby="inv-title">
      <div class="card-header">
        <div>
          <h2 id="inv-title" class="flex items-center gap-2"><Gift :size="18" /> Daftar undangan</h2>
          <p class="text-caption">{{ auth.isAdmin.value ? 'Undangan yang tercatat dari WordPress' : 'Undangan yang dapat Anda lihat & unduh' }}</p>
        </div>
        <span v-if="list.total.value" class="badge">{{ list.total.value }} undangan</span>
      </div>
      <div class="card-body control-row border-b border-line">
        <SearchInput v-model="q" label="Cari undangan" placeholder="Cari judul undangan" />
        <template v-if="auth.isAdmin.value">
          <div class="w-full sm:w-56">
            <label for="f-web" class="sr-only">Filter website</label>
            <select id="f-web" v-model="website" class="select">
              <option value="">Semua website</option>
              <option v-for="w in websites" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </div>
          <label class="flex items-center gap-2 text-label"><input v-model="unmapped" type="checkbox" class="checkbox"> Tanpa akses pelanggan</label>
        </template>
      </div>
      <div v-if="auth.isAdmin.value && selected.size" class="bulk-bar" role="status">
        <span class="text-label">{{ selected.size }} undangan dipilih</span>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" type="button" @click="selected = new Set()">Batal pilih</button>
          <button class="btn btn-danger btn-sm" type="button" @click="deleteIds = [...selected]"><Trash2 :size="15" /> Hapus terpilih</button>
        </div>
      </div>
      <p v-if="list.error.value" class="alert tone-err m-5" role="alert">{{ list.error.value }}</p>
      <LoadingRows v-if="list.loading.value && !list.items.value.length" />
      <EmptyState v-else-if="!list.items.value.length" :icon="Gift" title="Belum ada undangan"
        :description="auth.isAdmin.value ? 'Undangan muncul setelah widget Daftar Hadiah dibuka pada website yang terhubung.' : 'Belum ada undangan yang diberikan kepada akun Anda. Hubungi admin bila ini keliru.'" />
      <div v-else class="table-wrap" tabindex="0" role="region" aria-label="Tabel undangan">
        <table v-stack class="table table-stack">
          <thead>
            <tr>
              <th v-if="auth.isAdmin.value" scope="col" class="check-col">
                <label class="select-all">
                  <input type="checkbox" class="checkbox" :checked="allSelected" aria-label="Pilih semua undangan di halaman ini" @change="toggleAll">
                  <span class="select-all-text" aria-hidden="true">Pilih semua</span>
                </label>
              </th>
              <th scope="col">Judul undangan</th>
              <th scope="col">Website</th>
              <th scope="col" class="num">Hadiah</th>
              <th scope="col" class="num">Reservasi</th>
              <th v-if="auth.isAdmin.value" scope="col">Akses pelanggan</th>
              <th scope="col">Diperbarui</th>
              <th scope="col"><span class="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in list.items.value" :key="r.id" :class="{ 'is-selected': selected.has(r.id) }">
              <td v-if="auth.isAdmin.value" class="check-col cell-check">
                <input type="checkbox" class="checkbox" :checked="selected.has(r.id)" :aria-label="`Pilih ${r.title || 'undangan'}`" @change="toggle(r.id)">
              </td>
              <td class="cell-primary"><NuxtLink :to="`/daftar-hadiah/${r.id}`" class="cell-strong hover:text-heading">{{ r.title || 'Tanpa judul' }}</NuxtLink></td>
              <td>{{ r.website_name || '—' }}</td>
              <td class="num">{{ formatNumber(r.gift_count) }}</td>
              <td class="num">{{ formatNumber(r.reservation_count) }}</td>
              <td v-if="auth.isAdmin.value">
                <span v-if="isMapped(r)" class="badge badge-dot tone-ok">Ada akses</span>
                <span v-else class="badge badge-dot tone-neutral" data-testid="unmapped-badge">Tanpa akses</span>
              </td>
              <td class="whitespace-nowrap">{{ formatDate(r.updated_at) }}</td>
              <td class="cell-actions">
                <div class="flex gap-1 justify-end">
                  <NuxtLink :to="`/daftar-hadiah/${r.id}`" class="btn btn-secondary btn-sm">Detail</NuxtLink>
                  <button v-if="auth.isAdmin.value" class="btn btn-danger-ghost btn-sm btn-icon" type="button" title="Hapus undangan" :aria-label="`Hapus undangan ${r.title || ''}`" @click="deleteIds = [r.id]"><Trash2 :size="15" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar :page="list.page.value" :per-page="list.perPage" :total="list.total.value" :disabled="list.loading.value" @change="list.setPage" />
    </section>
    <ConfirmDialog :open="deleteIds.length > 0" :title="deleteIds.length > 1 ? `Hapus ${deleteIds.length} undangan?` : 'Hapus undangan?'"
      :message="deleteMessage" :loading="deleting" confirm-label="Hapus permanen" @close="deleteIds = []" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.check-col { width: 44px; }
.table thead th.check-col, .table tbody td.check-col { padding-right: 0; }
.bulk-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; padding: 0.6rem 1.25rem; background: var(--bg-subtle); border-bottom: 1px solid var(--border); }
tr.is-selected td { background: var(--bg-subtle); }
.select-all { display: flex; align-items: center; gap: 0.6rem; }
.select-all-text { display: none; }
/* Tampilan kartu (wadah tabel sempit): kepala tabel disembunyikan, kecuali kotak "Pilih semua" di atas kartu. */
@container table-wrap (max-width: 799.98px) {
  .table-stack thead { position: static; width: auto; height: auto; overflow: visible; clip-path: none; display: block; }
  .table-stack thead tr { display: flex; padding: 0.7rem 1.25rem; border-bottom: 1px solid var(--border); }
  .table-stack thead th { display: none; }
  .table-stack thead th.check-col { display: block; width: auto; height: auto; padding: 0; background: none; border: 0; }
  .select-all-text { display: inline; font-size: var(--fs-label); color: var(--text-body); font-weight: 400; }
}
</style>
