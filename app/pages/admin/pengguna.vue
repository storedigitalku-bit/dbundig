<script setup lang="ts">
import { ArrowLeft, ArrowRight, Gift, KeyRound, Pencil, Trash2, UserPlus, UserRound, Users } from 'lucide-vue-next'
import { formatWhatsapp, normalizeWhatsapp } from '../../../shared/whatsapp'
import WhatsAppIcon from '../../components/WhatsAppIcon.vue'

definePageMeta({ admin: true })
useHead({ title: 'Pengguna & Akses — MDUNDIG' })

interface UserRow { id: string; username: string | null; email: string; display_name: string; role: 'admin' | 'customer'; created_at: string; whatsapp?: string | null; whatsapp_sent_at?: string | null; access_count?: number; access_title?: string | null; access_invitation_id?: string | null }
interface InvitationOption { id: string; title: string; website_name: string | null; access_count?: number; mapped_user_count?: number }

const api = useApi()
const toast = useToast()
const auth = useAuth()
const q = ref('')
const filters = computed(() => ({ q: q.value || undefined }))
const users = usePagedList<UserRow>('/api/app/admin/users', filters, 50)
const label = (u: { username?: string | null; display_name?: string; email?: string }) =>
  [u.username, u.display_name].filter(Boolean).join(' — ') || u.email || '—'

// Semua undangan yang tercatat dari WordPress (dimuat per 100) sebagai pilihan akses.
const invitations = ref<InvitationOption[]>([])
const invitationsLoading = ref(false)
let invitationsLoaded = false
async function loadInvitations(force = false) {
  if ((invitationsLoaded && !force) || invitationsLoading.value) return
  invitationsLoading.value = true
  try {
    const all: InvitationOption[] = []
    for (let page = 1; page <= 50; page++) {
      const res = await api.request<{ items: InvitationOption[]; total: number }>('/api/app/invitations', { query: { per_page: 100, page } })
      all.push(...res.items)
      if (all.length >= res.total || !res.items.length) break
    }
    invitations.value = all
    invitationsLoaded = true
  } catch (err) {
    toast.error(errorMessage(err, 'Daftar undangan gagal dimuat.'))
  } finally {
    invitationsLoading.value = false
  }
}
onMounted(() => { void users.load(); void useWaTemplates().load() })

// Akses 1:1: undangan yang sudah dipegang akun lain (akses eksplisit atau pemetaan otomatis) tidak bisa dipilih.
function takenFor(exceptUserId: string | null): Record<string, string> {
  const holders = new Map<string, string>()
  for (const u of users.items.value) {
    if (u.access_invitation_id && u.id !== exceptUserId) holders.set(u.access_invitation_id, u.username || u.display_name || 'akun lain')
  }
  const own = exceptUserId ? users.items.value.find((u) => u.id === exceptUserId)?.access_invitation_id : null
  const taken: Record<string, string> = {}
  for (const i of invitations.value) {
    if (i.id === own) continue
    const holder = holders.get(i.id)
    if (holder) taken[i.id] = holder
    else if (i.mapped_user_count) taken[i.id] = 'pemetaan otomatis'
    else if (i.access_count) taken[i.id] = 'akun lain'
  }
  return taken
}

// Status kirim akses lewat WhatsApp (biru = belum, abu-abu = sudah; tetap bisa dikirim ulang).
async function markSent(userId: string, phone: string) {
  try {
    const res = await api.request<{ whatsapp: string; whatsapp_sent_at: string }>(`/api/app/admin/users/${userId}/whatsapp-sent`, { method: 'POST', body: { whatsapp: phone } })
    const row = users.items.value.find((u) => u.id === userId)
    if (row) Object.assign(row, res)
  } catch (err) {
    toast.error(errorMessage(err, 'Status kirim WhatsApp gagal disimpan.'))
  }
}
const waTarget = ref<UserRow | null>(null)
function openWa(u: UserRow) { waTarget.value = u; void loadInvitations() }
const waSender = computed(() => invitations.value.find((i) => i.id === waTarget.value?.access_invitation_id)?.website_name ?? null)
async function resetBeforeSend(input: { password: string | null }) {
  if (!waTarget.value || !input.password) return
  await api.request(`/api/app/admin/users/${waTarget.value.id}/password`, { method: 'POST', body: { password: input.password } })
  toast.success('Password diperbarui.')
}

// ---- 1. Akun
const createOpen = ref(false)
const account = reactive({ username: '', display_name: '', email: '', whatsapp: '', password: '', confirm: '', invitation_ids: [] as string[] })
const creating = ref(false)
const createError = ref('')
// Tambah akun tiga langkah: 1) data akun, 2) akses undangan (opsional), 3) kirim akses lewat WhatsApp.
const createStep = ref<1 | 2 | 3>(1)
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
const WA_INVALID = 'Nomor WhatsApp tidak valid. Gunakan nomor aktif, mis. 0812-3456-7890 atau +62 812 3456 7890.'
// Data untuk pesan akses (password hanya disimpan di memori selama modal terbuka).
interface AccessShare { name: string; username: string; password: string; whatsapp: string | null; invitationTitle: string | null; sender: string | null }
const created = ref<AccessShare | null>(null)
const createdId = ref('')
function openCreate() { createError.value = ''; createStep.value = 1; created.value = null; createOpen.value = true; void loadInvitations(true) }
function closeCreate() {
  createOpen.value = false
  created.value = null
  createStep.value = 1
}
function nextStep() {
  createError.value = ''
  if (!USERNAME_RE.test(account.username.trim().toLowerCase())) { createError.value = 'Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.'; return }
  if (!account.whatsapp.trim()) { createError.value = 'Nomor WhatsApp wajib diisi untuk mengirim akses akun ke pelanggan.'; return }
  if (!normalizeWhatsapp(account.whatsapp)) { createError.value = WA_INVALID; return }
  createError.value = passwordError(account.password, account.confirm)
  if (createError.value) return
  createStep.value = 2
}
async function createAccount() {
  if (creating.value) return
  if (createStep.value === 1) { nextStep(); return }
  createError.value = passwordError(account.password, account.confirm)
  if (createError.value) { createStep.value = 1; return }
  creating.value = true
  try {
    const res = await api.request<{ id: string; username: string; whatsapp: string | null; granted: number; access_failed: boolean }>('/api/app/admin/users', {
      method: 'POST', body: { username: account.username, display_name: account.display_name, email: account.email, whatsapp: account.whatsapp, password: account.password, invitation_ids: account.invitation_ids },
    })
    if (res.access_failed) toast.error(`Akun ${res.username} dibuat, tetapi akses undangan gagal disimpan. Atur lewat tombol Akses.`)
    else toast.success(res.granted ? `Akun ${res.username} dibuat dan dapat melihat undangan yang dipilih.` : `Akun ${res.username} dibuat. Atur undangannya lewat tombol Akses.`)
    const inv = res.granted ? invitations.value.find((i) => i.id === account.invitation_ids[0]) : undefined
    createdId.value = res.id
    created.value = {
      name: account.display_name.trim() || res.username, username: res.username, password: account.password,
      whatsapp: res.whatsapp ?? normalizeWhatsapp(account.whatsapp), invitationTitle: inv?.title ?? null, sender: inv?.website_name ?? null,
    }
    createStep.value = 3
    Object.assign(account, { username: '', display_name: '', email: '', whatsapp: '', password: '', confirm: '', invitation_ids: [] })
    await users.load()
  } catch (err) {
    createError.value = errorMessage(err, 'Akun gagal dibuat.')
    // Kesalahan data akun (mis. username/email sudah dipakai) diperbaiki di langkah 1.
    if (/username|email|password|whatsapp/i.test(createError.value)) createStep.value = 1
  } finally {
    creating.value = false
  }
}
const resetTarget = ref<UserRow | null>(null)
const newPassword = ref('')
const resetting = ref(false)
const resetError = ref('')
const resetShare = ref<AccessShare | null>(null)
function openReset(u: UserRow) { resetTarget.value = u; newPassword.value = ''; resetError.value = ''; resetShare.value = null }
function closeReset() { resetTarget.value = null; resetShare.value = null; newPassword.value = '' }
async function resetPassword() {
  if (!resetTarget.value || resetting.value) return
  resetError.value = passwordError(newPassword.value)
  if (resetError.value) return
  resetting.value = true
  try {
    await api.request(`/api/app/admin/users/${resetTarget.value.id}/password`, { method: 'POST', body: { password: newPassword.value } })
    const u = resetTarget.value
    u.whatsapp_sent_at = null
    toast.success('Password diperbarui. Kirim akses terbaru kepada pengguna.')
    // Lanjut ke kirim akses lewat WhatsApp (username + password baru + tautan masuk).
    resetShare.value = {
      name: u.display_name || u.username || u.email, username: u.username || u.email, password: newPassword.value,
      whatsapp: u.whatsapp ?? null, invitationTitle: u.role === 'customer' ? (u.access_title ?? null) : null, sender: null,
    }
    newPassword.value = ''
  } catch (err) {
    resetError.value = errorMessage(err, 'Password gagal diperbarui.')
  } finally {
    resetting.value = false
  }
}

// ---- Ubah & hapus akun
const editTarget = ref<UserRow | null>(null)
const editForm = reactive({ username: '', display_name: '', email: '', whatsapp: '', role: 'customer' as 'admin' | 'customer' })
const editSaving = ref(false)
const editError = ref('')
const isSelf = (u: UserRow | null) => !!u && u.id === auth.me.value?.id
function openEditUser(u: UserRow) {
  editTarget.value = u
  editError.value = ''
  Object.assign(editForm, { username: u.username ?? '', display_name: u.display_name, email: u.email, whatsapp: formatWhatsapp(u.whatsapp), role: u.role })
}
async function saveUser() {
  if (!editTarget.value || editSaving.value) return
  editError.value = editForm.whatsapp.trim() && !normalizeWhatsapp(editForm.whatsapp) ? WA_INVALID : ''
  if (editError.value) return
  editSaving.value = true
  try {
    const self = isSelf(editTarget.value)
    const body: Record<string, unknown> = { username: editForm.username, display_name: editForm.display_name, email: editForm.email, whatsapp: editForm.whatsapp }
    if (!self) body.role = editForm.role
    await api.request(`/api/app/admin/users/${editTarget.value.id}`, { method: 'PATCH', body })
    toast.success('Akun diperbarui.')
    editTarget.value = null
    await users.load()
    if (self) await auth.loadMe()
  } catch (err) {
    editError.value = errorMessage(err, 'Akun gagal diperbarui.')
  } finally {
    editSaving.value = false
  }
}
const deleteUser = ref<UserRow | null>(null)
const deletingUser = ref(false)
async function confirmDeleteUser() {
  if (!deleteUser.value || deletingUser.value) return
  deletingUser.value = true
  try {
    await api.request(`/api/app/admin/users/${deleteUser.value.id}`, { method: 'DELETE' })
    toast.success('Akun dihapus.')
    deleteUser.value = null
    await users.load()
  } catch (err) {
    deleteUser.value = null
    toast.error(errorMessage(err, 'Akun gagal dihapus.'))
  } finally {
    deletingUser.value = false
  }
}

// ---- Atur akses undangan per akun pelanggan
const accessTarget = ref<UserRow | null>(null)
const accessIds = ref<string[]>([])
const accessLoading = ref(false)
const accessSaving = ref(false)
const accessError = ref('')
async function openAccess(u: UserRow) {
  accessTarget.value = u
  accessIds.value = []
  accessError.value = ''
  accessLoading.value = true
  try {
    const [res] = await Promise.all([
      api.request<{ invitation_ids: string[] }>(`/api/app/admin/users/${u.id}/access`),
      loadInvitations(true),
    ])
    accessIds.value = res.invitation_ids
  } catch (err) {
    accessError.value = errorMessage(err, 'Akses akun gagal dimuat.')
  } finally {
    accessLoading.value = false
  }
}
async function saveAccess() {
  if (!accessTarget.value || accessSaving.value || accessLoading.value) return
  accessSaving.value = true
  accessError.value = ''
  try {
    const res = await api.request<{ granted: number; revoked: number; total: number }>(`/api/app/admin/users/${accessTarget.value.id}/access`, {
      method: 'PUT', body: { invitation_ids: accessIds.value },
    })
    toast.success(!res.granted && !res.revoked ? 'Tidak ada perubahan akses.' : res.total ? 'Akses undangan disimpan.' : 'Akses undangan dicabut.')
    accessTarget.value = null
    await users.load()
  } catch (err) {
    accessError.value = errorMessage(err, 'Akses gagal disimpan.')
  } finally {
    accessSaving.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Pengguna &amp; Akses</h1><p class="text-caption">Buat akun pelanggan dan atur undangan yang boleh mereka lihat dan unduh.</p></div>
      <button class="btn btn-primary" type="button" @click="openCreate"><UserPlus :size="16" /> Tambah akun</button>
    </div>

    <!-- 1. Akun -->
    <section class="card" aria-labelledby="users-title">
      <div class="card-header">
        <div>
          <h2 id="users-title" class="flex items-center gap-2"><Users :size="18" /> Akun</h2>
          <p class="text-caption">Akun admin &amp; pelanggan yang dapat masuk ke MDUNDIG</p>
        </div>
        <span v-if="users.total.value" class="badge">{{ users.total.value }} akun</span>
      </div>
      <div class="card-body border-b border-line"><SearchInput v-model="q" label="Cari akun" placeholder="Cari username, nama, atau email" /></div>
      <p v-if="users.error.value" class="alert tone-err m-5" role="alert">{{ users.error.value }}</p>
      <LoadingRows v-if="users.loading.value && !users.items.value.length" :rows="3" />
      <EmptyState v-else-if="!users.items.value.length" title="Belum ada akun" />
      <div v-else class="table-wrap" tabindex="0" role="region" aria-label="Tabel akun">
        <table v-stack class="table table-stack">
          <thead><tr><th scope="col">Username</th><th scope="col">Nama</th><th scope="col">Kontak</th><th scope="col">Peran</th><th scope="col">Undangan</th><th scope="col">Dibuat</th><th scope="col"><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            <tr v-for="u in users.items.value" :key="u.id">
              <td class="cell-strong text-mono whitespace-nowrap cell-primary">{{ u.username || '—' }}</td>
              <td>{{ u.display_name || '—' }}</td>
              <td>
                <span v-if="u.whatsapp" class="block whitespace-nowrap text-mono">{{ formatWhatsapp(u.whatsapp) }}</span>
                <span v-if="u.email" class="block text-caption contact-email" :title="u.email">{{ u.email }}</span>
                <span v-if="!u.whatsapp && !u.email">—</span>
              </td>
              <td><span class="badge">{{ u.role === 'admin' ? 'Admin platform' : 'Pelanggan' }}</span></td>
              <td class="whitespace-nowrap">
                <span v-if="u.role === 'admin'" class="text-caption">Semua</span>
                <span v-else-if="u.access_count" class="access-title" :title="u.access_title || ''">{{ u.access_title || 'Tanpa judul' }}</span>
                <span v-else class="text-caption">Belum ada</span>
              </td>
              <td class="whitespace-nowrap">{{ formatDate(u.created_at) }}</td>
              <td class="cell-actions">
                <div class="flex gap-1 justify-end">
                  <button v-if="u.role === 'customer'" class="btn btn-secondary btn-sm" type="button" :aria-label="`Atur akses undangan ${u.username || u.email}`" @click="openAccess(u)"><Gift :size="15" /> Akses</button>
                  <button v-if="u.role === 'customer'" class="btn btn-ghost btn-sm btn-icon wa-btn" :class="{ unsent: !u.whatsapp_sent_at }" type="button"
                    :title="u.whatsapp_sent_at ? `Akses terkirim ${formatDateTime(u.whatsapp_sent_at)} — klik untuk kirim ulang` : 'Akses belum dikirim lewat WhatsApp'"
                    :aria-label="`Kirim akses lewat WhatsApp ${u.username || u.email}`" :data-sent="u.whatsapp_sent_at ? 'ya' : 'belum'" @click="openWa(u)"><WhatsAppIcon :size="16" /></button>
                  <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Ubah akun" :aria-label="`Ubah akun ${u.username || u.email}`" @click="openEditUser(u)"><Pencil :size="15" /></button>
                  <button class="btn btn-ghost btn-sm btn-icon" type="button" title="Atur ulang password" :aria-label="`Atur ulang password ${u.username || u.email}`" @click="openReset(u)"><KeyRound :size="15" /></button>
                  <button v-if="!isSelf(u)" class="btn btn-danger-ghost btn-sm btn-icon" type="button" title="Hapus akun" :aria-label="`Hapus akun ${u.username || u.email}`" @click="deleteUser = u"><Trash2 :size="15" /></button>
                  <span v-else class="btn-icon btn-sm inline-block" aria-hidden="true" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar :page="users.page.value" :per-page="users.perPage" :total="users.total.value" :disabled="users.loading.value" @change="users.setPage" />
    </section>

    <ModalDialog :open="createOpen" :icon="UserPlus" title="Tambah akun pelanggan" subtitle="Akun langsung aktif. Setelah dibuat, akses akun dapat langsung dikirim ke WhatsApp pelanggan." :closable="!creating" @close="closeCreate">
      <ol class="steps" aria-label="Langkah tambah akun">
        <li :class="{ active: createStep === 1, done: createStep > 1 }" :aria-current="createStep === 1 ? 'step' : undefined"><span class="step-icon"><UserRound :size="16" /></span><span>1. Data akun</span></li>
        <li :class="{ active: createStep === 2, done: createStep > 2 }" :aria-current="createStep === 2 ? 'step' : undefined"><span class="step-icon"><Gift :size="16" /></span><span>2. Akses</span></li>
        <li :class="{ active: createStep === 3 }" :aria-current="createStep === 3 ? 'step' : undefined"><span class="step-icon"><WhatsAppIcon :size="16" /></span><span>3. Kirim akses</span></li>
      </ol>
      <WhatsAppAccessPanel v-if="createStep === 3 && created" v-bind="created" @sent="markSent(createdId, $event)" />
      <form v-else id="account-form" class="flex flex-col gap-5" autocomplete="off" novalidate @submit.prevent="createAccount">
        <template v-if="createStep === 1">
          <div class="field">
            <label for="a-username" class="field-label">Username</label>
            <input id="a-username" v-model="account.username" class="input text-mono" maxlength="32" autocapitalize="none" spellcheck="false" required>
            <p class="field-hint">3–32 karakter: huruf kecil, angka, titik, garis bawah, tanda hubung.</p>
          </div>
          <div class="grid gap-5 sm:grid-cols-2">
            <div class="field"><label for="a-name" class="field-label">Nama tampilan (opsional)</label><input id="a-name" v-model="account.display_name" class="input" maxlength="120"></div>
            <div class="field"><label for="a-email" class="field-label">Email (opsional)</label><input id="a-email" v-model="account.email" class="input" type="email"></div>
          </div>
          <div class="field">
            <label for="a-wa" class="field-label">Nomor WhatsApp aktif</label>
            <input id="a-wa" v-model="account.whatsapp" class="input" inputmode="tel" autocomplete="off" placeholder="0812-3456-7890" required>
            <p class="field-hint">Wajib. Dipakai untuk mengirim username, password, dan tautan masuk ke pelanggan.</p>
          </div>
          <div class="field">
            <div class="grid gap-5 sm:grid-cols-2">
              <div class="field"><label for="a-pw" class="field-label">Password</label><input id="a-pw" v-model="account.password" class="input" type="password" autocomplete="new-password" required></div>
              <div class="field"><label for="a-pw2" class="field-label">Ulangi password</label><input id="a-pw2" v-model="account.confirm" class="input" type="password" autocomplete="new-password" required></div>
            </div>
            <p class="field-hint" data-testid="password-rule">{{ PASSWORD_RULE }}</p>
          </div>
        </template>
        <fieldset v-else class="field">
          <legend class="field-label">Undangan untuk akun ini <span class="text-caption">(pilih satu; opsional — bisa diatur nanti lewat tombol Akses)</span></legend>
          <InvitationPicker v-model="account.invitation_ids" :options="invitations" :taken="takenFor(null)" :loading="invitationsLoading" id-prefix="new-inv" />
        </fieldset>
        <p v-if="createError" class="alert tone-err" role="alert">{{ createError }}</p>
      </form>
      <template v-if="createStep !== 3" #footer>
        <button v-if="createStep === 1" class="btn btn-secondary" type="button" :disabled="creating" @click="closeCreate">Batal</button>
        <button v-else class="btn btn-secondary" type="button" :disabled="creating" @click="createStep = 1; createError = ''"><ArrowLeft :size="16" /> Kembali</button>
        <button v-if="createStep === 1" class="btn btn-primary" type="submit" form="account-form">Berikutnya <ArrowRight :size="16" /></button>
        <AsyncButton v-else type="submit" form="account-form" :loading="creating"><UserPlus :size="16" /> Buat akun</AsyncButton>
      </template>
    </ModalDialog>

    <ModalDialog :open="!!editTarget" :icon="Pencil" title="Ubah akun" :subtitle="editTarget ? label(editTarget) : ''" :closable="!editSaving" @close="editTarget = null">
      <form id="edit-user-form" class="flex flex-col gap-5" novalidate @submit.prevent="saveUser">
        <div class="field">
          <label for="e-username" class="field-label">Username</label>
          <input id="e-username" v-model="editForm.username" class="input text-mono" maxlength="32" autocapitalize="none" spellcheck="false">
        </div>
        <div class="field"><label for="e-name" class="field-label">Nama tampilan</label><input id="e-name" v-model="editForm.display_name" class="input" maxlength="120"></div>
        <div class="field">
          <label for="e-email" class="field-label">Email (opsional)</label>
          <input id="e-email" v-model="editForm.email" class="input" type="email">
        </div>
        <div class="field">
          <label for="e-wa" class="field-label">Nomor WhatsApp</label>
          <input id="e-wa" v-model="editForm.whatsapp" class="input" inputmode="tel" autocomplete="off" placeholder="0812-3456-7890">
          <p class="field-hint">Dipakai untuk mengirim akses akun lewat WhatsApp.</p>
        </div>
        <div class="field">
          <label for="e-role" class="field-label">Peran</label>
          <select id="e-role" v-model="editForm.role" class="select" :disabled="isSelf(editTarget)">
            <option value="customer">Pelanggan — hanya Daftar Hadiah undangan yang diberi akses</option>
            <option value="admin">Admin platform — akses penuh</option>
          </select>
          <p v-if="isSelf(editTarget)" class="field-hint">Anda tidak dapat mengubah peran akun Anda sendiri.</p>
        </div>
        <p v-if="editError" class="alert tone-err" role="alert">{{ editError }}</p>
      </form>
      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="editSaving" @click="editTarget = null">Batal</button>
        <AsyncButton type="submit" form="edit-user-form" :loading="editSaving">Simpan</AsyncButton>
      </template>
    </ModalDialog>
    <ConfirmDialog :open="!!deleteUser" title="Hapus akun?" :loading="deletingUser"
      :message="deleteUser ? `Akun ${label(deleteUser)} dihapus permanen beserta akses undangannya. Data undangan dan reservasi tidak terhapus.` : ''"
      @close="deleteUser = null" @confirm="confirmDeleteUser" />
    <ModalDialog :open="!!accessTarget" :icon="Gift" title="Atur akses undangan" :subtitle="accessTarget ? `${label(accessTarget)} hanya melihat dan mengunduh satu undangan yang dipilih.` : ''"
      :closable="!accessSaving" @close="accessTarget = null">
      <form id="access-form" class="flex flex-col gap-4" novalidate data-testid="access-form" @submit.prevent="saveAccess">
        <InvitationPicker v-model="accessIds" :options="invitations" :taken="takenFor(accessTarget?.id ?? null)" :loading="accessLoading || invitationsLoading" id-prefix="acc-inv" />
        <p v-if="accessError" class="alert tone-err" role="alert">{{ accessError }}</p>
      </form>
      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="accessSaving" @click="accessTarget = null">Batal</button>
        <AsyncButton type="submit" form="access-form" :loading="accessSaving" :disabled="accessLoading">Simpan akses</AsyncButton>
      </template>
    </ModalDialog>
    <ModalDialog :open="!!waTarget" :icon="WhatsAppIcon" title="Kirim akses lewat WhatsApp"
      :subtitle="waTarget ? `${label(waTarget)} · ${waTarget.whatsapp_sent_at ? 'sudah dikirim, boleh dikirim ulang' : 'belum dikirim'}` : ''" @close="waTarget = null">
      <LoadingRows v-if="waTarget && invitationsLoading" :rows="3" />
      <WhatsAppAccessPanel v-else-if="waTarget" :key="waTarget.id" :name="waTarget.display_name || waTarget.username || waTarget.email" :username="waTarget.username || waTarget.email"
        :password="null" :whatsapp="waTarget.whatsapp ?? null" :invitation-title="waTarget.access_title ?? null" :sender="waSender"
        :sent-at="waTarget.whatsapp_sent_at ?? null" :before-send="resetBeforeSend" @sent="markSent(waTarget.id, $event)" />
    </ModalDialog>
    <ModalDialog :open="!!resetTarget" :icon="resetShare ? WhatsAppIcon : KeyRound" :title="resetShare ? 'Kirim akses terbaru' : 'Atur ulang password'"
      :subtitle="resetShare ? `Password ${label(resetTarget!)} sudah diganti. Kirim akses terbaru lewat WhatsApp.` : resetTarget ? `${label(resetTarget)} · setelah disimpan, akses baru dapat dikirim lewat WhatsApp.` : ''"
      :size="resetShare ? 'md' : 'sm'" :closable="!resetting" @close="closeReset">
      <WhatsAppAccessPanel v-if="resetShare && resetTarget" v-bind="resetShare" @sent="markSent(resetTarget.id, $event)" />
      <form v-else id="reset-form" class="flex flex-col gap-4" novalidate @submit.prevent="resetPassword">
        <div class="field">
          <label for="r-pw" class="field-label">Password baru</label>
          <input id="r-pw" v-model="newPassword" class="input" type="password" autocomplete="new-password" required>
          <p class="field-hint">{{ PASSWORD_RULE }}</p>
        </div>
        <p v-if="resetError" class="alert tone-err" role="alert">{{ resetError }}</p>
      </form>
      <template v-if="!resetShare" #footer>
        <button class="btn btn-secondary" type="button" :disabled="resetting" @click="closeReset">Batal</button>
        <AsyncButton type="submit" form="reset-form" :loading="resetting">Simpan password</AsyncButton>
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
.contact-email { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.access-title { display: inline-block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; color: var(--text-heading); }
.steps { display: flex; gap: 0.5rem; list-style: none; margin: 0 0 1.25rem; padding: 0; }
.steps li { flex: 1; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--r); font-size: var(--fs-label); color: var(--text-muted); }
.steps li.active { border-color: var(--brand); color: var(--text-heading); font-weight: var(--fw-medium); }
.steps li.done { color: var(--text-body); }
.step-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--r-sm); background: var(--n-100); color: var(--n-500); flex-shrink: 0; }
.steps li.active .step-icon, .steps li.done .step-icon { color: var(--brand); background: color-mix(in srgb, var(--brand) 10%, transparent); }
/* Ponsel: ikon di atas teks agar label langkah tetap satu baris. */
@media (max-width: 640px) {
  .steps li { flex-direction: column; justify-content: center; gap: 0.35rem; padding: 0.55rem 0.25rem; text-align: center; white-space: nowrap; font-size: var(--fs-caption); }
}
fieldset.field { border: 0; margin: 0; padding: 0; min-width: 0; }
.wa-btn { position: relative; color: var(--text-muted); }
.wa-btn.unsent { color: var(--brand); }
.wa-btn.unsent::after { content: ''; position: absolute; top: 3px; right: 3px; width: 7px; height: 7px; border-radius: 999px; background: var(--brand); box-shadow: 0 0 0 2px var(--surface, #fff); }
</style>
