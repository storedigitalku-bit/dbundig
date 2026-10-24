<script setup lang="ts">
import { CircleCheck, CircleX, Info, X } from 'lucide-vue-next'

const toast = useToast()
const icons = { success: CircleCheck, error: CircleX, info: Info }
const tones = { success: 'tone-ok', error: 'tone-err', info: 'tone-brand' }
</script>

<template>
  <div class="toast-host" role="status" aria-live="polite" aria-atomic="true">
    <!-- out-in: toast lama keluar dulu sehingga dua pesan tidak pernah bertumpuk -->
    <Transition name="toast" mode="out-in">
      <div v-if="toast.current.value" :key="toast.current.value.id" class="toast" :class="tones[toast.current.value.type]" data-testid="toast">
        <component :is="icons[toast.current.value.type]" class="toast-icon" :size="19" />
        <p class="toast-msg">{{ toast.current.value.message }}</p>
        <button class="toast-close" type="button" aria-label="Tutup notifikasi" @click="toast.dismiss()"><X :size="15" /></button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-host { position: fixed; top: 1.25rem; right: 1.25rem; z-index: var(--z-toast); width: min(380px, calc(100vw - 32px)); pointer-events: none; }
.toast {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--bg-surface);
  border: 1px solid var(--border); border-radius: var(--r); box-shadow: var(--sh-pop); pointer-events: auto;
}
.toast-icon { color: var(--tone-fg); flex-shrink: 0; }
.toast-msg { flex: 1; font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); line-height: var(--lh-snug); overflow-wrap: anywhere; }
.toast-close { color: var(--text-muted); flex-shrink: 0; padding: 2px; border-radius: var(--r-sm); background: none; border: 0; cursor: pointer; }
.toast-close:hover { color: var(--text-heading); background: var(--bg-hover); }
.toast-enter-active, .toast-leave-active { transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(24px); }
@media (max-width: 640px) { .toast-host { top: auto; bottom: 1rem; left: 1rem; right: 1rem; width: auto; } }
</style>
