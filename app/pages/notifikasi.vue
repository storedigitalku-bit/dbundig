<script setup lang="ts">
import { Bell, BellOff, Check, CheckCheck, Trash2 } from 'lucide-vue-next'
import type { NotificationItem } from '~/composables/useNotifications'

useHead({ title: 'Notifikasi — MDUNDIG' })
const api = useApi()
const toast = useToast()
const auth = useAuth()
const { unread, refresh, markRead } = useNotifications()
const view = ref<'all' | 'unread'>('all')
const kind = ref('')
const filters = computed(() => ({ unread: view.value === 'unread' ? '1' : undefined, kind: kind.value || undefined }))
const list = usePagedList<NotificationItem>('/api/app/notifications', filters, 20)
onMounted(async () => { await list.load(); void refresh() })
// Notifikasi baru (Realtime) → daftar langsung diperbarui.
const { tick } = useNotifications()
watch(tick, () => { void list.load() })

async function open(n: NotificationItem) {
  if (!n.read_at) {
    n.read_at = new Date().toISOString()
    void markRead([n.id]).catch(() => {})
  }
  if (n.link) await navigateTo(n.link)
}
async function readOne(n: NotificationItem) {
  try {
    await markRead([n.id])
    n.read_at = new Date().toISOString()
    if (view.value === 'unread') await list.load()
  } catch (err) {
    toast.error(errorMessage(err, 'Gagal menandai notifikasi.'))
  }
}
const busyAll = ref(false)
async function readAll() {
  if (busyAll.value) return
  busyAll.value = true
  try {
    await markRead('all')
    toast.success('Semua notifikasi ditandai dibaca.')
    await list.load()
  } catch (err) {
    toast.error(errorMessage(err, 'Gagal menandai notifikasi.'))
  } finally {
    busyAll.value = false
  }
}
const removing = ref('')
async function removeOne(n: NotificationItem) {
  if (removing.value) return
  removing.value = n.id
  try {
    await api.request('/api/app/notifications/delete', { method: 'POST', body: { ids: [n.id] } })
    toast.success('Notifikasi dihapus.')
    await Promise.all([list.load(), refresh()])
  } catch (err) {
    toast.error(errorMessage(err, 'Notifikasi gagal dihapus.'))
  } finally {
    removing.value = ''
  }
}
// Hapus massal: 'read' = yang sudah dibaca, 'all' = semuanya (termasuk yang belum dibaca).
const clearMode = ref<'' | 'read' | 'all'>('')
const clearing = ref(false)
async function clearNotifications() {
  if (clearing.value || !clearMode.value) return
  clearing.value = true
  try {
    const all = clearMode.value === 'all'
    const res = await api.request<{ deleted: number }>('/api/app/notifications/delete', { method: 'POST', body: all ? { all: true } : { read: true } })
    toast.success(res.deleted ? `${res.deleted} notifikasi dihapus.` : all ? 'Tidak ada notifikasi.' : 'Tidak ada notifikasi yang sudah dibaca.')
    clearMode.value = ''
    await Promise.all([list.load(), refresh()])
  } catch (err) {
    toast.error(errorMessage(err, 'Notifikasi gagal dihapus.'))
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Notifikasi</h1>
        <p class="text-caption">{{ auth.isAdmin.value ? 'Order undangan dan reservasi hadiah yang baru masuk dari semua undangan.' : 'Reservasi hadiah baru pada undangan Anda.' }}</p>
      </div>
      <AsyncButton variant="secondary" :loading="busyAll" :disabled="!unread" @click="readAll"><CheckCheck :size="16" /> Tandai semua dibaca</AsyncButton>
    </div>

    <section class="card" aria-labelledby="notif-title">
      <div class="card-header">
        <div>
          <h2 id="notif-title" class="flex items-center gap-2"><Bell :size="18" /> Semua notifikasi</h2>
          <p class="text-caption">Klik notifikasi untuk membuka datanya</p>
        </div>
        <span class="badge">{{ unread }} belum dibaca</span>
      </div>
      <div class="card-body control-row border-b border-line">
        <div class="seg" role="group" aria-label="Tampilkan">
          <button type="button" :class="{ on: view === 'all' }" :aria-pressed="view === 'all'" @click="view = 'all'">Semua</button>
          <button type="button" :class="{ on: view === 'unread' }" :aria-pressed="view === 'unread'" @click="view = 'unread'">Belum dibaca</button>
        </div>
        <div v-if="auth.isAdmin.value" class="w-full sm:w-52 sm:ml-auto">
          <label for="n-kind" class="sr-only">Jenis notifikasi</label>
          <select id="n-kind" v-model="kind" class="select">
            <option value="">Semua jenis</option>
            <option value="order">Order undangan</option>
            <option value="reservation">Reservasi hadiah</option>
          </select>
        </div>
      </div>

      <p v-if="list.error.value" class="alert tone-err m-5" role="alert">{{ list.error.value }}</p>
      <LoadingRows v-if="list.loading.value && !list.items.value.length" :rows="4" />
      <EmptyState v-else-if="!list.items.value.length" :icon="BellOff"
        :title="view === 'unread' ? 'Semua sudah dibaca' : 'Belum ada notifikasi'"
        :description="auth.isAdmin.value ? 'Notifikasi muncul saat ada order undangan atau reservasi hadiah baru.' : 'Notifikasi muncul saat tamu memilih hadiah di undangan Anda.'" />
      <ul v-else class="notif-list" aria-label="Daftar notifikasi">
        <li v-for="n in list.items.value" :key="n.id" class="notif-item" :class="{ unread: !n.read_at }">
          <button class="notif-open" type="button" @click="open(n)"><NotificationRow :item="n" /></button>
          <div class="notif-actions">
            <button v-if="!n.read_at" class="quiet" type="button" title="Tandai dibaca" :aria-label="`Tandai dibaca: ${n.title}`" @click="readOne(n)"><Check :size="15" /></button>
            <button class="quiet quiet-danger" type="button" title="Hapus" :aria-label="`Hapus notifikasi: ${n.title}`" :disabled="removing === n.id" @click="removeOne(n)"><Trash2 :size="15" /></button>
          </div>
        </li>
      </ul>
      <div v-if="list.total.value > 0" class="list-foot">
        <PaginationBar :page="list.page.value" :per-page="list.perPage" :total="list.total.value" :disabled="list.loading.value" @change="list.setPage" />
        <span v-if="list.items.value.length" class="clear-links">
          <button class="clear-link" type="button" @click="clearMode = 'read'">Hapus yang sudah dibaca</button>
          <span aria-hidden="true">·</span>
          <button class="clear-link" type="button" @click="clearMode = 'all'">Hapus semua</button>
        </span>
      </div>
    </section>

    <ConfirmDialog :open="!!clearMode" :title="clearMode === 'all' ? 'Hapus semua notifikasi?' : 'Hapus notifikasi yang sudah dibaca?'" :loading="clearing"
      :confirm-label="clearMode === 'all' ? 'Hapus semua' : 'Hapus'"
      :message="clearMode === 'all' ? 'Semua notifikasi Anda dihapus, termasuk yang belum dibaca. Data order dan reservasi tidak ikut terhapus.' : 'Notifikasi yang belum dibaca tetap disimpan. Data order dan reservasi tidak ikut terhapus.'"
      @close="clearMode = ''" @confirm="clearNotifications" />
  </div>
</template>

<style scoped>
.seg { display: inline-flex; padding: 3px; border: 1px solid var(--border); border-radius: var(--r); background: var(--bg-subtle); }
.seg button { height: calc(var(--h-control) - 8px); padding: 0 0.9rem; border: 0; border-radius: var(--r-sm); background: none; font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-muted); cursor: pointer; }
.seg button.on { background: var(--bg-surface); color: var(--text-heading); box-shadow: var(--sh-card); }
.notif-list { list-style: none; margin: 0; padding: 0; }
.notif-item { position: relative; display: flex; align-items: center; gap: 0.5rem; padding: 0 1.25rem; border-bottom: 1px solid var(--border); }
.notif-item.unread { background: color-mix(in srgb, var(--brand) 3%, transparent); }
.notif-open { flex: 1; min-width: 0; padding: 0.85rem 0; border: 0; background: none; text-align: left; cursor: pointer; }
.notif-item:hover { background: var(--bg-subtle); }
/* Aksi baris sengaja tidak menonjol: abu-abu, muncul jelas saat baris disorot. */
.notif-actions { display: flex; gap: 0.15rem; opacity: 0.45; transition: opacity var(--dur) var(--ease); }
.notif-item:hover .notif-actions, .notif-actions:focus-within { opacity: 1; }
.quiet { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: var(--r-sm); background: none; color: var(--text-faint); cursor: pointer; }
.quiet:hover { background: var(--bg-hover); color: var(--text-heading); }
.quiet-danger:hover { color: var(--err); }
/* Footer kartu = satu area berpadding: paginasi di kiri, tautan hapus (sengaja tidak menonjol) di kanan; ponsel: bertumpuk di tengah. */
.list-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap; padding: 1rem 1.25rem; border-top: 1px solid var(--border); }
.list-foot :deep(.pager) { flex: 1; padding: 0; border-top: 0; }
.clear-links { display: inline-flex; align-items: center; gap: 0.5rem; font-size: var(--fs-caption); color: var(--text-faint); }
@media (max-width: 640px) {
  .list-foot { flex-direction: column; justify-content: center; }
  .list-foot :deep(.pager) { width: 100%; }
}
.clear-link { background: none; border: 0; padding: 0.5rem 0; font-size: var(--fs-caption); color: var(--text-faint); cursor: pointer; }
.clear-link:hover { color: var(--text-muted); text-decoration: underline; }
@media (hover: none) { .notif-actions { opacity: 1; } }
</style>
