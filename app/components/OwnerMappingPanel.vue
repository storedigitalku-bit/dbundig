<script setup lang="ts">
import { Link2, Trash2 } from 'lucide-vue-next'

// Pemetaan otomatis (lanjutan) untuk satu website: owner_id yang dikirim WordPress → akun pelanggan.
// Pilihan ID hanya dari data yang sudah diterima dari WordPress, tidak diketik bebas.
const props = defineProps<{ websiteId: string }>()
interface Mapping { id: string; external_owner_id: string; created_at: string; profiles: { username: string | null; email: string; display_name: string } | null }
interface OwnerId { owner_id: string; invitations: number; example_title: string }
interface Customer { id: string; username: string | null; email: string; display_name: string; role: string; access_count?: number; access_title?: string | null }

const api = useApi()
const toast = useToast()
const open = ref(false)
const mappings = ref<Mapping[]>([])
const ownerIds = ref<OwnerId[]>([])
const customers = ref<Customer[]>([])
const loading = ref(false)
const form = reactive({ external_owner_id: '', user_id: '' })
const saving = ref(false)
const removing = ref('')
const label = (u: { username?: string | null; display_name?: string; email?: string }) =>
  [u.username, u.display_name].filter(Boolean).join(' — ') || u.email || '—'

async function load() {
  if (!props.websiteId) return
  loading.value = true
  try {
    const [m, o, c] = await Promise.all([
      api.request<{ items: Mapping[] }>('/api/app/admin/owner-mappings', { query: { website: props.websiteId } }),
      api.request<{ items: OwnerId[] }>('/api/app/admin/owner-ids', { query: { website: props.websiteId } }),
      fetchAllPages<Customer>(api.request, '/api/app/admin/users'),
    ])
    mappings.value = m.items
    ownerIds.value = o.items
    customers.value = c.filter((u) => u.role === 'customer')
  } catch (err) {
    toast.error(errorMessage(err, 'Pemetaan gagal dimuat.'))
  } finally {
    loading.value = false
  }
}
// Dimuat saat bagian ini dibuka, dan ulang bila website berganti.
function onToggle(e: Event) { open.value = (e.target as HTMLDetailsElement).open; if (open.value) void load() }
watch(() => props.websiteId, () => { form.external_owner_id = ''; if (open.value) void load() })

async function add() {
  if (saving.value || !form.external_owner_id || !form.user_id) return
  saving.value = true
  try {
    await api.request('/api/app/admin/owner-mappings', { method: 'POST', body: { website_id: props.websiteId, ...form } })
    toast.success('Pemetaan otomatis ditambahkan.')
    form.external_owner_id = ''
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Pemetaan gagal disimpan.'))
  } finally {
    saving.value = false
  }
}
async function remove(id: string) {
  if (removing.value) return
  removing.value = id
  try {
    await api.request(`/api/app/admin/owner-mappings/${id}`, { method: 'DELETE' })
    toast.success('Pemetaan dihapus.')
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Pemetaan gagal dihapus.'))
  } finally {
    removing.value = ''
  }
}
</script>

<template>
  <details class="disclosure" data-testid="owner-mapping" @toggle="onToggle">
    <summary><span class="flex items-center gap-2"><Link2 :size="16" /> Pemetaan otomatis dari WordPress (lanjutan)</span></summary>
    <div class="disclosure-body flex flex-col gap-4">
      <p>Opsional. Bila WordPress mengirim ID pemilik (filter <span class="text-mono">apeiron_daftar_hadiah_owner_id</span>), semua undangan website ini dengan ID itu otomatis terlihat oleh akun yang dipetakan, termasuk undangan baru. Selama filter itu belum dipasang, WordPress mengirim ID kosong — atur akses lewat tombol <strong>Akses</strong> di menu <NuxtLink to="/admin/pengguna" class="text-brand">Pengguna &amp; Akses</NuxtLink>.</p>
      <form class="map-form" @submit.prevent="add">
        <div class="field"><label for="m-owner" class="field-label">ID pemilik dari WordPress</label>
          <select id="m-owner" v-model="form.external_owner_id" class="select text-mono" :disabled="!ownerIds.length">
            <option value="">{{ loading ? 'Memuat…' : ownerIds.length ? 'Pilih ID pemilik' : 'Belum ada ID dari WordPress' }}</option>
            <option v-for="o in ownerIds" :key="o.owner_id" :value="o.owner_id">{{ o.owner_id }} ({{ o.invitations }} undangan)</option>
          </select></div>
        <div class="field"><label for="m-user" class="field-label">Akun pelanggan</label>
          <select id="m-user" v-model="form.user_id" class="select"><option value="">Pilih akun</option><option v-for="u in customers" :key="u.id" :value="u.id" :disabled="!!u.access_count">{{ label(u) }}{{ u.access_count ? ` (sudah: ${u.access_title || 'undangan lain'})` : '' }}</option></select></div>
        <AsyncButton type="submit" :loading="saving" :disabled="!form.external_owner_id || !form.user_id">Petakan</AsyncButton>
      </form>
      <ul v-if="mappings.length" class="mapping-list">
        <li v-for="m in mappings" :key="m.id">
          <span class="min-w-0"><span class="text-mono">{{ m.external_owner_id }}</span> → {{ m.profiles ? label(m.profiles) : '—' }}</span>
          <AsyncButton variant="danger-ghost" size="sm" :loading="removing === m.id" loading-text="Menghapus…" @click="remove(m.id)"><Trash2 :size="15" /> Hapus</AsyncButton>
        </li>
      </ul>
    </div>
  </details>
</template>

<style scoped>
.map-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) auto; gap: 0.75rem; align-items: end; }
.mapping-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--r); }
.mapping-list li { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.5rem 0.9rem; border-bottom: 1px solid var(--border); }
.mapping-list li:last-child { border-bottom: 0; }
@media (max-width: 640px) { .map-form { grid-template-columns: 1fr; } }
</style>
