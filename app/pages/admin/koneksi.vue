<script setup lang="ts">
import { hostOf } from '../../../shared/appUrl'
import { Activity, Ban, KeyRound, Link2, Pencil, Plus, RotateCw, Trash2, TriangleAlert } from 'lucide-vue-next'

definePageMeta({ admin: true })
useHead({ title: 'Koneksi — MDUNDIG' })

interface Website { id: string; name: string; site_url: string; external_site_id: string | null; bound_at: string | null; status: string }
interface Token { id: string; label: string; token_hint: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }
const api = useApi()
const toast = useToast()
const route = useRoute()
const websites = ref<Website[]>([])
const websiteId = ref(typeof route.query.website === 'string' ? route.query.website : '')
const urls = ref<{ daftar_hadiah_url: string; form_order_url: string; https: boolean; ignored_app_url?: string | null } | null>(null)
// Website yang alamatnya sama dengan alamat MDUNDIG sendiri tidak akan pernah terhubung (bukan alamat WordPress).
const appHost = import.meta.client ? window.location.host.toLowerCase() : ''
const pointsToApp = computed(() => !!website.value && hostOf(website.value.site_url) === appHost)
const tokens = ref<Token[]>([])
const loading = ref(true)
const tokensLoading = ref(false)
const website = computed(() => websites.value.find((w) => w.id === websiteId.value) ?? null)

async function loadTokens() {
  if (!websiteId.value) { tokens.value = []; return }
  tokensLoading.value = true
  try { tokens.value = (await api.request<{ items: Token[] }>(`/api/app/admin/websites/${websiteId.value}/tokens`)).items } catch (err) { toast.error(errorMessage(err, 'Token gagal dimuat.')) } finally { tokensLoading.value = false }
}
onMounted(async () => {
  try {
    const [w, c] = await Promise.all([
      api.request<{ items: Website[] }>('/api/app/admin/websites'),
      api.request<typeof urls.value>('/api/app/admin/connection'),
    ])
    websites.value = w.items
    urls.value = c
    if (!websiteId.value && w.items[0]) websiteId.value = w.items[0].id
  } catch (err) {
    toast.error(errorMessage(err))
  } finally {
    loading.value = false
  }
  await loadTokens()
})
watch(websiteId, (id) => { void navigateTo({ query: id ? { website: id } : {} }, { replace: true }); void loadTokens() })

const activeTokens = computed(() => tokens.value.filter((t) => !t.revoked_at))
const lastUsed = computed(() => activeTokens.value.map((t) => t.last_used_at).filter(Boolean).sort().at(-1) ?? null)
const scopeLabel = (s: string) => (s === 'daftar_hadiah' ? 'Daftar Hadiah' : 'Order Undangan (simpan saja)')

// ---- token baru / rotasi: plaintext hanya ditampilkan sekali
const revealed = ref<{ token: string; title: string } | null>(null)
const createOpen = ref(false)
const createForm = reactive({ label: '', daftar_hadiah: true, form_order: true })
const creating = ref(false)
async function createToken() {
  if (creating.value) return
  const scopes = [createForm.daftar_hadiah && 'daftar_hadiah', createForm.form_order && 'form_order'].filter(Boolean)
  if (!scopes.length) { toast.error('Pilih minimal satu izin modul.'); return }
  creating.value = true
  try {
    const res = await api.request<{ token: string }>(`/api/app/admin/websites/${websiteId.value}/tokens`, { method: 'POST', body: { label: createForm.label, scopes } })
    createOpen.value = false
    revealed.value = { token: res.token, title: 'Token Website baru' }
    createForm.label = ''
    await loadTokens()
  } catch (err) {
    toast.error(errorMessage(err, 'Token gagal dibuat.'))
  } finally {
    creating.value = false
  }
}
const confirmRotate = ref<Token | null>(null)
const confirmRevoke = ref<Token | null>(null)
const labelTarget = ref<Token | null>(null)
const labelValue = ref('')
const labelSaving = ref(false)
function openLabel(t: Token) { labelTarget.value = t; labelValue.value = t.label }
async function saveLabel() {
  if (!labelTarget.value || labelSaving.value) return
  labelSaving.value = true
  try {
    await api.request(`/api/app/admin/tokens/${labelTarget.value.id}`, { method: 'PATCH', body: { label: labelValue.value } })
    toast.success('Label token diperbarui.')
    labelTarget.value = null
    await loadTokens()
  } catch (err) {
    toast.error(errorMessage(err, 'Label gagal disimpan.'))
  } finally {
    labelSaving.value = false
  }
}
const deleteToken = ref<Token | null>(null)
const deletingToken = ref(false)
async function confirmDeleteToken() {
  if (!deleteToken.value || deletingToken.value) return
  deletingToken.value = true
  try {
    await api.request(`/api/app/admin/tokens/${deleteToken.value.id}`, { method: 'DELETE' })
    toast.success('Token dihapus dari daftar.')
    deleteToken.value = null
    await loadTokens()
  } catch (err) {
    toast.error(errorMessage(err, 'Token gagal dihapus.'))
  } finally {
    deletingToken.value = false
  }
}
const acting = ref(false)
async function rotate() {
  if (!confirmRotate.value || acting.value) return
  acting.value = true
  try {
    const res = await api.request<{ token: string }>(`/api/app/admin/tokens/${confirmRotate.value.id}/rotate`, { method: 'POST' })
    confirmRotate.value = null
    revealed.value = { token: res.token, title: 'Token hasil rotasi' }
    await loadTokens()
  } catch (err) {
    toast.error(errorMessage(err, 'Rotasi token gagal.'))
  } finally {
    acting.value = false
  }
}
async function revoke() {
  if (!confirmRevoke.value || acting.value) return
  acting.value = true
  try {
    await api.request(`/api/app/admin/tokens/${confirmRevoke.value.id}/revoke`, { method: 'POST' })
    confirmRevoke.value = null
    toast.success('Token dicabut. Plugin yang memakai token ini akan ditolak.')
    await loadTokens()
  } catch (err) {
    toast.error(errorMessage(err, 'Token gagal dicabut.'))
  } finally {
    acting.value = false
  }
}
function closeReveal() { revealed.value = null }
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Koneksi</h1><p class="text-caption">Salin URL API dan Token Website ke konektor ApeironKit di WordPress.</p></div>
      <div v-if="!loading && websites.length" class="site-pick">
        <label for="pick-site" class="sr-only">Website</label>
        <select id="pick-site" v-model="websiteId" class="select">
          <option v-for="w in websites" :key="w.id" :value="w.id">{{ w.name }} — {{ w.site_url }}</option>
        </select>
      </div>
    </div>

    <LoadingRows v-if="loading" :rows="3" class="card" />
    <template v-else>
      <EmptyState v-if="!websites.length" class="card" title="Belum ada website" description="Daftarkan website WordPress terlebih dahulu.">
        <template #action><NuxtLink to="/admin/website" class="btn btn-primary">Tambah website</NuxtLink></template>
      </EmptyState>
      <template v-else>
        <!-- Status koneksi permanen (bukan toast) -->
        <section v-if="website" class="card" aria-labelledby="status-title" data-testid="connection-status">
          <div class="card-header">
            <div>
              <h2 id="status-title" class="flex items-center gap-2"><Activity :size="18" /> Status koneksi</h2>
              <p class="text-caption">Diperbarui setiap kali plugin mengirim permintaan</p>
            </div>
          </div>
          <p v-if="pointsToApp" class="alert tone-err mx-5 mt-4" role="alert" data-testid="website-is-app">
            <TriangleAlert :size="16" />
            <span>Alamat website ini sama dengan alamat MDUNDIG sendiri, sehingga plugin tidak akan pernah terhubung. Ubah di menu
              <NuxtLink :to="{ path: '/admin/website' }" class="underline">Website</NuxtLink> menjadi alamat beranda WordPress yang memakai ApeironKit.</span>
          </p>
          <div class="card-body status-grid">
            <div><p class="text-caption">Website</p><p class="text-label break-all">{{ website.site_url }}</p></div>
            <div>
              <p class="text-caption">Identitas plugin</p>
              <span v-if="website.external_site_id" class="badge badge-dot tone-ok">Terikat sejak {{ formatDate(website.bound_at) }}</span>
              <span v-else class="badge badge-dot tone-neutral">Menunggu uji koneksi pertama</span>
            </div>
            <div>
              <p class="text-caption">Token aktif</p>
              <span class="badge" :class="activeTokens.length ? 'tone-ok' : 'tone-neutral'">{{ activeTokens.length ? `${activeTokens.length} aktif` : 'Belum ada' }}</span>
            </div>
            <div><p class="text-caption">Permintaan terakhir</p><p class="text-label">{{ formatDateTime(lastUsed) }}</p></div>
          </div>
        </section>

        <section v-if="urls" class="card" aria-labelledby="url-title">
          <div class="card-header">
            <div>
              <h2 id="url-title" class="flex items-center gap-2"><Link2 :size="18" /> URL API</h2>
              <p class="text-caption">Tempel di konektor ApeironKit pada WordPress</p>
            </div>
          </div>
          <div class="card-body flex flex-col gap-5">
            <p v-if="urls.ignored_app_url" class="alert" data-testid="app-url-warning"><TriangleAlert :size="16" />
              <span>Pengaturan <span class="text-mono">NUXT_PUBLIC_APP_URL</span> di server berisi <span class="text-mono">{{ urls.ignored_app_url }}</span> (bukan alamat HTTPS publik), jadi diabaikan. URL di bawah memakai alamat yang sedang dibuka. Perbarui variabel itu di Vercel (atau hapus), lalu redeploy.</span></p>
            <p v-if="!urls.https" class="alert"><TriangleAlert :size="16" /> Plugin hanya menerima URL HTTPS publik tanpa port. Pakai domain atau subdomain aplikasi yang sudah online.</p>
            <CopyField label="URL API Daftar Hadiah" :value="urls.daftar_hadiah_url" />
            <CopyField label="URL API Order Undangan" :value="urls.form_order_url" hint="Di plugin ApeironKit bagian ini bernama Form Order; URL-nya juga dapat dibentuk otomatis dari URL Daftar Hadiah." />
          </div>
        </section>

        <section class="card" aria-labelledby="token-title">
          <div class="card-header">
            <div>
              <h2 id="token-title" class="flex items-center gap-2"><KeyRound :size="18" /> Token Website</h2>
              <p class="text-caption">Token hanya tampil sekali saat dibuat; simpan di tempat aman</p>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="tokens.length" class="badge">{{ activeTokens.length }} aktif</span>
              <button class="btn btn-primary" type="button" :disabled="!websiteId" @click="createOpen = true"><Plus :size="16" /> Buat token</button>
            </div>
          </div>
          <LoadingRows v-if="tokensLoading" :rows="2" />
          <EmptyState v-else-if="!tokens.length" :icon="KeyRound" title="Belum ada token" description="Buat token, lalu tempel pada konektor ApeironKit." />
          <div v-else class="table-wrap" tabindex="0" role="region" aria-label="Tabel token website">
            <table v-stack class="table table-stack">
              <thead><tr><th scope="col">Token</th><th scope="col">Izin modul</th><th scope="col">Dibuat</th><th scope="col">Terakhir dipakai</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Aksi</span></th></tr></thead>
              <tbody>
                <tr v-for="t in tokens" :key="t.id">
                  <td class="cell-primary"><span class="cell-strong block">{{ t.label || 'Token' }}</span><span class="text-mono text-caption whitespace-nowrap">mdh_{{ t.token_hint }}</span></td>
                  <td><div class="flex flex-wrap gap-1"><span v-for="s in t.scopes" :key="s" class="badge tone-neutral">{{ scopeLabel(s) }}</span></div></td>
                  <td class="whitespace-nowrap">{{ formatDateTime(t.created_at) }}</td>
                  <td class="whitespace-nowrap">{{ formatDateTime(t.last_used_at) }}</td>
                  <td>
                    <span v-if="t.revoked_at" class="badge tone-neutral">Dicabut</span>
                    <span v-else class="badge badge-dot tone-ok">Aktif</span>
                  </td>
                  <td class="cell-actions">
                    <div class="flex gap-1 justify-end">
                      <button v-if="!t.revoked_at" class="btn btn-secondary btn-sm" type="button" @click="confirmRotate = t"><RotateCw :size="15" /> Rotasi</button>
                      <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Ubah label" :aria-label="`Ubah label ${t.label || 'token'}`" @click="openLabel(t)"><Pencil :size="15" /></button>
                      <button v-if="!t.revoked_at" class="btn btn-danger-ghost btn-sm btn-icon" type="button" title="Cabut token" :aria-label="`Cabut token ${t.label || 'token'}`" @click="confirmRevoke = t"><Ban :size="15" /></button>
                      <button v-else class="btn btn-danger-ghost btn-sm btn-icon" type="button" title="Hapus token" :aria-label="`Hapus token ${t.label || 'token'}`" @click="deleteToken = t"><Trash2 :size="15" /></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <OwnerMappingPanel v-if="websiteId" :website-id="websiteId" />

        <details class="disclosure">
          <summary>Cara menghubungkan plugin</summary>
          <div class="disclosure-body">
            <ol class="list-decimal pl-5 flex flex-col gap-2">
              <li>WordPress → ApeironKit → Daftar Hadiah → tab Koneksi: tempel URL API Daftar Hadiah dan Token Website.</li>
              <li>Simpan Pengaturan → Uji Koneksi. Uji pertama mengikat identitas website (URL harus sama dengan yang terdaftar).</li>
              <li>Aktifkan Reservasi lalu simpan lagi. Untuk Order Undangan (menu Form Order di plugin), pilih penyimpanan API lalu uji koneksinya.</li>
              <li>Undangan berikutnya tercatat otomatis; tidak perlu sinkronisasi manual.</li>
            </ol>
          </div>
        </details>
      </template>
    </template>

    <ModalDialog :open="createOpen" :icon="KeyRound" title="Buat Token Website" subtitle="Token tampil sekali setelah dibuat; tempel di konektor ApeironKit." :closable="!creating" @close="createOpen = false">
      <form id="token-form" class="flex flex-col gap-5" @submit.prevent="createToken">
        <div class="field"><label for="t-label" class="field-label">Label (opsional)</label><input id="t-label" v-model="createForm.label" class="input" maxlength="80" placeholder="Mis. Produksi"></div>
        <fieldset class="field">
          <legend class="field-label mb-2">Izin modul</legend>
          <label class="flex items-center gap-2"><input v-model="createForm.daftar_hadiah" type="checkbox" class="checkbox"> Daftar Hadiah (katalog, stok, reservasi, laporan WordPress)</label>
          <label class="flex items-center gap-2"><input v-model="createForm.form_order" type="checkbox" class="checkbox"> Order Undangan (uji koneksi & simpan pesanan saja)</label>
        </fieldset>
      </form>
      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="creating" @click="createOpen = false">Batal</button>
        <AsyncButton type="submit" form="token-form" :loading="creating">Buat token</AsyncButton>
      </template>
    </ModalDialog>

    <ModalDialog :open="!!revealed" :icon="KeyRound" :title="revealed?.title ?? ''" subtitle="Token hanya ditampilkan sekali." @close="closeReveal">
      <div v-if="revealed" class="flex flex-col gap-4">
        <p class="alert"><TriangleAlert :size="16" /> Salin sekarang dan simpan di plugin. Setelah ditutup, token tidak dapat dilihat lagi.</p>
        <CopyField label="Token Website" :value="revealed.token" secret />
      </div>
      <template #footer><button class="btn btn-primary" type="button" @click="closeReveal">Sudah disalin</button></template>
    </ModalDialog>

    <ModalDialog :open="!!confirmRotate" :icon="RotateCw" title="Rotasi token?" subtitle="Token lama dicabut, token baru dibuat." size="sm" :closable="!acting" @close="confirmRotate = null">
      <p>Token lama langsung dicabut dan token baru dibuat. Perbarui token pada plugin setelah ini.</p>
      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="acting" @click="confirmRotate = null">Batal</button>
        <AsyncButton :loading="acting" @click="rotate">Rotasi</AsyncButton>
      </template>
    </ModalDialog>
    <ModalDialog :open="!!labelTarget" :icon="Pencil" title="Ubah label token" subtitle="Label hanya untuk membedakan token di daftar." size="sm" :closable="!labelSaving" @close="labelTarget = null">
      <form id="label-form" class="field" @submit.prevent="saveLabel">
        <label for="tok-label" class="field-label">Label</label>
        <input id="tok-label" v-model="labelValue" class="input" maxlength="80" placeholder="Mis. Produksi">
        <p class="field-hint">Nilai token tidak dapat diubah; gunakan Rotasi untuk token baru.</p>
      </form>
      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="labelSaving" @click="labelTarget = null">Batal</button>
        <AsyncButton type="submit" form="label-form" :loading="labelSaving">Simpan</AsyncButton>
      </template>
    </ModalDialog>
    <ConfirmDialog :open="!!deleteToken" title="Hapus token?" :loading="deletingToken"
      message="Token yang sudah dicabut dihapus dari daftar. Riwayat audit tetap tersimpan." @close="deleteToken = null" @confirm="confirmDeleteToken" />
    <ModalDialog :open="!!confirmRevoke" :icon="Ban" tone="danger" title="Cabut token?" subtitle="Tindakan ini tidak dapat dibatalkan." size="sm" :closable="!acting" @close="confirmRevoke = null">
      <p>Plugin yang memakai token ini akan langsung ditolak.</p>
      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="acting" @click="confirmRevoke = null">Batal</button>
        <AsyncButton variant="danger" :loading="acting" @click="revoke">Cabut token</AsyncButton>
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
.site-pick { width: min(100%, 360px); }
.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem 1.5rem; }
.status-grid > div { display: flex; flex-direction: column; gap: 0.35rem; align-items: flex-start; min-width: 0; }
</style>
