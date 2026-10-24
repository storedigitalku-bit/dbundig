<script setup lang="ts">
// Tombol yang tidak dapat diklik berulang selama proses berjalan; label "Memproses…" bertahan sampai selesai.
withDefaults(defineProps<{ loading: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'danger-ghost'; type?: 'button' | 'submit'; size?: '' | 'sm' | 'lg'; block?: boolean; disabled?: boolean; loadingText?: string }>(), {
  variant: 'primary', type: 'button', size: '', block: false, disabled: false, loadingText: 'Memproses…',
})
</script>

<template>
  <button :type="type" class="btn" :class="[`btn-${variant}`, size ? `btn-${size}` : '', { 'btn-block': block }]" :disabled="loading || disabled" :aria-busy="loading">
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <span v-if="loading">{{ loadingText }}</span>
    <slot v-else />
  </button>
</template>
