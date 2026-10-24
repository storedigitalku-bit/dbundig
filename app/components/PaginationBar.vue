<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{ page: number; perPage: number; total: number; disabled?: boolean }>()
const emit = defineEmits<{ change: [page: number] }>()
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.perPage)))
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.perPage + 1))
const to = computed(() => Math.min(props.total, props.page * props.perPage))
function go(p: number) {
  if (p >= 1 && p <= totalPages.value && p !== props.page && !props.disabled) emit('change', p)
}
</script>

<template>
  <nav v-if="total > 0" class="pager" aria-label="Paginasi">
    <p class="pager-info">Menampilkan <strong>{{ formatNumber(from) }}–{{ formatNumber(to) }}</strong> dari <strong>{{ formatNumber(total) }}</strong></p>
    <div v-if="totalPages > 1" class="pager-controls">
      <button class="btn btn-secondary btn-sm btn-icon" type="button" :disabled="page <= 1 || disabled" aria-label="Halaman sebelumnya" @click="go(page - 1)"><ChevronLeft :size="16" /></button>
      <span class="pager-page" aria-live="polite">Halaman {{ page }} / {{ totalPages }}</span>
      <button class="btn btn-secondary btn-sm btn-icon" type="button" :disabled="page >= totalPages || disabled" aria-label="Halaman berikutnya" @click="go(page + 1)"><ChevronRight :size="16" /></button>
    </div>
  </nav>
</template>

<style scoped>
.pager { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding: 1rem 1.25rem; border-top: 1px solid var(--border); }
.pager-info { font-size: var(--fs-caption); color: var(--text-muted); }
.pager-info strong { color: var(--text-heading); }
.pager-controls { display: flex; align-items: center; gap: 0.5rem; }
.pager-page { font-size: var(--fs-label); color: var(--text-body); white-space: nowrap; }
@media (max-width: 640px) { .pager { justify-content: center; } }
</style>
