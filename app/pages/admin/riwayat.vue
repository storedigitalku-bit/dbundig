<script setup lang="ts">
import { Bug, History, Trash2 } from 'lucide-vue-next'

definePageMeta({ admin: true })
useHead({ title: 'Riwayat & Error — MDUNDIG' })

interface AuditRow { id: number; action: string; target: string | null; actor: string; created_at: string; detail: Record<string, unknown> }
interface ErrorRow { id: number; source: 'server' | 'client'; status: number | null; path: string | null; message: string; created_at: string; detail: Record<string, unknown> }

// Nama aksi dalam bahasa sehari-hari. Aksi baru yang belum terdaftar tetap tampil dengan kodenya.
const ACTIONS: Record<string, string> = {
  'user.create': 'Membuat akun', 'user.update': 'Mengubah akun', 'user.delete': 'Menghapus akun', 'user.password_reset': 'Mengatur ulang password',
  'user.whatsapp_sent': 'Mengirim akses lewat WhatsApp', 'access.grant': 'Memberi akses undangan', 'access.revoke': 'Mencabut akses undangan',
  'mapping.create': 'Membuat pemetaan otomatis', 'mapping.delete': 'Menghapus pemetaan otomatis',
  'website.create': 'Menambah website', 'website.update': 'Mengubah website', 'website.delete': 'Menghapus website',
  'token.create': 'Membuat Token Website', 'token.update': 'Mengubah Token Website', 'token.revoke': 'Mencabut Token Website', 'token.delete': 'Menghapus Token Website',
  'order.create': 'Menambah order manual', 'order.update': 'Mengubah order', 'order.delete': 'Menghapus order',
  'reservation.create': 'Menambah reservasi', 'reservation.update': 'Mengubah reservasi', 'reservation.delete': 'Menghapus reservasi',
  'invitation.delete': 'Menghapus undangan', 'settings.update': 'Mengubah pengaturan', 'admin.bootstrap': 'Membuat admin pertama',
}
const GROUPS = [
  { value: '', label: 'Semua aktivitas' }, { value: 'user', label: 'Akun' }, { value: 'access', label: 'Akses undangan' },
  { value: 'website', label: 'Website' }, { value: 'token', label: 'Token' }, { value: 'order', label: 'Order' },
  { value: 'reservation', label: 'Reservasi' }, { value: 'settings', label: 'Pengaturan' },
]
const route = useRoute()
const tab = ref<'audit' | 'errors'>(route.query.tab === 'errors' ? 'errors' : 'audit')
const group = ref('')
const source = ref('')
const auditFilters = computed(() => ({ action: group.value || undefined }))
const errorFilters = computed(() => ({ source: source.value || undefined }))
const audit = usePagedList<AuditRow>('/api/app/admin/audit', auditFilters, 30)
const errors = usePagedList<ErrorRow>('/api/app/admin/errors', errorFilters, 30)
const api = useApi()
const toast = useToast()
const clearOpen = ref(false)
const clearing = ref(false)
onMounted(() => { void audit.load(); void errors.load() })

const label = (a: string) => ACTIONS[a] ?? a
async function clearErrors() {
  if (clearing.value) return
  clearing.value = true
  try {
    await api.request('/api/app/admin/errors', { method: 'DELETE' })
    toast.success('Log error dikosongkan.')
    clearOpen.value = false
    await errors.load()
  } catch (err) {
    toast.error(errorMessage(err, 'Log error gagal dikosongkan.'))
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Riwayat &amp; Error</h1><p class="text-caption">Siapa mengubah apa, dan error sistem 30 hari terakhir.</p></div>
    </div>
    <div class="tabs" role="tablist" aria-label="Jenis riwayat">
      <button role="tab" type="button" :aria-selected="tab === 'audit'" :class="{ on: tab === 'audit' }" @click="tab = 'audit'"><History :size="16" /> Aktivitas admin</button>
      <button role="tab" type="button" :aria-selected="tab === 'errors'" :class="{ on: tab === 'errors' }" @click="tab = 'errors'">
        <Bug :size="16" /> Error sistem <span v-if="errors.total.value" class="badge tone-err">{{ errors.total.value }}</span>
      </button>
    </div>

    <section v-if="tab === 'audit'" class="card" aria-labelledby="audit-title">
      <div class="card-header">
        <div><h2 id="audit-title" class="flex items-center gap-2"><History :size="18" /> Aktivitas admin</h2><p class="text-caption">Perubahan akun, akses, website, token, order, dan pengaturan</p></div>
        <span v-if="audit.total.value" class="badge">{{ audit.total.value }} catatan</span>
      </div>
      <div class="card-body border-b border-line">
        <label class="sr-only" for="audit-group">Jenis aktivitas</label>
        <select id="audit-group" v-model="group" class="select filter">
          <option v-for="g in GROUPS" :key="g.value" :value="g.value">{{ g.label }}</option>
        </select>
      </div>
      <p v-if="audit.error.value" class="alert tone-err m-5" role="alert">{{ audit.error.value }}</p>
      <LoadingRows v-if="audit.loading.value && !audit.items.value.length" :rows="4" />
      <EmptyState v-else-if="!audit.items.value.length" :icon="History" title="Belum ada aktivitas" />
      <div v-else class="table-wrap" tabindex="0" role="region" aria-label="Tabel aktivitas admin">
        <table v-stack class="table table-stack">
          <thead><tr><th scope="col">Waktu</th><th scope="col">Pelaku</th><th scope="col">Aktivitas</th><th scope="col">Sasaran</th></tr></thead>
          <tbody>
            <tr v-for="a in audit.items.value" :key="a.id">
              <td class="whitespace-nowrap">{{ formatDateTime(a.created_at) }}</td>
              <td class="cell-primary cell-strong">{{ a.actor }}</td>
              <td>{{ label(a.action) }}</td>
              <td class="text-mono text-caption break-all">{{ a.target || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar :page="audit.page.value" :per-page="audit.perPage" :total="audit.total.value" :disabled="audit.loading.value" @change="audit.setPage" />
    </section>

    <section v-else class="card" aria-labelledby="err-title">
      <div class="card-header">
        <div><h2 id="err-title" class="flex items-center gap-2"><Bug :size="18" /> Error sistem</h2><p class="text-caption">Error server (5xx) &amp; error di browser pengguna — disimpan 30 hari</p></div>
        <button v-if="errors.total.value" class="btn btn-danger-ghost btn-sm" type="button" @click="clearOpen = true"><Trash2 :size="15" /> Kosongkan</button>
      </div>
      <div class="card-body border-b border-line">
        <label class="sr-only" for="err-source">Sumber error</label>
        <select id="err-source" v-model="source" class="select filter">
          <option value="">Semua sumber</option><option value="server">Server</option><option value="client">Browser</option>
        </select>
      </div>
      <p v-if="errors.error.value" class="alert tone-err m-5" role="alert">{{ errors.error.value }}</p>
      <LoadingRows v-if="errors.loading.value && !errors.items.value.length" :rows="3" />
      <EmptyState v-else-if="!errors.items.value.length" :icon="Bug" title="Tidak ada error" description="Error server atau browser yang terjadi akan tercatat di sini." />
      <ul v-else class="err-list">
        <li v-for="e in errors.items.value" :key="e.id">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="badge" :class="e.source === 'server' ? 'tone-err' : ''">{{ e.source === 'server' ? `Server${e.status ? ` ${e.status}` : ''}` : 'Browser' }}</span>
            <span class="text-caption">{{ formatDateTime(e.created_at) }}</span>
            <span v-if="e.path" class="text-caption text-mono break-all">{{ e.path }}</span>
          </div>
          <p class="err-msg">{{ e.message }}</p>
          <details v-if="typeof e.detail?.stack === 'string' && e.detail.stack" class="err-stack"><summary>Rincian teknis</summary><pre>{{ e.detail.stack }}</pre></details>
        </li>
      </ul>
      <PaginationBar :page="errors.page.value" :per-page="errors.perPage" :total="errors.total.value" :disabled="errors.loading.value" @change="errors.setPage" />
    </section>

    <ConfirmDialog :open="clearOpen" title="Kosongkan log error?" message="Semua catatan error dihapus. Error baru tetap akan tercatat." confirm-label="Kosongkan"
      :loading="clearing" @close="clearOpen = false" @confirm="clearErrors" />
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); }
.tabs button { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.6rem 0.9rem; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; font: inherit; font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-muted); cursor: pointer; }
.tabs button.on { color: var(--text-heading); border-bottom-color: var(--brand); }
.filter { max-width: 260px; }
.err-list { list-style: none; margin: 0; padding: 0; }
.err-list li { padding: 0.9rem 1.25rem; border-bottom: 1px solid var(--border); }
.err-msg { margin-top: 0.35rem; color: var(--text-heading); overflow-wrap: anywhere; }
.err-stack summary { cursor: pointer; font-size: var(--fs-caption); color: var(--text-muted); margin-top: 0.35rem; }
.err-stack pre { margin-top: 0.35rem; padding: 0.6rem; background: var(--bg-subtle); border-radius: var(--r-sm); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 640px) { .filter { max-width: none; } .err-list li { padding: 0.9rem 1rem; } }
</style>
