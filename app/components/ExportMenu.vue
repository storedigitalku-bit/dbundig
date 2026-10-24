<script setup lang="ts">
import { ChevronDown, FileSpreadsheet, FileText, LoaderCircle } from 'lucide-vue-next'

// Tombol unduh laporan: PDF sebagai pilihan utama (rapi, font Ubuntu), CSV lewat menu ▾ untuk diolah di spreadsheet.
// Filter yang sedang aktif ikut dikirim, jadi isi laporan sama dengan yang tampil di halaman.
const props = withDefaults(defineProps<{ pdfUrl: string; csvUrl: string; query: Record<string, unknown>; name: string; primary?: boolean }>(), { primary: false })
const api = useApi()
const toast = useToast()
const busy = ref<'' | 'pdf' | 'csv'>('')
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const toggle = ref<HTMLButtonElement | null>(null)
const menuId = useId()

async function run(kind: 'pdf' | 'csv') {
  open.value = false
  if (busy.value) return
  busy.value = kind
  try {
    await api.download(kind === 'pdf' ? props.pdfUrl : props.csvUrl, props.query, `${props.name}.${kind}`)
    toast.success(kind === 'pdf' ? 'Laporan PDF diunduh.' : 'Laporan CSV diunduh.')
  } catch (err) {
    toast.error(errorMessage(err, 'Laporan gagal diunduh.'))
  } finally {
    busy.value = ''
  }
}

function onDocDown(e: PointerEvent) { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
function onKey(e: KeyboardEvent) { if (open.value && e.key === 'Escape') { open.value = false; toggle.value?.focus() } }
onMounted(() => { document.addEventListener('pointerdown', onDocDown); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocDown); document.removeEventListener('keydown', onKey) })
</script>

<template>
  <div ref="root" class="export">
    <button class="btn export-main" :class="primary ? 'btn-primary' : 'btn-secondary'" type="button" :disabled="!!busy" :aria-busy="busy === 'pdf'" @click="run('pdf')">
      <LoaderCircle v-if="busy === 'pdf'" :size="16" class="spin" aria-hidden="true" />
      <FileText v-else :size="16" aria-hidden="true" />
      {{ busy === 'pdf' ? 'Menyiapkan PDF…' : 'Unduh PDF' }}
    </button>
    <button ref="toggle" class="btn btn-icon export-toggle" :class="primary ? 'btn-primary' : 'btn-secondary'" type="button" :disabled="!!busy"
      aria-haspopup="menu" :aria-expanded="open" :aria-controls="menuId" aria-label="Pilihan format laporan" @click="open = !open">
      <LoaderCircle v-if="busy === 'csv'" :size="16" class="spin" aria-hidden="true" />
      <ChevronDown v-else :size="16" aria-hidden="true" />
    </button>
    <div v-if="open" :id="menuId" class="export-menu" role="menu" aria-label="Format laporan">
      <button class="item" type="button" role="menuitem" @click="run('pdf')">
        <FileText :size="18" class="item-icon" aria-hidden="true" />
        <span class="min-w-0"><span class="item-title">PDF <span class="badge tone-ok">Disarankan</span></span><span class="item-sub">Rapi untuk dibaca, dibagikan &amp; dicetak</span></span>
      </button>
      <button class="item" type="button" role="menuitem" @click="run('csv')">
        <FileSpreadsheet :size="18" class="item-icon" aria-hidden="true" />
        <span class="min-w-0"><span class="item-title">CSV</span><span class="item-sub">Untuk diolah di Excel atau Google Sheets</span></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.export { position: relative; display: inline-flex; }
.export-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.export-toggle { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: -1px; }
.btn-primary.export-toggle { border-left-color: color-mix(in srgb, var(--text-inverse) 35%, var(--brand)); }
.export-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; width: 280px; padding: 0.35rem;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r); box-shadow: var(--sh-pop, 0 12px 32px rgba(16, 24, 40, 0.12));
}
.item { display: flex; align-items: flex-start; gap: 0.7rem; width: 100%; padding: 0.6rem 0.65rem; border: 0; background: none; border-radius: var(--r-sm); text-align: left; cursor: pointer; }
.item:hover, .item:focus-visible { background: var(--bg-subtle); }
.item-icon { color: var(--brand); margin-top: 1px; flex-shrink: 0; }
.item-title { display: flex; align-items: center; gap: 0.4rem; font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); }
.item-sub { display: block; font-size: var(--fs-caption); color: var(--text-muted); }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .export-menu { left: 0; right: auto; width: min(280px, calc(100vw - 2rem)); } }
</style>
