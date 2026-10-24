<script setup lang="ts">
import { UserPlus, Users, X } from 'lucide-vue-next'
import { resolveAppBase } from '../../shared/appUrl'
import { buildRecapMessage } from '../../shared/whatsapp'
import WhatsAppIcon from './WhatsAppIcon.vue'

// Khusus admin: siapa yang dapat melihat satu undangan (akses eksplisit + pemetaan pemilik), versi ringkas untuk kolom samping.
const props = defineProps<{ invitationId: string }>()
const emit = defineEmits<{ changed: []; count: [total: number] }>()
interface Person { username?: string | null; email: string; display_name: string }
interface Access {
  owner_external_id: string | null
  explicit: Array<{ user_id: string; created_at: string; profiles: Person | null }>
  mapped: Array<{ id: string; user_id: string; profiles: Person | null }>
}
const api = useApi()
const toast = useToast()
const data = ref<Access | null>(null)
const users = ref<Array<{ id: string; username: string | null; email: string; display_name: string; role: string; access_count?: number; access_title?: string | null }>>([])
const loading = ref(true)
const selected = ref('')
const busy = ref(false)
const removing = ref('')

// Email internal (akun username saja) tidak ditampilkan.
const visibleEmail = (email?: string) => (email && !email.endsWith('@akun.mdundig.invalid') ? email : '')
const nameOf = (p: Person | null) => p?.display_name || p?.username || visibleEmail(p?.email) || 'Akun'
const subOf = (p: Person | null) => [p?.username, visibleEmail(p?.email)].filter(Boolean).join(' · ')

async function load() {
  loading.value = true
  try {
    const [access, people] = await Promise.all([
      api.request<Access>(`/api/app/admin/invitations/${props.invitationId}/access`),
      fetchAllPages<(typeof users.value)[number]>(api.request, '/api/app/admin/users'),
    ])
    data.value = access
    users.value = people.filter((u) => u.role === 'customer')
    emit('count', access.explicit.length + access.mapped.length)
  } catch (err) {
    toast.error(errorMessage(err, 'Hak akses gagal dimuat.'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

const grantedIds = computed(() => new Set((data.value?.explicit ?? []).map((e) => e.user_id)))
const candidates = computed(() => users.value.filter((u) => !grantedIds.value.has(u.id)))
// Satu akun = satu undangan: akun yang sudah memegang undangan lain tidak bisa dipilih.
const available = computed(() => candidates.value.filter((u) => !u.access_count))
const total = computed(() => (data.value?.explicit.length ?? 0) + (data.value?.mapped.length ?? 0))

// ---- Kirim rekap reservasi ke pelanggan pemegang undangan (WhatsApp).
interface Recap { title: string; website_name: string | null; total: number; latest: Array<{ gift: string; guest: string }>; holder: { username: string | null; name: string; whatsapp: string | null } | null }
const recapOpen = ref(false)
const recapLoading = ref(false)
const recap = ref<Recap | null>(null)
const recapMessage = ref('')
const config = useRuntimeConfig()
const { templates, load: loadTemplates } = useWaTemplates()
async function openRecap() {
  recapOpen.value = true
  recapLoading.value = true
  try {
    const [r] = await Promise.all([api.request<Recap>(`/api/app/admin/invitations/${props.invitationId}/recap`), loadTemplates()])
    recap.value = r
    const base = resolveAppBase(config.public.appUrl, window.location.origin).base
    recapMessage.value = buildRecapMessage({
      name: r.holder?.name ?? '', invitationTitle: r.title, total: r.total, latest: r.latest, sender: r.website_name,
      loginUrl: r.holder?.username ? `${base}/login?u=${encodeURIComponent(r.holder.username)}` : `${base}/login`,
    }, templates.value.recap)
  } catch (err) {
    recapOpen.value = false
    toast.error(errorMessage(err, 'Rekap reservasi gagal dimuat.'))
  } finally {
    recapLoading.value = false
  }
}

async function grant() {
  if (!selected.value || busy.value) return
  busy.value = true
  try {
    await api.request(`/api/app/admin/invitations/${props.invitationId}/access`, { method: 'POST', body: { user_id: selected.value } })
    toast.success('Akses pelanggan ditambahkan.')
    selected.value = ''
    await load()
    emit('changed')
  } catch (err) {
    toast.error(errorMessage(err, 'Akses gagal ditambahkan.'))
  } finally {
    busy.value = false
  }
}
async function revoke(userId: string) {
  if (removing.value) return
  removing.value = userId
  try {
    await api.request(`/api/app/admin/invitations/${props.invitationId}/access/${userId}`, { method: 'DELETE' })
    toast.success('Akses pelanggan dicabut.')
    await load()
    emit('changed')
  } catch (err) {
    toast.error(errorMessage(err, 'Akses gagal dicabut.'))
  } finally {
    removing.value = ''
  }
}
</script>

<template>
  <section class="card panel" aria-labelledby="access-title" data-testid="access-panel">
    <div class="card-header">
      <div>
        <h2 id="access-title" class="flex items-center gap-2"><Users :size="18" /> Akses pelanggan</h2>
        <p class="text-caption">Akun yang dapat melihat &amp; mengunduh</p>
      </div>
      <span v-if="data" class="badge">{{ total }} akun</span>
    </div>
    <LoadingRows v-if="loading" :rows="2" />
    <div v-else-if="data" class="card-body panel-body flex flex-col gap-4">
      <p v-if="!total" class="text-caption">Belum ada pelanggan. Saat ini hanya admin yang dapat melihat undangan ini.</p>
      <ul v-if="data.explicit.length" class="people" aria-label="Pelanggan dengan akses">
        <li v-for="e in data.explicit" :key="e.user_id">
          <FaceAvatar :seed="e.user_id" :name="nameOf(e.profiles)" :size="34" />
          <span class="min-w-0 flex-1">
            <span class="block truncate who">{{ nameOf(e.profiles) }}</span>
            <span v-if="subOf(e.profiles)" class="block truncate text-caption">{{ subOf(e.profiles) }}</span>
          </span>
          <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Cabut akses" :aria-label="`Cabut akses ${nameOf(e.profiles)}`"
            :disabled="removing === e.user_id" @click="revoke(e.user_id)"><X :size="16" /></button>
        </li>
      </ul>
      <div v-if="data.mapped.length" class="flex flex-col gap-2">
        <p class="text-caption">Otomatis dari ID pemilik <span class="text-mono">{{ data.owner_external_id }}</span></p>
        <ul class="people" aria-label="Pelanggan dari pemetaan otomatis">
          <li v-for="m in data.mapped" :key="m.id">
            <FaceAvatar :seed="m.user_id" :name="nameOf(m.profiles)" :size="34" />
            <span class="min-w-0 flex-1">
              <span class="block truncate who">{{ nameOf(m.profiles) }}</span>
              <span v-if="subOf(m.profiles)" class="block truncate text-caption">{{ subOf(m.profiles) }}</span>
            </span>
          </li>
        </ul>
      </div>
      <button v-if="total" class="btn btn-secondary btn-sm self-start" type="button" data-testid="recap-open" @click="openRecap"><WhatsAppIcon :size="15" /> Kirim rekap reservasi</button>
      <p v-if="total" class="text-caption" data-testid="access-full">Satu undangan hanya untuk satu akun pelanggan. Cabut akses di atas untuk menggantinya dengan akun lain.</p>
      <form v-else class="grant" @submit.prevent="grant">
        <p class="text-caption">Satu undangan hanya untuk satu akun, dan satu akun hanya untuk satu undangan. Akun yang sudah punya undangan tidak dapat dipilih.</p>
        <label for="grant-user" class="field-label">Tambah pelanggan</label>
        <select id="grant-user" v-model="selected" class="select" :disabled="!available.length">
          <option value="">{{ available.length ? 'Pilih akun pelanggan' : 'Tidak ada akun pelanggan yang tersedia' }}</option>
          <option v-for="u in candidates" :key="u.id" :value="u.id" :disabled="!!u.access_count">
            {{ [u.username, u.display_name].filter(Boolean).join(' — ') || u.email }}{{ u.access_count ? ` (sudah: ${u.access_title || 'undangan lain'})` : '' }}
          </option>
        </select>
        <AsyncButton type="submit" :loading="busy" :disabled="!selected"><UserPlus :size="16" /> Beri akses</AsyncButton>
      </form>
    </div>
    <ModalDialog :open="recapOpen" :icon="WhatsAppIcon" title="Kirim rekap reservasi" :subtitle="recap ? `${recap.title} · ${recap.total} reservasi${recap.holder ? ` · untuk ${recap.holder.name}` : ''}` : 'Memuat rekap…'" @close="recapOpen = false">
      <LoadingRows v-if="recapLoading" :rows="3" />
      <WhatsAppComposer v-else-if="recap" v-model="recapMessage" :whatsapp="recap.holder?.whatsapp ?? null" />
    </ModalDialog>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; min-height: 0; }
.panel > .card-header { flex-shrink: 0; }
.panel-body { flex: 1; min-height: 0; overflow-y: auto; }
.people { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.people li { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0; border-bottom: 1px solid var(--border); }
.people li:first-child { padding-top: 0; }
.people li:last-child { border-bottom: 0; }
.who { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); }
.grant { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.25rem; }
</style>
