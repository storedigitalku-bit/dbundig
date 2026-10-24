<script setup lang="ts">
import { ClipboardList, Plus, Trash2 } from 'lucide-vue-next'

definePageMeta({ admin: true })
useHead({ title: 'Order Undangan — MDUNDIG' })

interface Row {
  id: string; website_name: string; post_title: string; post_id: number | null; status: string; source: string; created_at: string
  summary: string; field_count: number; filled_count: number
}
const api = useApi()
const toast = useToast()
const q = ref('')
const website = ref('')
const status = ref('')
const websites = ref<Array<{ id: string; name: string }>>([])
const filters = computed(() => ({ q: q.value || undefined, website: website.value || undefined, status: status.value || undefined }))
const list = usePagedList<Row>('/api/app/admin/form-orders', filters)
onMounted(async () => {
  void list.load()
  try { websites.value = (await api.request<{ items: Array<{ id: string; name: string }> }>('/api/app/admin/websites')).items } catch { /* filter opsional */ }
})
const createOpen = ref(false)
const route = useRoute()
// /order-undangan?order=<id> (mis. dari Ringkasan) langsung membuka popup detail.
const detailId = ref<string | null>(typeof route.query.order === 'string' && /^[0-9a-f-]{36}$/i.test(route.query.order) ? route.query.order : null)
async function created(id: string) { await list.load(); detailId.value = id }
async function detailDeleted() { detailId.value = null; await list.load() }

const deleting = ref<Row | null>(null)
const deleteBusy = ref(false)
async function confirmDelete() {
  if (!deleting.value || deleteBusy.value) return
  deleteBusy.value = true
  try {
    await api.request(`/api/app/admin/form-orders/${deleting.value.id}`, { method: 'DELETE' })
    toast.success('Order dihapus.')
    deleting.value = null
    await list.load()
  } catch (err) {
    toast.error(errorMessage(err, 'Order gagal dihapus.'))
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Order Undangan</h1><p class="text-caption">Pesanan undangan dari widget Form Order dan input manual. Hanya admin platform yang dapat melihat data ini.</p></div>
      <div class="control-row">
        <ExportMenu pdf-url="/api/app/admin/form-orders/export-pdf" csv-url="/api/app/admin/form-orders/export" :query="filters" name="laporan-order-undangan" />
        <button class="btn btn-primary" type="button" @click="createOpen = true"><Plus :size="16" /> Tambah order</button>
      </div>
    </div>
    <section class="card" aria-labelledby="orders-title">
      <div class="card-header">
        <div>
          <h2 id="orders-title" class="flex items-center gap-2"><ClipboardList :size="18" /> Daftar order</h2>
          <p class="text-caption">Pesanan dari widget Form Order dan input manual</p>
        </div>
        <span v-if="list.total.value" class="badge">{{ list.total.value }} order</span>
      </div>
      <div class="card-body control-row border-b border-line">
        <SearchInput v-model="q" label="Cari pesanan" placeholder="Cari isi pesanan atau judul" />
        <div class="w-full sm:w-44">
          <label for="fo-status" class="sr-only">Filter status</label>
          <select id="fo-status" v-model="status" class="select"><option value="">Semua status</option><option v-for="s in ORDER_STATUSES" :key="s" :value="s">{{ ORDER_STATUS_LABEL[s] }}</option></select>
        </div>
        <div class="w-full sm:w-56">
          <label for="fo-web" class="sr-only">Filter website</label>
          <select id="fo-web" v-model="website" class="select"><option value="">Semua website</option><option v-for="w in websites" :key="w.id" :value="w.id">{{ w.name }}</option></select>
        </div>
      </div>
      <p v-if="list.error.value" class="alert tone-err m-5" role="alert">{{ list.error.value }}</p>
      <LoadingRows v-if="list.loading.value && !list.items.value.length" />
      <EmptyState v-else-if="!list.items.value.length" :icon="ClipboardList" title="Belum ada order" description="Order tersimpan dari widget Form Order (penyimpanan API) atau ditambahkan manual." />
      <div v-else class="table-wrap" tabindex="0" role="region" aria-label="Tabel Order Undangan">
        <table v-stack class="table table-stack">
          <thead><tr><th scope="col">Waktu</th><th scope="col">Ringkasan</th><th scope="col">Judul / sumber</th><th scope="col">Website</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            <tr v-for="o in list.items.value" :key="o.id">
              <td class="whitespace-nowrap">{{ formatDateTime(o.created_at) }}</td>
              <td class="summary cell-primary"><span class="summary-text" :title="o.summary">{{ o.summary || 'Belum ada isian' }}</span></td>
              <td>{{ o.post_title || (o.post_id ? `Post #${o.post_id}` : '—') }}<span v-if="o.source === 'admin'" class="block text-caption">Input manual</span></td>
              <td>{{ o.website_name }}</td>
              <td><span class="badge badge-dot" :class="orderStatusTone(o.status)">{{ ORDER_STATUS_LABEL[o.status] ?? o.status }}</span></td>
              <td class="cell-actions">
                <div class="flex gap-1 justify-end">
                  <button class="btn btn-secondary btn-sm" type="button" :aria-label="`Detail order ${o.post_title}`" @click="detailId = o.id">Detail</button>
                  <button class="btn btn-danger-ghost btn-sm btn-icon" type="button" title="Hapus order" :aria-label="`Hapus order ${o.post_title}`" @click="deleting = o"><Trash2 :size="15" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar :page="list.page.value" :per-page="list.perPage" :total="list.total.value" :disabled="list.loading.value" @change="list.setPage" />
    </section>

    <OrderFormModal :open="createOpen" :order="null" @close="createOpen = false" @saved="created" />
    <OrderDetailModal :order-id="detailId" @close="detailId = null" @changed="list.load" @deleted="detailDeleted" />
    <ConfirmDialog :open="!!deleting" title="Hapus order?" message="Order dihapus permanen beserta seluruh isinya."
      :loading="deleteBusy" @close="deleting = null" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
.summary { max-width: 0; width: 40%; }
.summary-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Ponsel (tampilan kartu): ringkasan jadi judul kartu, tetap satu baris. */
@media (max-width: 639.98px) { .summary { max-width: none; width: auto; } }
</style>
