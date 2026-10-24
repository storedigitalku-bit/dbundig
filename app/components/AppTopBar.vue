<script setup lang="ts">
import { Menu } from 'lucide-vue-next'

withDefaults(defineProps<{ phoneBurger?: boolean }>(), { phoneBurger: true })
const emit = defineEmits<{ toggle: [] }>()
const auth = useAuth()
const name = computed(() => auth.me.value?.display_name || auth.me.value?.username || auth.me.value?.email || '')
const initial = computed(() => (name.value.trim()[0] ?? '?').toUpperCase())
const role = computed(() => (auth.isAdmin.value ? 'Admin platform' : 'Pelanggan'))
</script>

<template>
  <header class="topbar">
    <button class="topbar-burger" :class="{ 'no-phone': !phoneBurger }" type="button" aria-label="Buka menu" @click="emit('toggle')"><Menu :size="20" /></button>
    <AppLogo v-if="!phoneBurger" :size="32" class="topbar-logo" />
    <NotificationBell class="topbar-bell" />
    <div class="topbar-user">
      <span class="avatar" aria-hidden="true">{{ initial }}</span>
      <span class="user-meta">
        <span class="user-name">{{ name }}</span>
        <span class="user-role" data-testid="role-label">{{ role }}</span>
      </span>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky; top: 0; z-index: calc(var(--z-sidebar) - 10); display: flex; align-items: center; gap: 1rem;
  height: var(--topbar-h); padding: 0 1.5rem; background: rgba(255, 255, 255, 0.92); border-bottom: 1px solid var(--border);
  /* Isi halaman yang tergulir di belakang tidak terbaca tembus (kaca buram). */
  -webkit-backdrop-filter: saturate(180%) blur(12px); backdrop-filter: saturate(180%) blur(12px);
}
.topbar-burger { display: none; place-items: center; width: 40px; height: 40px; border-radius: var(--r); background: var(--bg-subtle); color: var(--text-heading); border: 0; cursor: pointer; }
.topbar-burger:hover { background: var(--brand-soft); color: var(--brand); }
.topbar-bell { margin-left: auto; }
.topbar-user { display: flex; align-items: center; gap: 0.75rem; min-width: 0; padding-left: 0.75rem; border-left: 1px solid var(--border); }
/* Ponsel: notifikasi cukup di menu bawah (tidak dobel). Lonceng tetap terpasang (tersembunyi) agar angka tetap diperbarui. */
@media (max-width: 767.98px) {
  .topbar-bell { display: none; }
  .topbar-user { margin-left: auto; padding-left: 0; border-left: 0; }
}
.avatar { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: 999px; background: var(--n-100); color: var(--n-600); font-size: var(--fs-caption); font-weight: var(--fw-medium); }
.user-meta { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.user-name { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-role { font-size: var(--fs-micro); color: var(--text-muted); }
@media (max-width: 1023px) { .topbar-burger { display: grid; } }
.topbar-logo { display: none; }
/* Pelanggan di ponsel: burger diganti logo (navigasi lewat menu bawah). */
@media (max-width: 767.98px) { .topbar-burger.no-phone { display: none; } .topbar-logo { display: block; } }
@media (max-width: 640px) { .topbar { padding: 0 1rem; } .user-name { max-width: 150px; } }
</style>
