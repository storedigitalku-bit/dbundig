<script setup lang="ts">
import { ListChecks } from 'lucide-vue-next'
// Tambah / ubah reservasi (admin). Stok diperiksa server dalam transaksi database.
export interface ReservationEdit {
  id: string; invitation_id: string; gift_id: string; gift_name: string; guest_name: string; guest_whatsapp: string
  message: string; status: string; admin_note?: string
}
interface GiftOption { id: string; name: string; available_quantity: number; active: boolean; manual_status: string }

const props = defineProps<{ open: boolean; reservation: ReservationEdit | null; invitationId?: string }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const api = useApi()
const toast = useToast()
const isEdit = computed(() => !!props.reservation)
const form = reactive({ invitation_id: '', gift_id: '', guest_name: '', guest_whatsapp: '', message: '', admin_note: '', status: 'confirmed' })
const invitations = ref<Array<{ id: string; title: string; website_name: string | null }>>([])
const gifts = ref<GiftOption[]>([])
const saving = ref(false)
const error = ref('')

async function loadGifts(invitationId: string) {
  gifts.value = []
  if (!invitationId) return
  try {
    const res = await api.request<{ gifts: GiftOption[] }>(`/api/app/invitations/${invitationId}`)
    gifts.value = res.gifts.filter((g) => g.active)
  } catch (err) {
    error.value = errorMessage(err, 'Daftar hadiah gagal dimuat.')
  }
}

watch(() => props.open, async (open) => {
  if (!open) return
  error.value = ''
  const r = props.reservation
  Object.assign(form, {
    invitation_id: r?.invitation_id ?? props.invitationId ?? '', gift_id: r?.gift_id ?? '',
    guest_name: r?.guest_name ?? '', guest_whatsapp: r?.guest_whatsapp ?? '', message: r?.message ?? '',
    admin_note: r?.admin_note ?? '', status: r?.status ?? 'confirmed',
  })
  if (!r && !props.invitationId && !invitations.value.length) {
    try { invitations.value = await fetchAllPages<(typeof invitations.value)[number]>(api.request, '/api/app/invitations') } catch { /* ditangani di bawah */ }
  }
  if (!r) await loadGifts(form.invitation_id)
})
watch(() => form.invitation_id, (id, old) => { if (!isEdit.value && old !== undefined && id !== old) { form.gift_id = ''; void loadGifts(id) } })

async function save() {
  if (saving.value) return
  error.value = ''
  if (!isEdit.value && !form.gift_id) { error.value = 'Pilih hadiah.'; return }
  if (!form.guest_name.trim()) { error.value = 'Nama tamu wajib diisi.'; return }
  saving.value = true
  try {
    const body = { guest_name: form.guest_name, guest_whatsapp: form.guest_whatsapp, message: form.message, admin_note: form.admin_note }
    if (isEdit.value) {
      await api.request(`/api/app/admin/reservations/${props.reservation!.id}`, { method: 'PATCH', body: { ...body, status: form.status } })
      toast.success('Reservasi diperbarui.')
    } else {
      await api.request('/api/app/admin/reservations', { method: 'POST', body: { ...body, gift_id: form.gift_id } })
      toast.success('Reservasi ditambahkan.')
    }
    emit('saved')
    emit('close')
  } catch (err) {
    error.value = errorMessage(err, 'Reservasi gagal disimpan.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalDialog :open="open" :icon="ListChecks" :title="isEdit ? 'Ubah reservasi' : 'Tambah reservasi'" :subtitle="isEdit ? reservation?.gift_name : 'Untuk tamu yang memesan di luar undangan (mis. lewat telepon).'" :closable="!saving" @close="emit('close')">
    <form id="reservation-form" class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <template v-if="!isEdit">
        <div v-if="!invitationId" class="field">
          <label for="rf-inv" class="field-label">Undangan</label>
          <select id="rf-inv" v-model="form.invitation_id" class="select">
            <option value="">Pilih undangan</option>
            <option v-for="i in invitations" :key="i.id" :value="i.id">{{ i.title || 'Tanpa judul' }}{{ i.website_name ? ` — ${i.website_name}` : '' }}</option>
          </select>
        </div>
        <div class="field">
          <label for="rf-gift" class="field-label">Hadiah</label>
          <select id="rf-gift" v-model="form.gift_id" class="select" :disabled="!form.invitation_id">
            <option value="">{{ form.invitation_id ? 'Pilih hadiah' : 'Pilih undangan dulu' }}</option>
            <option v-for="g in gifts" :key="g.id" :value="g.id" :disabled="g.available_quantity < 1">
              {{ g.name }} — {{ g.available_quantity > 0 ? `tersedia ${g.available_quantity}` : 'habis' }}
            </option>
          </select>
        </div>
      </template>
      <div class="grid gap-5 sm:grid-cols-2">
        <div class="field"><label for="rf-name" class="field-label">Nama tamu</label><input id="rf-name" v-model="form.guest_name" class="input" maxlength="100"></div>
        <div class="field"><label for="rf-wa" class="field-label">WhatsApp</label><input id="rf-wa" v-model="form.guest_whatsapp" class="input" inputmode="tel" placeholder="0812…"></div>
      </div>
      <div class="field"><label for="rf-msg" class="field-label">Pesan tamu (opsional)</label><textarea id="rf-msg" v-model="form.message" class="textarea" maxlength="1000" rows="3" /></div>
      <div v-if="isEdit" class="field">
        <label for="rf-status" class="field-label">Status</label>
        <select id="rf-status" v-model="form.status" class="select">
          <option value="confirmed">Terkonfirmasi</option>
          <option value="cancelled">Dibatalkan (stok kembali)</option>
        </select>
      </div>
      <div class="field"><label for="rf-note" class="field-label">Catatan admin (opsional, tidak terlihat pelanggan)</label><input id="rf-note" v-model="form.admin_note" class="input" maxlength="1000"></div>
      <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <button class="btn btn-secondary" type="button" :disabled="saving" @click="emit('close')">Batal</button>
      <AsyncButton type="submit" form="reservation-form" :loading="saving">Simpan</AsyncButton>
    </template>
  </ModalDialog>
</template>
