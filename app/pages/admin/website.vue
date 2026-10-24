<script setup lang="ts">
import { Globe, Link2, Pencil, Plus, Trash2, Unlink } from 'lucide-vue-next'

definePageMeta({ admin: true })
useHead({ title: 'Website — MDUNDIG' })

interface Website {
  id: string; name: string; site_url: string; external_site_id: string | null; bound_at: string | null; status: 'active' | 'disabled'
  created_at: string; active_tokens: number; last_used_at: string | null
}
const api = useApi()
const toast = useToast()
const items = ref<Website[]>([])
const loading = ref(true)
const error = ref('')
async function load() {
  loading.value = true
  error.value = ''
  try { items.value = (await api.request<{ items: Website[] }>('/api/app/admin/websites')).items } catch (err) { error.value = errorMessage(err) } finally { loading.value = false }
}
onMounted(load)

const formOpen = ref(false)
const editing = ref<Website | null>(null)
const form = reactive({ name: '', site_url: '', status: 'active' as 'active' | 'disabled' })
const formError = ref('')
const saving = ref(false)
function openCreate() { editing.value = null; Object.assign(form, { name: '', site_url: '', status: 'active' }); formError.value = ''; formOpen.value = true }
function openEdit(w: Website) { editing.value = w; Object.assign(form, { name: w.name, site_url: w.site_url, status: w.status }); formError.value = ''; formOpen.value = true }
async function save() {
  if (saving.value) return
  saving.value = true
  formError.value = ''
  try {
    if (editing.value) {
      await api.request(`/api/app/admin/websites/${editing.value.id}`, { method: 'PATCH', body: { ...form } })
      toast.success('Website diperbarui.')
    } else {
      const created = await api.request<Website>('/api/app/admin/websites', { method: 'POST', body: { name: form.name, site_url: form.site_url } })
      toast.success('Website didaftarkan. Lanjutkan dengan membuat Token Website.')
      formOpen.value = false
      await navigateTo({ path: '/admin/koneksi', query: { website: created.id } })
      return
    }
    formOpen.value = false
    await load()
  } catch (err) {
    formError.value = errorMessage(err, 'Website gagal disimpan.')
  } finally {
    saving.value = false
  }
}

const deleteTarget = ref<Website | null>(null)
const deletingWebsite = ref(false)
async function deleteWebsite() {
  if (!deleteTarget.value || deletingWebsite.value) return
  deletingWebsite.value = true
  try {
    await api.request(`/api/app/admin/websites/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.success('Website dihapus beserta tokennya.')
    deleteTarget.value = null
    await load()
  } catch (err) {
    deleteTarget.value = null
    toast.error(errorMessage(err, 'Website gagal dihapus.'))
  } finally {
    deletingWebsite.value = false
  }
}

const resetTarget = ref<Website | null>(null)
const resetting = ref(false)
async function resetBinding() {
  if (!resetTarget.value || resetting.value) return
  resetting.value = true
  try {
    await api.request(`/api/app/admin/websites/${resetTarget.value.id}`, { method: 'PATCH', body: { reset_binding: true } })
    toast.success('Ikatan identitas website dilepas. Uji koneksi ulang dari plugin.')
    resetTarget.value = null
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Gagal melepas ikatan.'))
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Website</h1><p class="text-caption">Daftarkan website WordPress yang memakai ApeironKit.</p></div>
      <button class="btn btn-primary" type="button" @click="openCreate"><Plus :size="16" /> Tambah website</button>
    </div>
    <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
    <section class="card" aria-labelledby="sites-title">
      <div class="card-header">
        <div>
          <h2 id="sites-title" class="flex items-center gap-2"><Globe :size="18" /> Daftar website</h2>
          <p class="text-caption">Website WordPress yang mengirim data widget ke MDUNDIG</p>
        </div>
        <span v-if="items.length" class="badge">{{ items.length }} website</span>
      </div>
      <LoadingRows v-if="loading" :rows="3" />
      <EmptyState v-else-if="!items.length" :icon="Globe" title="Belum ada website" description="Tambahkan URL beranda WordPress, lalu buat Token Website pada menu Koneksi." />
      <div v-else class="table-wrap" tabindex="0" role="region" aria-label="Tabel website">
        <table v-stack class="table table-stack">
          <thead><tr><th scope="col">Website</th><th scope="col">Identitas plugin</th><th scope="col" class="num">Token aktif</th><th scope="col">Terakhir dipakai</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            <tr v-for="w in items" :key="w.id">
              <td class="cell-primary"><span class="cell-strong block">{{ w.name }}</span><span class="text-caption break-all">{{ w.site_url }}</span></td>
              <td>
                <span v-if="w.external_site_id" class="badge badge-dot tone-ok" :title="w.external_site_id">Terikat</span>
                <span v-else class="badge badge-dot tone-neutral">Menunggu uji koneksi</span>
              </td>
              <td class="num">{{ w.active_tokens }}</td>
              <td class="whitespace-nowrap">{{ formatDateTime(w.last_used_at) }}</td>
              <td><span class="badge badge-dot" :class="w.status === 'active' ? 'tone-ok' : 'tone-neutral'">{{ w.status === 'active' ? 'Aktif' : 'Nonaktif' }}</span></td>
              <td class="cell-actions">
                <div class="flex gap-1 justify-end">
                  <NuxtLink :to="{ path: '/admin/koneksi', query: { website: w.id } }" class="btn btn-secondary btn-sm"><Link2 :size="15" /> Koneksi</NuxtLink>
                  <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Ubah website" :aria-label="`Ubah website ${w.name}`" @click="openEdit(w)"><Pencil :size="15" /></button>
                  <button class="btn btn-danger-ghost btn-sm btn-icon" type="button" title="Hapus website" :aria-label="`Hapus website ${w.name}`" @click="deleteTarget = w"><Trash2 :size="15" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ModalDialog :open="formOpen" :icon="Globe" :title="editing ? 'Ubah website' : 'Tambah website'" :subtitle="editing ? 'Perbarui nama, URL, atau status website.' : 'Daftarkan website WordPress yang memakai ApeironKit.'" :closable="!saving" @close="formOpen = false">
      <form id="website-form" class="flex flex-col gap-5" @submit.prevent="save">
        <div class="field"><label for="w-name" class="field-label">Nama</label><input id="w-name" v-model="form.name" class="input" maxlength="120" required></div>
        <div class="field">
          <label for="w-url" class="field-label">URL beranda WordPress</label>
          <input id="w-url" v-model="form.site_url" class="input" type="url" placeholder="https://domain.com/" required>
          <p class="field-hint">Sama dengan "Alamat Situs" di WordPress (Pengaturan → Umum), termasuk subdirektori bila ada. Bukan alamat MDUNDIG.</p>
        </div>
        <div v-if="editing" class="field">
          <label for="w-status" class="field-label">Status</label>
          <select id="w-status" v-model="form.status" class="select"><option value="active">Aktif</option><option value="disabled">Nonaktif (tolak semua permintaan plugin)</option></select>
        </div>
        <div v-if="editing?.external_site_id" class="alert">
          <span class="flex-1">Website ini terikat ke identitas plugin. Bila domain berubah, lepaskan ikatan secara eksplisit.</span>
          <button type="button" class="btn btn-secondary btn-sm" @click="resetTarget = editing; formOpen = false">Lepas ikatan</button>
        </div>
        <p v-if="formError" class="alert tone-err" role="alert">{{ formError }}</p>
      </form>
      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="saving" @click="formOpen = false">Batal</button>
        <AsyncButton type="submit" form="website-form" :loading="saving">Simpan</AsyncButton>
      </template>
    </ModalDialog>

    <ConfirmDialog :open="!!deleteTarget" title="Hapus website?" :loading="deletingWebsite"
      message="Website dan seluruh Token Website-nya dihapus. Hanya bisa bila website belum memiliki undangan atau order; bila sudah, ubah status menjadi Nonaktif."
      @close="deleteTarget = null" @confirm="deleteWebsite" />
    <ModalDialog :open="!!resetTarget" :icon="Unlink" tone="danger" title="Lepas ikatan identitas?" subtitle="Plugin perlu uji koneksi ulang setelah ini." size="sm" :closable="!resetting" @close="resetTarget = null">
      <p>Identitas plugin akan diikat ulang pada uji koneksi berikutnya yang memakai token valid dan URL yang cocok. Data undangan tidak dipindahkan.</p>
      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="resetting" @click="resetTarget = null">Batal</button>
        <AsyncButton variant="danger" :loading="resetting" @click="resetBinding">Lepas ikatan</AsyncButton>
      </template>
    </ModalDialog>
  </div>
</template>
