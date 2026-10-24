<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 5 })
</script>

<template>
  <div class="loading" role="status" aria-live="polite">
    <span class="sr-only">Memuat data…</span>
    <div v-for="i in rows" :key="i" class="loading-row">
      <span class="skeleton" style="width: 34%; height: 14px" />
      <span class="skeleton" style="width: 22%; height: 14px" />
      <span class="skeleton" style="width: 14%; height: 14px" />
    </div>
  </div>
</template>

<style scoped>
.loading { display: flex; flex-direction: column; }
.loading-row { display: flex; gap: 1.5rem; align-items: center; padding: 0.95rem 1.25rem; border-bottom: 1px solid var(--border); }
.loading-row:last-child { border-bottom: 0; }
</style>
