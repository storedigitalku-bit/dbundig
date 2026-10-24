<script setup lang="ts">
import { X } from 'lucide-vue-next'
import type { Component } from 'vue'

const props = withDefaults(defineProps<{ open: boolean; title: string; subtitle?: string; size?: 'sm' | 'md' | 'lg'; closable?: boolean; icon?: Component | null; tone?: 'brand' | 'danger' }>(), { subtitle: '', size: 'md', closable: true, icon: null, tone: 'brand' })
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement | null>(null)
let previous: HTMLElement | null = null

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open && props.closable) emit('close')
}
watch(() => props.open, async (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    previous = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onKey)
    await nextTick()
    dialog.value?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-close)')?.focus()
  } else {
    document.removeEventListener('keydown', onKey)
    previous?.focus?.()
  }
})
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' })
const titleId = useId()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-root" @click.self="closable && emit('close')">
        <div ref="dialog" class="modal" :class="`modal-${size}`" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <header class="modal-head">
            <span v-if="icon" class="modal-icon" :class="{ danger: tone === 'danger' }" aria-hidden="true"><component :is="icon" :size="18" /></span>
            <div class="min-w-0 flex-1">
              <h2 :id="titleId">{{ title }}</h2>
              <p v-if="subtitle" class="text-caption mt-0.5">{{ subtitle }}</p>
            </div>
            <button v-if="closable" class="modal-close" type="button" aria-label="Tutup" @click="emit('close')"><X :size="18" /></button>
          </header>
          <div class="modal-body"><slot /></div>
          <footer v-if="$slots.footer" class="modal-foot"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-root { position: fixed; inset: 0; z-index: var(--z-modal); display: flex; align-items: center; justify-content: center; padding: 1rem; background: var(--bg-overlay); }
.modal { display: flex; flex-direction: column; width: 100%; max-height: calc(100dvh - 4rem); background: var(--bg-surface); border-radius: var(--r); box-shadow: var(--sh-pop); overflow: hidden; }
.modal-sm { max-width: 420px; } .modal-md { max-width: 560px; } .modal-lg { max-width: 760px; }
.modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.modal-head h2 { font-size: var(--fs-h3); }
.modal-icon { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: var(--r); color: var(--brand); background: color-mix(in srgb, var(--brand) 10%, transparent); }
.modal-icon.danger { color: var(--err); background: color-mix(in srgb, var(--err) 10%, transparent); }
.modal-close { padding: 0.5rem; border-radius: var(--r-sm); color: var(--text-muted); flex-shrink: 0; background: none; border: 0; cursor: pointer; }
.modal-close:hover { background: var(--bg-hover); color: var(--text-heading); }
.modal-body { padding: 1.5rem; flex: 1; min-height: 0; overflow-y: auto; }
.modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; padding: 1rem 1.5rem; background: var(--bg-subtle); border-top: 1px solid var(--border); flex-shrink: 0; }
.modal-enter-active, .modal-leave-active { transition: opacity var(--dur) var(--ease); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
@media (max-width: 640px) {
  .modal-root { padding: 0; align-items: flex-end; }
  .modal { max-height: 92dvh; border-radius: var(--r) var(--r) 0 0; }
  .modal-body { padding: 1.25rem; }
  .modal-foot { flex-direction: column-reverse; align-items: stretch; padding: 1rem 1.25rem; }
  .modal-foot :deep(.btn) { width: 100%; }
}
</style>
