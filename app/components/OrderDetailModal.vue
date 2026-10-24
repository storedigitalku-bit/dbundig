<script setup lang="ts">
import { ClipboardList, Lock, Pencil, Trash2 } from 'lucide-vue-next'
import { displayValue, groupOrderEntries, isEmptyValue, type OrderEntry, type OrderField, type OrderMeta } from '../../shared/orderSections'
import type { OrderEdit } from './OrderFormModal.vue'

// Detail Order Undangan dalam popup: dikelompokkan per bagian (Pemesan, Pria, Wanita, Akad, …), field kosong disembunyikan.
interface Detail {
  id: string; website_id: string; website: { name: string; site_url: string } | null; post_id: number | null; post_title: string
  document_id: number | null; element_id: string | null; request_id: string; created_at: string; updated_at: string
  status: string; admin_note: string; source: string; entries: OrderEntry[]; meta?: OrderMeta
}
const props = defineProps<{ orderId: string | null }>()
const emit = defineEmits<{ close: []; changed: []; deleted: [] }>()
const api = useApi()
const toast = useToast()
const data = ref<Detail | null>(null)
const loading = ref(false)
const error = ref('')
const showEmpty = ref(false)

async function load() {
  if (!props.orderId) return
  loading.value = !data.value || data.value.id !== props.orderId
  error.value = ''
  try { data.value = await api.request<Detail>(`/api/app/admin/form-orders/${props.orderId}`) } catch (err) { error.value = errorMessage(err, 'Order tidak ditemukan.') } finally { loading.value = false }
}
watch(() => props.orderId, (id) => { showEmpty.value = false; if (id) void load(); else data.value = null }, { immediate: true })

const sections = computed(() => groupOrderEntries(data.value?.entries ?? [], data.value?.meta)
  .map((s) => ({ ...s, fields: showEmpty.value ? s.fields : s.fields.filter((f) => !f.empty) }))
  .filter((s) => s.fields.length))
// Field berurutan dengan `group` yang sama → satu blok bersub-judul (mis. tiap cerita di Cerita Cinta).
function chunks(fields: OrderField[]) {
  const out: Array<{ group: string; fields: OrderField[] }> = []
  for (const f of fields) {
    const g = f.group ?? ''
    if (out.at(-1)?.group === g) out.at(-1)!.fields.push(f)
    else out.push({ group: g, fields: [f] })
  }
  return out
}
const emptyCount = computed(() => (data.value?.entries ?? []).filter((e) => isEmptyValue(e.value)).length)
const title = computed(() => data.value ? (data.value.post_title || (data.value.post_id ? `Post #${data.value.post_id}` : 'Order')) : 'Detail order')
const subtitle = computed(() => data.value
  ? `${data.value.website?.name ?? ''} · ${formatDateTime(data.value.created_at)} · ${data.value.source === 'admin' ? 'Input manual' : 'Dari widget'}`
  : '')

const statusSaving = ref(false)
async function changeStatus(status: string) {
  if (!data.value || statusSaving.value || status === data.value.status) return
  statusSaving.value = true
  try {
    await api.request(`/api/app/admin/form-orders/${data.value.id}`, { method: 'PATCH', body: { status } })
    data.value.status = status
    toast.success(`Status diubah menjadi ${ORDER_STATUS_LABEL[status]}.`)
    emit('changed')
  } catch (err) {
    toast.error(errorMessage(err, 'Status gagal diubah.'))
  } finally {
    statusSaving.value = false
  }
}

// Isi order dari widget (dikirim klien) hanya-lihat; status & catatan admin tetap bisa diubah.
const isManual = computed(() => data.value?.source === 'admin')
const noteEditing = ref(false)
const noteDraft = ref('')
const noteSaving = ref(false)
function startNote() { noteDraft.value = data.value?.admin_note ?? ''; noteEditing.value = true }
async function saveNote() {
  if (!data.value || noteSaving.value) return
  noteSaving.value = true
  try {
    await api.request(`/api/app/admin/form-orders/${data.value.id}`, { method: 'PATCH', body: { admin_note: noteDraft.value } })
    data.value.admin_note = noteDraft.value.trim()
    noteEditing.value = false
    toast.success('Catatan admin disimpan.')
    emit('changed')
  } catch (err) {
    toast.error(errorMessage(err, 'Catatan gagal disimpan.'))
  } finally {
    noteSaving.value = false
  }
}

const editOpen = ref(false)
const editModel = computed<OrderEdit | null>(() => data.value
  ? { id: data.value.id, website_id: data.value.website_id, post_title: data.value.post_title, status: data.value.status, admin_note: data.value.admin_note, entries: data.value.entries }
  : null)
async function afterEdit() { await load(); emit('changed') }

const deleteOpen = ref(false)
const deleting = ref(false)
async function remove() {
  if (!data.value || deleting.value) return
  deleting.value = true
  try {
    await api.request(`/api/app/admin/form-orders/${data.value.id}`, { method: 'DELETE' })
    toast.success('Order dihapus.')
    deleteOpen.value = false
    emit('deleted')
  } catch (err) {
    toast.error(errorMessage(err, 'Order gagal dihapus.'))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <ModalDialog :open="!!orderId && !editOpen && !deleteOpen" :icon="ClipboardList" :title="title" :subtitle="subtitle" size="lg" @close="emit('close')">
    <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
    <LoadingRows v-else-if="loading" :rows="5" />
    <div v-else-if="data" class="flex flex-col gap-5" data-testid="order-detail">
      <div class="status-row">
        <div class="field">
          <label for="od-status" class="field-label">Status</label>
          <select id="od-status" class="select" :value="data.status" :disabled="statusSaving" @change="changeStatus(($event.target as HTMLSelectElement).value)">
            <option v-for="s in ORDER_STATUSES" :key="s" :value="s">{{ ORDER_STATUS_LABEL[s] }}</option>
          </select>
        </div>
        <div class="min-w-0">
          <div class="flex items-center justify-between gap-2">
            <label for="od-note" class="field-label">Catatan admin</label>
            <button v-if="!noteEditing" class="btn btn-ghost btn-sm" type="button" @click="startNote"><Pencil :size="14" /> Ubah catatan</button>
          </div>
          <form v-if="noteEditing" class="note-form" @submit.prevent="saveNote">
            <textarea id="od-note" v-model="noteDraft" class="textarea" rows="3" maxlength="2000" placeholder="Mis. dikonfirmasi via WhatsApp, nama pria seharusnya Andri" />
            <div class="flex justify-end gap-2">
              <button class="btn btn-secondary btn-sm" type="button" :disabled="noteSaving" @click="noteEditing = false">Batal</button>
              <AsyncButton type="submit" size="sm" :loading="noteSaving">Simpan catatan</AsyncButton>
            </div>
          </form>
          <p v-else class="mt-2 whitespace-pre-line break-words">{{ data.admin_note || '—' }}</p>
        </div>
      </div>

      <section v-for="s in sections" :key="s.title" class="section" :aria-label="s.title">
        <h3 class="section-title">{{ s.title }}</h3>
        <div class="rows">
          <template v-for="c in chunks(s.fields)" :key="c.group || '-'">
            <p v-if="c.group" class="group-title">{{ c.group }}</p>
            <dl class="group-rows">
              <div v-for="f in c.fields" :key="f.key" class="row">
                <dt>{{ f.field }}</dt>
                <dd :class="{ 'is-empty': f.empty }">{{ f.empty ? '—' : displayValue(f.value) }}</dd>
              </div>
            </dl>
          </template>
        </div>
      </section>
      <p v-if="!sections.length" class="text-caption">Semua field kosong.</p>
      <button v-if="emptyCount" class="btn btn-ghost btn-sm self-start" type="button" @click="showEmpty = !showEmpty">
        {{ showEmpty ? 'Sembunyikan field kosong' : `Tampilkan ${emptyCount} field kosong` }}
      </button>

      <details class="disclosure">
        <summary>Detail teknis</summary>
        <div class="disclosure-body">
          <dl class="rows">
            <div class="row"><dt>ID permintaan</dt><dd class="text-mono">{{ data.request_id }}</dd></div>
            <div class="row"><dt>Post / dokumen / elemen</dt><dd class="text-mono">{{ data.post_id ?? '—' }} / {{ data.document_id ?? '—' }} / {{ data.element_id ?? '—' }}</dd></div>
            <div class="row"><dt>Terakhir diubah</dt><dd>{{ formatDateTime(data.updated_at) }}</dd></div>
          </dl>
        </div>
      </details>
    </div>
    <template #footer>
      <button class="btn btn-danger-ghost mr-auto" type="button" :disabled="!data" @click="deleteOpen = true"><Trash2 :size="16" /> Hapus</button>
      <button class="btn btn-secondary" type="button" @click="emit('close')">Tutup</button>
      <button v-if="isManual" class="btn btn-primary" type="button" :disabled="!data" @click="editOpen = true"><Pencil :size="16" /> Ubah</button>
      <span v-else-if="data" class="readonly-hint" data-testid="order-readonly"><Lock :size="14" aria-hidden="true" /> Isi dari klien — hanya-lihat</span>
    </template>
  </ModalDialog>
  <OrderFormModal :open="editOpen" :order="editModel" @close="editOpen = false" @saved="afterEdit" />
  <ConfirmDialog :open="deleteOpen" title="Hapus order?" message="Order dihapus permanen beserta seluruh isinya."
    :loading="deleting" @close="deleteOpen = false" @confirm="remove" />
</template>

<style scoped>
.note-form { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
.readonly-hint { display: inline-flex; align-items: center; gap: 0.35rem; font-size: var(--fs-caption); color: var(--text-muted); }
.status-row { display: grid; grid-template-columns: 200px 1fr; gap: 1.25rem; align-items: start; padding-bottom: 1.25rem; border-bottom: 1px solid var(--border); }
.section-title { font-size: var(--fs-micro); font-weight: var(--fw-medium); letter-spacing: var(--tracking-wide); text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; }
.rows { margin: 0; border: 1px solid var(--border); border-radius: var(--r); }
.row { display: grid; grid-template-columns: minmax(140px, 38%) 1fr; gap: 1rem; padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--border); }
.row:last-child { border-bottom: 0; }
.group-rows { margin: 0; }
.group-rows + .group-rows, .group-rows + .group-title { border-top: 1px solid var(--border); }
.group-title { padding: 0.55rem 0.9rem; font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); background: var(--bg-subtle); border-bottom: 1px solid var(--border); }
.group-title:first-child { border-radius: var(--r) var(--r) 0 0; }
.row dt { color: var(--text-muted); font-size: var(--fs-label); }
.row dd { margin: 0; color: var(--text-heading); min-width: 0; overflow-wrap: anywhere; white-space: pre-line; }
.row dd.is-empty { color: var(--text-faint); }
.disclosure .rows { border: 0; }
.disclosure .row { padding-left: 0; padding-right: 0; }
@media (max-width: 640px) {
  .status-row, .row { grid-template-columns: 1fr; gap: 0.25rem; }
  :deep(.mr-auto) { margin-right: 0; }
}
</style>
