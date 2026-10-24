<script setup lang="ts">
import { Check, Copy } from 'lucide-vue-next'

const props = withDefaults(defineProps<{ label: string; value: string; secret?: boolean; hint?: string }>(), { secret: false, hint: '' })
const copied = ref(false)
const toast = useToast()
const id = useId()
const input = ref<HTMLInputElement | null>(null)

// Clipboard API dapat menggantung (izin/peramban mobile) → batas waktu + fallback execCommand.
async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ])
      return true
    } catch { /* lanjut ke fallback */ }
  }
  if (!input.value) return false
  input.value.focus()
  input.value.select()
  return document.execCommand('copy')
}

async function copy() {
  try {
    if (!(await writeClipboard(props.value))) throw new Error('copy_failed')
    copied.value = true
    toast.success(`${props.label} disalin.`)
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    toast.error('Gagal menyalin. Pilih teks lalu salin secara manual.')
  }
}
</script>

<template>
  <div class="field">
    <label class="field-label" :for="id">{{ label }}</label>
    <div class="copy-row">
      <input :id="id" ref="input" class="input text-mono" :value="value" readonly @focus="($event.target as HTMLInputElement).select()">
      <button class="btn btn-secondary" type="button" :aria-label="`Salin ${label}`" @click="copy">
        <component :is="copied ? Check : Copy" :size="16" /><span class="copy-text">{{ copied ? 'Tersalin' : 'Salin' }}</span>
      </button>
    </div>
    <p v-if="hint" class="field-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.copy-row { display: flex; gap: 0.5rem; min-width: 0; }
.copy-row .input { flex: 1; min-width: 0; font-size: var(--fs-label); }
@media (max-width: 480px) { .copy-text { display: none; } }
</style>
