<script setup lang="ts">
import { Search } from 'lucide-vue-next'

// Pilih SATU undangan (tercatat otomatis dari WordPress) untuk satu akun pelanggan — satu akun = satu undangan.
// v-model tetap berupa daftar ([] = tanpa undangan, [id] = satu undangan) agar sesuai kontrak API.
// Akses 1:1: undangan di `taken` (id → nama pemegang) sudah dipakai akun lain sehingga tidak bisa dipilih.
interface Option { id: string; title: string; website_name: string | null }
const props = withDefaults(defineProps<{ options: Option[]; loading?: boolean; idPrefix?: string; taken?: Record<string, string> }>(), { loading: false, idPrefix: 'inv', taken: () => ({}) })
const model = defineModel<string[]>({ required: true })
const q = ref('')
const shown = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return props.options
  return props.options.filter((o) => `${o.title} ${o.website_name ?? ''}`.toLowerCase().includes(term))
})
const current = computed(() => model.value[0] ?? '')
const currentTitle = computed(() => props.options.find((o) => o.id === current.value)?.title || '')
function pick(id: string) { model.value = id ? [id] : [] }
const groupName = computed(() => `${props.idPrefix}-choice`)
</script>

<template>
  <div class="picker">
    <div class="picker-top">
      <label class="search">
        <Search :size="16" aria-hidden="true" />
        <span class="sr-only">Cari undangan</span>
        <input v-model="q" class="input" type="search" placeholder="Cari judul undangan atau website" :disabled="!options.length">
      </label>
    </div>
    <p class="text-caption" aria-live="polite">
      {{ current ? `Dipilih: ${currentTitle || 'Tanpa judul'}` : 'Belum ada undangan dipilih' }} · satu akun untuk satu undangan, dan sebaliknya
    </p>
    <LoadingRows v-if="loading" :rows="3" />
    <p v-else-if="!options.length" class="picker-empty">Belum ada undangan dari WordPress. Undangan tercatat otomatis saat widget Daftar Hadiah dibuka.</p>
    <ul v-else class="list" role="radiogroup" aria-label="Undangan">
      <li>
        <label class="row" :for="`${idPrefix}-none`">
          <input :id="`${idPrefix}-none`" type="radio" :name="groupName" :checked="!current" @change="pick('')">
          <span class="min-w-0"><span class="block title muted">Tanpa undangan</span><span class="block text-caption">Akun belum dapat melihat undangan apa pun</span></span>
        </label>
      </li>
      <li v-for="o in shown" :key="o.id">
        <label class="row" :class="{ on: current === o.id, taken: !!taken[o.id] }" :for="`${idPrefix}-${o.id}`">
          <input :id="`${idPrefix}-${o.id}`" type="radio" :name="groupName" :checked="current === o.id" :disabled="!!taken[o.id]" @change="pick(o.id)">
          <span class="min-w-0">
            <span class="block truncate title">{{ o.title || 'Tanpa judul' }}</span>
            <span class="block truncate text-caption">{{ taken[o.id] ? `Sudah dipakai: ${taken[o.id]}` : (o.website_name || '—') }}</span>
          </span>
        </label>
      </li>
      <li v-if="!shown.length" class="picker-empty">Tidak ada undangan yang cocok.</li>
    </ul>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; gap: 0.5rem; }
.picker-top { display: flex; align-items: center; gap: 0.75rem; }
.search { position: relative; flex: 1; }
.search svg { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.search .input { padding-left: 2.25rem; }
.list { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--r); }
.list li + li { border-top: 1px solid var(--border); }
.row { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.85rem; cursor: pointer; }
.row:hover { background: var(--bg-subtle); }
.row.on { background: color-mix(in srgb, var(--brand) 5%, transparent); }
.row.taken { cursor: not-allowed; opacity: 0.55; }
.row.taken:hover { background: transparent; }
.row input { width: 16px; height: 16px; flex-shrink: 0; accent-color: var(--brand); }
.title { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); }
.title.muted { color: var(--text-body); font-weight: 400; }
.picker-empty { padding: 0.85rem; font-size: var(--fs-label); color: var(--text-muted); }
</style>
