<script setup lang="ts">
// Navigasi dalam modul Daftar Hadiah: Undangan | Reservasi.
const route = useRoute()
const tabs = [
  { to: '/daftar-hadiah', label: 'Undangan' },
  { to: '/daftar-hadiah/reservasi', label: 'Reservasi' },
]
const isActive = (to: string) => route.path === to
</script>

<template>
  <nav class="tabs" aria-label="Bagian Daftar Hadiah">
    <NuxtLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ active: isActive(t.to) }" :aria-current="isActive(t.to) ? 'page' : undefined">
      {{ t.label }}
    </NuxtLink>
  </nav>
</template>

<style scoped>
/* Garis bawah via inset shadow → garis tab aktif menimpanya tanpa overflow (tidak muncul scrollbar). */
.tabs { display: flex; gap: 0.25rem; box-shadow: inset 0 -1px 0 var(--border); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tab {
  display: inline-flex; align-items: center; height: var(--h-control); padding: 0 0.75rem;
  font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--text-muted); white-space: nowrap;
  border-bottom: 2px solid transparent; transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.tab:hover { color: var(--text-heading); }
.tab.active { color: var(--text-heading); border-bottom-color: var(--brand); }
</style>
