<script setup lang="ts">
import { Bell, BellOff } from 'lucide-vue-next'
import type { NotificationItem } from '~/composables/useNotifications'

// Lonceng di topbar: angka belum dibaca (seketika lewat Realtime; cadangan tiap 60 detik saat tab terlihat) + panel 6 notifikasi terbaru.
const api = useApi()
const toast = useToast()
const { unread, tick, refresh, markRead, startRealtime, stopRealtime } = useNotifications()
const auth = useAuth()
const open = ref(false)
const loading = ref(false)
const items = ref<NotificationItem[]>([])
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const panelId = useId()

async function loadLatest() {
  loading.value = true
  try {
    const res = await api.request<{ items: NotificationItem[]; unread: number }>('/api/app/notifications', { query: { per_page: 6 } })
    items.value = res.items
    unread.value = res.unread
  } catch (err) {
    toast.error(errorMessage(err, 'Notifikasi gagal dimuat.'))
  } finally {
    loading.value = false
  }
}
function toggle() { open.value = !open.value; if (open.value) void loadLatest() }
async function openItem(n: NotificationItem) {
  open.value = false
  if (!n.read_at) { n.read_at = new Date().toISOString(); void markRead([n.id]).catch(() => {}) }
  if (n.link) await navigateTo(n.link)
}
async function readAll() {
  try {
    await markRead('all')
    items.value = items.value.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
  } catch (err) {
    toast.error(errorMessage(err, 'Gagal menandai notifikasi.'))
  }
}

let timer: ReturnType<typeof setInterval> | undefined
function onVisible() { if (!document.hidden) void refresh() }
function onDocDown(e: PointerEvent) { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
function onKey(e: KeyboardEvent) { if (open.value && e.key === 'Escape') { open.value = false; button.value?.focus() } }
onMounted(() => {
  void refresh()
  startRealtime()
  timer = setInterval(() => { if (!document.hidden) void refresh() }, 60_000)
  document.addEventListener('visibilitychange', onVisible)
  document.addEventListener('pointerdown', onDocDown)
  document.addEventListener('keydown', onKey)
})
// Akun berganti (keluar/masuk) → langganan Realtime mengikuti akun aktif.
watch(() => auth.me.value?.id, (id) => { if (id) startRealtime(); else stopRealtime() })
// Panel terbuka saat notifikasi baru datang → muat ulang daftar terbaru.
watch(tick, () => { if (open.value) void loadLatest() })
onBeforeUnmount(() => {
  stopRealtime()
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
  document.removeEventListener('pointerdown', onDocDown)
  document.removeEventListener('keydown', onKey)
})
const route = useRoute()
watch(() => route.fullPath, () => { open.value = false })
const label = computed(() => (unread.value ? `Notifikasi, ${unread.value} belum dibaca` : 'Notifikasi'))
</script>

<template>
  <div ref="root" class="bell">
    <button ref="button" class="bell-btn" type="button" :aria-label="label" aria-haspopup="true" :aria-expanded="open" :aria-controls="panelId" data-testid="notif-bell" @click="toggle">
      <Bell :size="19" aria-hidden="true" />
      <span v-if="unread" class="bell-count" aria-hidden="true">{{ unread > 99 ? '99+' : unread }}</span>
    </button>
    <div v-if="open" :id="panelId" class="panel" role="dialog" aria-label="Notifikasi terbaru">
      <div class="panel-head">
        <div>
          <p class="panel-title">Notifikasi</p>
          <p class="text-caption">{{ unread ? `${unread} belum dibaca` : 'Semua sudah dibaca' }}</p>
        </div>
        <button v-if="unread" class="link-btn" type="button" @click="readAll">Tandai semua dibaca</button>
      </div>
      <LoadingRows v-if="loading && !items.length" :rows="3" />
      <div v-else-if="!items.length" class="panel-empty">
        <BellOff :size="22" aria-hidden="true" />
        <p>Belum ada notifikasi.</p>
      </div>
      <ul v-else class="panel-list">
        <li v-for="n in items" :key="n.id">
          <button class="panel-item" type="button" @click="openItem(n)"><NotificationRow :item="n" compact /></button>
        </li>
      </ul>
      <NuxtLink to="/notifikasi" class="panel-foot" @click="open = false">Lihat semua notifikasi</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.bell { position: relative; }
.bell-btn { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--r); background: none; border: 0; color: var(--n-600); cursor: pointer; }
.bell-btn:hover, .bell-btn[aria-expanded='true'] { background: var(--bg-hover); color: var(--text-heading); }
.bell-count {
  position: absolute; top: 4px; right: 3px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; border: 2px solid var(--bg-surface);
  background: var(--brand); color: var(--text-inverse); font-size: 10px; font-weight: var(--fw-medium); line-height: 14px; text-align: center;
}
.panel {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 60; width: 380px; max-width: calc(100vw - 2rem);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r); box-shadow: var(--sh-pop); overflow: hidden;
}
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; padding: 0.9rem 1rem; border-bottom: 1px solid var(--border); }
.panel-title { font-size: var(--fs-h3); font-weight: var(--fw-medium); color: var(--text-heading); }
.link-btn { background: none; border: 0; padding: 0; font-size: var(--fs-caption); font-weight: var(--fw-medium); color: var(--brand); cursor: pointer; white-space: nowrap; }
.link-btn:hover { color: var(--brand-hover); }
.panel-list { list-style: none; margin: 0; padding: 0.35rem; max-height: 380px; overflow-y: auto; }
.panel-item { display: block; width: 100%; padding: 0.6rem 0.65rem; border: 0; border-radius: var(--r-sm); background: none; text-align: left; cursor: pointer; }
.panel-item:hover, .panel-item:focus-visible { background: var(--bg-subtle); }
.panel-empty { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; padding: 1.75rem 1rem; color: var(--text-muted); font-size: var(--fs-label); }
.panel-foot { display: block; padding: 0.75rem 1rem; border-top: 1px solid var(--border); text-align: center; font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--brand); background: var(--bg-subtle); }
.panel-foot:hover { color: var(--brand-hover); }
@media (max-width: 640px) { .panel { position: fixed; top: calc(var(--topbar-h) + 6px); left: 1rem; right: 1rem; width: auto; max-width: none; } }
</style>
