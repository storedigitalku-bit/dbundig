<script setup lang="ts">
import { Bell, CalendarDays, ChevronRight, ClipboardList, Gift, Globe, History, LayoutDashboard, LayoutGrid, Link2, ListChecks, LogOut, MessageSquareText, User, Users, X } from 'lucide-vue-next'
import type { Component } from 'vue'

// Menu bawah ponsel (< 768px). Kapsul mengambang dengan "punuk" melengkung landai yang bergeser ke menu aktif;
// lingkaran biru berada di dalam punuk dengan jarak. Pelanggan: 5 menu langsung. Admin: 4 menu utama + "Lainnya"
// yang membuka lembar berkelompok (Pengaturan & Akun) berikut deskripsi singkat tiap menu.
interface NavItem { to: string; label: string; icon: Component; desc?: string }
const route = useRoute()
const auth = useAuth()
const { unread } = useNotifications()

const customerItems: NavItem[] = [
  { to: '/', label: 'Ringkasan', icon: LayoutDashboard },
  { to: '/daftar-hadiah', label: 'Undangan', icon: Gift },
  { to: '/daftar-hadiah/reservasi', label: 'Reservasi', icon: ListChecks },
  { to: '/notifikasi', label: 'Notifikasi', icon: Bell },
  { to: '/profil', label: 'Profil', icon: User },
]
const adminItems: NavItem[] = [
  { to: '/', label: 'Ringkasan', icon: LayoutDashboard },
  { to: '/daftar-hadiah', label: 'Hadiah', icon: Gift },
  { to: '/order-undangan', label: 'Order', icon: ClipboardList },
  { to: '/notifikasi', label: 'Notifikasi', icon: Bell },
]
const moreGroups: Array<{ title: string; items: NavItem[] }> = [
  { title: 'Data', items: [
    { to: '/kalender', label: 'Kalender Acara', icon: CalendarDays, desc: 'Akad, resepsi & ngunduh mantu dari order' },
  ] },
  { title: 'Pengaturan', items: [
    { to: '/admin/website', label: 'Website', icon: Globe, desc: 'Website WordPress yang terhubung' },
    { to: '/admin/koneksi', label: 'Koneksi', icon: Link2, desc: 'URL API & Token Website untuk plugin' },
    { to: '/admin/pengguna', label: 'Pengguna & Akses', icon: Users, desc: 'Akun pelanggan & undangan yang boleh dilihat' },
    { to: '/admin/pesan-whatsapp', label: 'Pesan WhatsApp', icon: MessageSquareText, desc: 'Template pesan akses & rekap reservasi' },
    { to: '/admin/riwayat', label: 'Riwayat & Error', icon: History, desc: 'Aktivitas admin & catatan error sistem' },
  ] },
  { title: 'Akun', items: [
    { to: '/profil', label: 'Profil', icon: User, desc: 'Data akun & ganti password' },
  ] },
]
const moreItems = moreGroups.flatMap((g) => g.items)
const isAdmin = computed(() => auth.isAdmin.value)
const slots = computed(() => (isAdmin.value ? adminItems.length + 1 : customerItems.length))

const isOn = (to: string) => route.path === to || route.path.startsWith(to + '/')
const active = computed(() => {
  const p = route.path
  if (p === '/') return 0
  if (!isAdmin.value) {
    if (p.startsWith('/daftar-hadiah/reservasi')) return 2
    if (isOn('/daftar-hadiah')) return 1
    if (isOn('/notifikasi')) return 3
    if (isOn('/profil')) return 4
    return -1
  }
  if (isOn('/daftar-hadiah')) return 1
  if (isOn('/order-undangan')) return 2
  if (isOn('/notifikasi')) return 3
  if (moreItems.some((m) => isOn(m.to))) return 4
  return -1
})
// Ikon di lingkaran: menu aktif; untuk "Lainnya" memakai ikon halaman yang sedang dibuka agar pengguna tahu posisinya.
const bubbleIcon = computed<Component | null>(() => {
  if (active.value < 0) return null
  if (isAdmin.value && active.value === 4) return moreItems.find((m) => isOn(m.to))?.icon ?? LayoutGrid
  return (isAdmin.value ? adminItems : customerItems)[active.value]!.icon
})
const bubbleKey = computed(() => (isAdmin.value && active.value === 4 ? route.path : String(active.value)))
// Punuk landai: tepi atas bar (y=36) naik halus melingkari lingkaran 54px (pusat 45,32) berjarak 7px.
const HUMP = 'M0 36 L1 36 C6 36 10.65 30.92 11.53 26 A34 34 0 0 1 78.47 26 C79.35 30.92 84 36 89 36 L90 36'

// ---- Lembar "Lainnya" (khusus admin)
const sheetOpen = ref(false)
const moreBtn = ref<HTMLButtonElement | null>(null)
const sheet = ref<HTMLElement | null>(null)
const sheetTitleId = useId()
function openSheet() { sheetOpen.value = true; void nextTick(() => sheet.value?.querySelector<HTMLElement>('a, button')?.focus()) }
function closeSheet(returnFocus = true) { sheetOpen.value = false; if (returnFocus) void nextTick(() => moreBtn.value?.focus()) }
function onKey(e: KeyboardEvent) { if (sheetOpen.value && e.key === 'Escape') closeSheet() }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' })
watch(() => route.fullPath, () => { if (sheetOpen.value) closeSheet(false) })
watch(sheetOpen, (v) => { document.body.style.overflow = v ? 'hidden' : '' })
async function logout() {
  closeSheet(false)
  await auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <nav class="bnav" aria-label="Menu utama" data-testid="bottom-nav" :style="{ '--i': Math.max(active, 0), '--n': slots }">
    <span v-if="bubbleIcon" class="bnav-bubble" aria-hidden="true">
      <svg class="bnav-hump" width="90" height="40" viewBox="0 0 90 40">
        <path :d="`${HUMP} L90 40 L0 40 Z`" class="hump-fill" />
      </svg>
      <span class="bnav-circle">
        <Transition name="pop" mode="out-in">
          <component :is="bubbleIcon" :key="bubbleKey" :size="23" :stroke-width="2" />
        </Transition>
      </span>
    </span>
    <NuxtLink v-for="(it, i) in (isAdmin ? adminItems : customerItems)" :key="it.to" :to="it.to" class="bnav-item" :class="{ active: i === active }"
      :aria-current="i === active ? 'page' : undefined">
      <span class="bnav-icon">
        <component :is="it.icon" :size="21" :stroke-width="1.9" aria-hidden="true" />
        <span v-if="it.to === '/notifikasi' && unread" class="bnav-badge" :aria-label="`${unread} belum dibaca`">{{ unread > 9 ? '9+' : unread }}</span>
      </span>
      <span class="bnav-label">{{ it.label }}</span>
    </NuxtLink>
    <button v-if="isAdmin" ref="moreBtn" class="bnav-item" :class="{ active: active === 4 }" type="button" aria-haspopup="dialog" :aria-expanded="sheetOpen"
      :aria-current="active === 4 ? 'page' : undefined" data-testid="more-button" @click="openSheet">
      <span class="bnav-icon"><LayoutGrid :size="21" :stroke-width="1.9" aria-hidden="true" /></span>
      <span class="bnav-label">Lainnya</span>
    </button>
  </nav>

  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="sheetOpen" class="sheet-root" @click.self="closeSheet()">
        <div ref="sheet" class="sheet" role="dialog" aria-modal="true" :aria-labelledby="sheetTitleId" data-testid="more-sheet">
          <span class="sheet-handle" aria-hidden="true" />
          <div class="sheet-head">
            <div>
              <h2 :id="sheetTitleId" class="sheet-title">Menu lainnya</h2>
              <p class="text-caption">Pengaturan platform & akun Anda</p>
            </div>
            <button class="sheet-close" type="button" aria-label="Tutup menu lainnya" @click="closeSheet()"><X :size="18" /></button>
          </div>
          <div class="sheet-body">
            <section v-for="g in moreGroups" :key="g.title" class="sheet-group" :aria-label="g.title">
              <p class="sheet-group-title">{{ g.title }}</p>
              <ul class="sheet-list">
                <li v-for="m in g.items" :key="m.to">
                  <NuxtLink :to="m.to" class="sheet-item" :class="{ current: isOn(m.to) }" :aria-current="isOn(m.to) ? 'page' : undefined">
                    <span class="sheet-icon" aria-hidden="true"><component :is="m.icon" :size="18" /></span>
                    <span class="min-w-0 flex-1">
                      <span class="sheet-label">{{ m.label }}<span v-if="isOn(m.to)" class="badge sheet-now">Sedang dibuka</span></span>
                      <span class="sheet-desc">{{ m.desc }}</span>
                    </span>
                    <ChevronRight :size="16" class="sheet-chev" aria-hidden="true" />
                  </NuxtLink>
                </li>
                <li v-if="g.title === 'Akun'">
                  <button class="sheet-item sheet-logout" type="button" @click="logout">
                    <span class="sheet-icon" aria-hidden="true"><LogOut :size="18" /></span>
                    <span class="min-w-0 flex-1"><span class="sheet-label">Keluar</span><span class="sheet-desc">Akhiri sesi di perangkat ini</span></span>
                  </button>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bnav { display: none; }
@media (max-width: 767.98px) {
  .bnav {
    /* Sejajar dengan tepi kartu: jarak sama dengan padding halaman (1.5rem; 1rem di ≤ 640px). */
    position: fixed; left: 1.5rem; right: 1.5rem; bottom: calc(1rem + env(safe-area-inset-bottom)); z-index: calc(var(--z-sidebar) - 20);
    display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); height: 64px; padding: 0 18px;
    /* Kapsul mengambang: ujung bulat penuh, tanpa garis tepi, bayangan lembut menyebar. */
    background: var(--bg-surface); border-radius: 999px;
    box-shadow: 0 10px 28px rgba(16, 24, 40, 0.10), 0 2px 8px rgba(16, 24, 40, 0.05);
  }
}
/* Punuk + lingkaran: selebar satu kolom, digeser sesuai indeks menu aktif. */
@media (max-width: 640px) { .bnav { left: 1rem; right: 1rem; } }
.bnav-bubble {
  position: absolute; top: 0; left: 18px; width: calc((100% - 36px) / var(--n)); height: 0;
  pointer-events: none; transform: translateX(calc(var(--i) * 100%)); transition: transform 0.5s cubic-bezier(0.34, 1.35, 0.64, 1);
}
.bnav-hump { position: absolute; left: 50%; top: -36px; margin-left: -45px; overflow: visible; filter: drop-shadow(0 -4px 6px rgba(16, 24, 40, 0.05)); }
.hump-fill { fill: var(--bg-surface); }
.bnav-circle {
  position: absolute; left: 50%; top: -31px; width: 54px; height: 54px; margin-left: -27px; border-radius: 999px;
  display: grid; place-items: center; background: var(--brand); color: var(--text-inverse);
  /* Bayangan sangat tipis — tidak menonjol. */
  box-shadow: 0 2px 6px color-mix(in srgb, var(--brand) 14%, transparent);
}
.bnav-item {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px;
  padding: 0 0 10px; min-width: 0; color: var(--n-600); background: none; border: 0; font: inherit; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.bnav-icon { position: relative; display: grid; place-items: center; transition: transform 0.35s cubic-bezier(0.34, 1.45, 0.64, 1), opacity 0.2s var(--ease); }
.bnav-item.active .bnav-icon { opacity: 0; transform: translateY(-16px) scale(0.6); }
.bnav-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.6875rem; color: var(--text-muted); transition: color 0.2s var(--ease); }
.bnav-item.active .bnav-label { color: var(--brand); font-weight: var(--fw-medium); }
.bnav-item:focus-visible { outline: none; }
.bnav-item:focus-visible .bnav-label { text-decoration: underline; color: var(--text-heading); }
.bnav-badge {
  position: absolute; top: -6px; right: -9px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
  border: 2px solid var(--bg-surface); background: var(--brand); color: var(--text-inverse); font-size: 9px; line-height: 12px; text-align: center;
}
.pop-enter-active { transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s var(--ease); }
.pop-leave-active { transition: opacity 0.12s var(--ease), transform 0.12s var(--ease); }
.pop-enter-from { opacity: 0; transform: scale(0.4) rotate(-25deg); }
.pop-leave-to { opacity: 0; transform: scale(0.6); }

/* Lembar "Lainnya": muncul dari bawah, latar gelap transparan. */
.sheet-root { position: fixed; inset: 0; z-index: var(--z-modal); display: flex; align-items: flex-end; background: var(--bg-overlay); }
.sheet {
  width: 100%; max-height: 85dvh; display: flex; flex-direction: column; background: var(--bg-surface);
  border-radius: 16px 16px 0 0; padding-bottom: calc(0.75rem + env(safe-area-inset-bottom)); box-shadow: var(--sh-pop);
}
.sheet-handle { align-self: center; width: 40px; height: 4px; margin: 8px 0 2px; border-radius: 999px; background: var(--n-200); }
.sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 0.75rem 1.25rem 0.9rem; border-bottom: 1px solid var(--border); }
.sheet-title { font-size: var(--fs-h3); }
.sheet-close { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: var(--r-sm); background: none; color: var(--text-muted); cursor: pointer; }
.sheet-close:hover { background: var(--bg-hover); color: var(--text-heading); }
.sheet-body { overflow-y: auto; padding: 0.5rem 0.75rem; }
.sheet-group-title { padding: 0.75rem 0.5rem 0.35rem; font-size: var(--fs-micro); font-weight: var(--fw-medium); letter-spacing: var(--tracking-wide); text-transform: uppercase; color: var(--n-400); }
.sheet-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sheet-item { display: flex; align-items: center; gap: 0.8rem; width: 100%; padding: 0.7rem 0.6rem; border: 0; border-radius: var(--r); background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.sheet-item:hover, .sheet-item:focus-visible { background: var(--bg-subtle); outline: none; }
.sheet-item.current { background: var(--n-100); }
.sheet-icon { display: grid; place-items: center; width: 38px; height: 38px; flex-shrink: 0; border-radius: var(--r); color: var(--brand); background: color-mix(in srgb, var(--brand) 10%, transparent); }
.sheet-label { display: flex; align-items: center; gap: 0.5rem; font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--text-heading); }
.sheet-desc { display: block; font-size: var(--fs-caption); color: var(--text-muted); }
.sheet-now { font-size: var(--fs-micro); }
.sheet-chev { color: var(--text-faint); flex-shrink: 0; }
.sheet-logout .sheet-icon { color: var(--err); background: color-mix(in srgb, var(--err) 10%, transparent); }
.sheet-logout .sheet-label { color: var(--err); }
.sheet-enter-active, .sheet-leave-active { transition: background-color 0.25s var(--ease); }
.sheet-enter-active .sheet { transition: transform 0.38s cubic-bezier(0.22, 1.2, 0.36, 1); }
.sheet-leave-active .sheet { transition: transform 0.22s var(--ease); }
.sheet-enter-from, .sheet-leave-to { background-color: transparent; }
.sheet-enter-from .sheet, .sheet-leave-to .sheet { transform: translateY(100%); }
@media (min-width: 768px) { .sheet-root { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .bnav-bubble, .bnav-icon, .pop-enter-active, .pop-leave-active, .sheet-enter-active .sheet, .sheet-leave-active .sheet { transition: none; }
}
</style>
