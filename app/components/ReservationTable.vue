<script setup lang="ts">
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import type { ReservationEdit } from './ReservationFormModal.vue'
import { formatWhatsapp } from '../../shared/whatsapp'

interface Row {
  id: string; invitation_id: string; invitation_title: string; gift_id: string; gift_name: string
  guest_name: string; guest_whatsapp: string; message: string; quantity: number; status: string; created_at: string
  source?: string; admin_note?: string
}

const props = withDefaults(defineProps<{ invitationId?: string; gifts?: Array<{ id: string; name: string }>; showInvitation?: boolean }>(), {
  invitationId: '', gifts: () => [], showInvitation: true,
})
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()
const auth = useAuth()
const q = ref('')
const gift = ref('')
const status = ref('')
const filters = computed(() => ({ invitation: props.invitationId || undefined, q: q.value || undefined, gift: gift.value || undefined, status: status.value || undefined }))
// 7 reservasi per halaman; selebihnya lewat tombol halaman berikutnya.
const list = usePagedList<Row>('/api/app/reservations', filters, 7)
onMounted(list.load)

// ---- CRUD admin
const formOpen = ref(false)
const editing = ref<ReservationEdit | null>(null)
function openCreate() { editing.value = null; formOpen.value = true }
function openEdit(r: Row) {
  editing.value = { id: r.id, invitation_id: r.invitation_id, gift_id: r.gift_id, gift_name: r.gift_name, guest_name: r.guest_name,
    guest_whatsapp: r.guest_whatsapp, message: r.message, status: r.status, admin_note: r.admin_note ?? '' }
  formOpen.value = true
}
async function afterSave() { await list.load(); emit('changed') }

const deleting = ref<Row | null>(null)
const deleteBusy = ref(false)
async function confirmDelete() {
  if (!deleting.value || deleteBusy.value) return
  deleteBusy.value = true
  try {
    await api.request(`/api/app/admin/reservations/${deleting.value.id}`, { method: 'DELETE' })
    toast.success('Reservasi dihapus. Stok hadiah kembali.')
    deleting.value = null
    await afterSave()
  } catch (err) {
    toast.error(errorMessage(err, 'Reservasi gagal dihapus.'))
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <section class="card" aria-labelledby="res-title">
    <div class="card-header">
      <div>
        <h2 id="res-title" class="flex items-center gap-2"><ListChecks :size="18" /> Reservasi</h2>
        <p class="text-caption">Hadiah yang dipilih tamu dari widget Daftar Hadiah</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span v-if="list.total.value" class="badge hidden sm:inline-flex">{{ list.total.value }} reservasi</span>
        <ExportMenu pdf-url="/api/app/reservations/export-pdf" csv-url="/api/app/reservations/export" :query="filters" name="laporan-reservasi" :primary="!auth.isAdmin.value" />
        <button v-if="auth.isAdmin.value" class="btn btn-primary" type="button" @click="openCreate"><Plus :size="16" /> Tambah reservasi</button>
      </div>
    </div>
    <div class="card-body filters">
      <SearchInput v-model="q" label="Cari reservasi" placeholder="Cari tamu, hadiah, atau undangan" />
      <div v-if="gifts.length" class="filter-select">
        <label for="filter-gift" class="sr-only">Filter hadiah</label>
        <select id="filter-gift" v-model="gift" class="select">
          <option value="">Semua hadiah</option>
          <option v-for="g in gifts" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </div>
      <div class="filter-select">
        <label for="filter-status" class="sr-only">Filter status</label>
        <select id="filter-status" v-model="status" class="select">
          <option value="">Semua status</option>
          <option value="confirmed">Terkonfirmasi</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
      </div>
    </div>
    <p v-if="list.error.value" class="alert tone-err mx-5 mb-4" role="alert">{{ list.error.value }}</p>
    <LoadingRows v-if="list.loading.value && !list.items.value.length" />
    <EmptyState v-else-if="!list.items.value.length" title="Belum ada reservasi" description="Reservasi tamu akan muncul di sini setelah dikirim dari undangan." />
    <div v-else class="table-wrap" tabindex="0" role="region" aria-label="Tabel reservasi (geser untuk melihat semua kolom)" :aria-busy="list.loading.value">
      <table v-stack class="table table-stack">
        <thead>
          <tr>
            <th v-if="showInvitation" scope="col">Undangan</th>
            <th scope="col">Hadiah</th>
            <th scope="col">Tamu</th>
            <th scope="col">WhatsApp</th>
            <th scope="col" class="num">Jumlah</th>
            <th scope="col">Pesan</th>
            <th scope="col">Waktu</th>
            <th scope="col">Status</th>
            <th v-if="auth.isAdmin.value" scope="col"><span class="sr-only">Aksi</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in list.items.value" :key="r.id">
            <td v-if="showInvitation"><NuxtLink :to="`/daftar-hadiah/${r.invitation_id}`" class="cell-strong link">{{ r.invitation_title || 'Tanpa judul' }}</NuxtLink></td>
            <td class="cell-strong cell-primary">{{ r.gift_name }}</td>
            <td>
              {{ r.guest_name }}
              <span v-if="auth.isAdmin.value && r.source === 'admin'" class="block text-caption">Ditambahkan admin</span>
              <span v-if="auth.isAdmin.value && r.admin_note" class="block text-caption note">Catatan: {{ r.admin_note }}</span>
            </td>
            <td class="text-mono whitespace-nowrap">{{ formatWhatsapp(r.guest_whatsapp) || '—' }}</td>
            <td class="num">{{ r.quantity }}</td>
            <td class="msg">{{ r.message || '—' }}</td>
            <td class="whitespace-nowrap">{{ formatDateTime(r.created_at) }}</td>
            <td><span class="badge badge-dot" :class="r.status === 'confirmed' ? 'tone-ok' : 'tone-neutral'">{{ r.status === 'confirmed' ? 'Terkonfirmasi' : 'Dibatalkan' }}</span></td>
            <td v-if="auth.isAdmin.value" class="cell-actions">
              <div class="flex gap-1 justify-end">
                <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Ubah reservasi" :aria-label="`Ubah reservasi ${r.guest_name}`" @click="openEdit(r)"><Pencil :size="15" /></button>
                <button class="btn btn-danger-ghost btn-sm btn-icon" type="button" title="Hapus reservasi" :aria-label="`Hapus reservasi ${r.guest_name}`" @click="deleting = r"><Trash2 :size="15" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar :page="list.page.value" :per-page="list.perPage" :total="list.total.value" :disabled="list.loading.value" @change="list.setPage" />

    <ReservationFormModal v-if="auth.isAdmin.value" :open="formOpen" :reservation="editing" :invitation-id="invitationId" @close="formOpen = false" @saved="afterSave" />
    <ConfirmDialog :open="!!deleting" title="Hapus reservasi?"
      :message="deleting ? `Reservasi ${deleting.guest_name} untuk ${deleting.gift_name} dihapus permanen dan stok hadiah kembali.` : ''"
      :loading="deleteBusy" @close="deleting = null" @confirm="confirmDelete" />
  </section>
</template>

<style scoped>
.filters { display: flex; gap: 0.75rem; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.filter-select { flex: 0 1 200px; min-width: 160px; }
.msg { max-width: 280px; white-space: pre-line; overflow-wrap: anywhere; }
.note { max-width: 220px; overflow-wrap: anywhere; }
.link:hover { color: var(--brand); }
@media (max-width: 640px) { .filter-select { flex: 1 1 100%; } }
</style>
