<script setup lang="ts">
import { ClipboardList, Plus, X } from 'lucide-vue-next'

// Tambah / ubah Order Undangan (admin). Field bebas: label + isi. Field checkbox (array) diedit sebagai teks dipisah koma.
export interface OrderEdit {
  id: string; website_id: string; post_title: string; status: string; admin_note: string
  entries: Array<{ key: string; label: string; value: string | string[] }>
}
interface Row { key?: string; label: string; value: string; isArray: boolean }

const props = defineProps<{ open: boolean; order: OrderEdit | null }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
const api = useApi()
const toast = useToast()
const isEdit = computed(() => !!props.order)
const websites = ref<Array<{ id: string; name: string }>>([])
const form = reactive({ website_id: '', post_title: '', status: 'baru', admin_note: '' })
const rows = ref<Row[]>([])
const saving = ref(false)
const error = ref('')

watch(() => props.open, async (open) => {
  if (!open) return
  error.value = ''
  const o = props.order
  Object.assign(form, { website_id: o?.website_id ?? '', post_title: o?.post_title ?? '', status: o?.status ?? 'baru', admin_note: o?.admin_note ?? '' })
  rows.value = o
    ? o.entries.map((e) => ({ key: e.key, label: e.label, value: Array.isArray(e.value) ? e.value.join(', ') : e.value, isArray: Array.isArray(e.value) }))
    : [{ label: 'Nama pemesan', value: '', isArray: false }, { label: 'WhatsApp', value: '', isArray: false }, { label: 'Paket', value: '', isArray: false }]
  if (!o && !websites.value.length) {
    try {
      websites.value = (await api.request<{ items: Array<{ id: string; name: string }> }>('/api/app/admin/websites')).items
      if (websites.value.length === 1) form.website_id = websites.value[0]!.id
    } catch { /* ditampilkan saat simpan */ }
  }
})

function addRow() { rows.value.push({ label: '', value: '', isArray: false }) }
function removeRow(i: number) { rows.value.splice(i, 1) }

async function save() {
  if (saving.value) return
  error.value = ''
  const filled = rows.value.filter((r) => r.label.trim() || r.value.trim())
  if (!isEdit.value && !form.website_id) { error.value = 'Pilih website.'; return }
  if (!filled.length) { error.value = 'Isi minimal satu field.'; return }
  if (filled.some((r) => !r.label.trim())) { error.value = 'Setiap field wajib memiliki label.'; return }
  const entries = filled.map((r) => ({
    key: r.key, label: r.label.trim(),
    value: r.isArray ? r.value.split(',').map((v) => v.trim()).filter(Boolean) : r.value,
  }))
  saving.value = true
  try {
    if (isEdit.value) {
      await api.request(`/api/app/admin/form-orders/${props.order!.id}`, { method: 'PATCH', body: { post_title: form.post_title, status: form.status, admin_note: form.admin_note, entries } })
      toast.success('Order diperbarui.')
      emit('saved', props.order!.id)
    } else {
      const res = await api.request<{ id: string }>('/api/app/admin/form-orders', { method: 'POST', body: { ...form, entries } })
      toast.success('Order ditambahkan.')
      emit('saved', res.id)
    }
    emit('close')
  } catch (err) {
    error.value = errorMessage(err, 'Order gagal disimpan.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalDialog :open="open" :icon="ClipboardList" :title="isEdit ? 'Ubah order' : 'Tambah order'" :subtitle="isEdit ? 'Perbarui isi field, status, atau catatan order.' : 'Untuk pesanan yang masuk di luar widget (mis. lewat chat).'" size="lg" :closable="!saving" @close="emit('close')">
    <form id="order-form" class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <div class="grid gap-5 sm:grid-cols-2">
        <div v-if="!isEdit" class="field">
          <label for="of-web" class="field-label">Website</label>
          <select id="of-web" v-model="form.website_id" class="select">
            <option value="">Pilih website</option>
            <option v-for="w in websites" :key="w.id" :value="w.id">{{ w.name }}</option>
          </select>
        </div>
        <div class="field"><label for="of-title" class="field-label">Judul / sumber</label><input id="of-title" v-model="form.post_title" class="input" maxlength="1000" placeholder="Order manual"></div>
        <div class="field">
          <label for="of-status" class="field-label">Status</label>
          <select id="of-status" v-model="form.status" class="select">
            <option v-for="s in ORDER_STATUSES" :key="s" :value="s">{{ ORDER_STATUS_LABEL[s] }}</option>
          </select>
        </div>
      </div>
      <fieldset class="flex flex-col gap-3">
        <legend class="field-label mb-1">Isi order</legend>
        <div v-for="(r, i) in rows" :key="i" class="entry-row">
          <div class="field">
            <label :for="`of-l-${i}`" class="sr-only">Label field {{ i + 1 }}</label>
            <input :id="`of-l-${i}`" v-model="r.label" class="input" placeholder="Label" maxlength="500">
          </div>
          <div class="field">
            <label :for="`of-v-${i}`" class="sr-only">Isi field {{ r.label || i + 1 }}</label>
            <input :id="`of-v-${i}`" v-model="r.value" class="input" :placeholder="r.isArray ? 'Pilihan, pisahkan dengan koma' : 'Isi'">
          </div>
          <button class="btn btn-ghost btn-icon" type="button" :aria-label="`Hapus field ${r.label || i + 1}`" @click="removeRow(i)"><X :size="16" /></button>
        </div>
        <div><button class="btn btn-secondary btn-sm" type="button" @click="addRow"><Plus :size="15" /> Tambah field</button></div>
      </fieldset>
      <div class="field"><label for="of-note" class="field-label">Catatan admin (opsional)</label><textarea id="of-note" v-model="form.admin_note" class="textarea" rows="2" maxlength="2000" /></div>
      <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <button class="btn btn-secondary" type="button" :disabled="saving" @click="emit('close')">Batal</button>
      <AsyncButton type="submit" form="order-form" :loading="saving">Simpan</AsyncButton>
    </template>
  </ModalDialog>
</template>

<style scoped>
.entry-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto; gap: 0.5rem; align-items: start; }
/* Ponsel: tiap pasangan label + isi jadi satu kotak; tombol hapus sebaris dengan label agar jelas pasangan mana yang dihapus. */
@media (max-width: 560px) {
  .entry-row {
    grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'label del' 'value value';
    padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--r); background: var(--bg-subtle);
  }
  .entry-row > .field:nth-child(1) { grid-area: label; }
  .entry-row > .field:nth-child(2) { grid-area: value; }
  .entry-row > .btn { grid-area: del; }
}
</style>
