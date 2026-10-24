<script setup lang="ts">
import { Bell, CalendarDays, ClipboardList, Gift, Globe, History, LayoutDashboard, Link2, LogOut, MessageSquareText, User, Users, X } from 'lucide-vue-next'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const route = useRoute()
const auth = useAuth()

// Modul data. "Order Undangan" hanya dirender untuk admin platform (server & RLS juga menolak pelanggan).
const modules = computed(() => [
  { to: '/', label: 'Ringkasan', icon: LayoutDashboard },
  { to: '/daftar-hadiah', label: 'Daftar Hadiah', icon: Gift },
  ...(auth.isAdmin.value ? [{ to: '/order-undangan', label: 'Order Undangan', icon: ClipboardList }, { to: '/kalender', label: 'Kalender Acara', icon: CalendarDays }] : []),
])
const settings = [
  { to: '/admin/website', label: 'Website', icon: Globe },
  { to: '/admin/koneksi', label: 'Koneksi', icon: Link2 },
  { to: '/admin/pengguna', label: 'Pengguna & Akses', icon: Users },
  { to: '/admin/pesan-whatsapp', label: 'Pesan WhatsApp', icon: MessageSquareText },
  { to: '/admin/riwayat', label: 'Riwayat & Error', icon: History },
]
const account = [{ to: '/notifikasi', label: 'Notifikasi', icon: Bell }, { to: '/profil', label: 'Profil', icon: User }]
const { unread } = useNotifications()

function isActive(path: string) {
  return path === '/' ? route.path === '/' : route.path === path || route.path.startsWith(path + '/')
}
async function logout() {
  await auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div v-if="open" class="sidebar-overlay" aria-hidden="true" @click="emit('close')" />
  <aside class="sidebar" :class="{ 'is-open': open }" aria-label="Navigasi">
    <div class="sidebar-brand">
      <AppLogo :size="34" />
      <span class="brand-text">
        <strong>MDUNDIG</strong>
        <small>Manajemen Data Undangan Digital</small>
      </span>
      <button class="sidebar-close" type="button" aria-label="Tutup menu" @click="emit('close')"><X :size="18" /></button>
    </div>
    <nav class="sidebar-nav">
      <p class="nav-label">Data</p>
      <ul class="nav-group" data-testid="module-menu">
        <li v-for="item in modules" :key="item.to">
          <NuxtLink :to="item.to" class="nav-item" :class="{ active: isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined">
            <component :is="item.icon" :size="17" :stroke-width="1.9" /><span>{{ item.label }}</span>
          </NuxtLink>
        </li>
      </ul>
      <template v-if="auth.isAdmin.value">
        <p class="nav-label nav-label-gap">Pengaturan</p>
        <ul class="nav-group" data-testid="admin-menu">
          <li v-for="item in settings" :key="item.to">
            <NuxtLink :to="item.to" class="nav-item" :class="{ active: isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined">
              <component :is="item.icon" :size="17" :stroke-width="1.9" /><span>{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </template>
      <p class="nav-label nav-label-gap">Akun</p>
      <ul class="nav-group">
        <li v-for="item in account" :key="item.to">
          <NuxtLink :to="item.to" class="nav-item" :class="{ active: isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined">
            <component :is="item.icon" :size="17" :stroke-width="1.9" /><span>{{ item.label }}</span>
            <span v-if="item.to === '/notifikasi' && unread" class="nav-count" :aria-label="`${unread} belum dibaca`">{{ unread > 99 ? '99+' : unread }}</span>
          </NuxtLink>
        </li>
      </ul>
    </nav>
    <div class="sidebar-footer">
      <button class="nav-item nav-item-danger" type="button" @click="logout"><LogOut :size="17" :stroke-width="1.9" /><span>Keluar</span></button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex; flex-direction: column; width: var(--sidebar-w); flex-shrink: 0; height: 100dvh; position: sticky; top: 0;
  background: var(--bg-surface); color: var(--n-600); border-right: 1px solid var(--n-200); z-index: var(--z-sidebar);
}
.sidebar-brand { display: flex; align-items: center; gap: 0.7rem; height: var(--topbar-h); padding: 0 1rem 0 1.25rem; flex-shrink: 0; border-bottom: 1px solid var(--n-200); }
.brand-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.brand-text strong { font-size: 1rem; font-weight: var(--fw-medium); color: var(--text-heading); letter-spacing: 0.02em; }
.brand-text small { font-size: 0.6875rem; line-height: 1.25; color: var(--text-muted); }
.sidebar-close { display: none; margin-left: auto; padding: 0.5rem; border-radius: var(--r-sm); color: var(--n-600); background: none; border: 0; cursor: pointer; }
.sidebar-close:hover { background: var(--bg-hover); color: var(--text-heading); }
.sidebar-nav { flex: 1; padding: 1.5rem 1rem 1rem; min-height: 0; overflow-y: auto; }
.nav-label { padding: 0 0.75rem; margin-bottom: 0.75rem; font-size: var(--fs-micro); font-weight: var(--fw-medium); letter-spacing: var(--tracking-wide); text-transform: uppercase; color: var(--n-400); }
.nav-label-gap { margin-top: 1.25rem; }
.nav-group { display: flex; flex-direction: column; gap: 0.25rem; list-style: none; margin: 0; padding: 0; }
.nav-item {
  display: flex; align-items: center; gap: 0.75rem; width: 100%; min-height: var(--h-control); padding: 0 0.75rem; border-radius: var(--r);
  font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--n-600); background: none; border: 0; cursor: pointer; text-align: left;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-heading); }
.nav-item.active { background: var(--n-100); color: var(--text-heading); }
.nav-item.active :deep(svg) { color: var(--brand); }
.nav-item :deep(svg) { flex-shrink: 0; }
.nav-count { margin-left: auto; min-width: 20px; padding: 1px 7px; border-radius: 999px; background: var(--brand); color: var(--text-inverse); font-size: var(--fs-micro); line-height: 18px; text-align: center; }
.sidebar-footer { padding: 1rem; flex-shrink: 0; border-top: 1px solid var(--n-200); }
.nav-item-danger:hover { background: var(--bg-hover); color: var(--err); }
.sidebar-overlay { display: none; }
@media (max-width: 1023px) {
  .sidebar { position: fixed; inset: 0 auto 0 0; transform: translateX(-100%); transition: transform var(--dur) var(--ease); box-shadow: var(--sh-pop); max-width: 86vw; }
  .sidebar.is-open { transform: translateX(0); }
  .sidebar-close { display: block; }
  .sidebar-overlay { display: block; position: fixed; inset: 0; background: var(--bg-overlay); z-index: calc(var(--z-sidebar) - 1); animation: fade-in var(--dur) var(--ease); }
}
</style>
