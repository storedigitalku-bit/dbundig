<script setup lang="ts">
// Logo MDUNDIG: kotak biru membulat + amplop undangan yang membentuk huruf "M", titik sebagai segel.
// Sama dengan public/favicon.svg dan logo di kepala laporan PDF.
withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 32 32" class="app-logo" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="8" fill="var(--brand)" />
    <path d="M7.5 22.5V10.5L16 17l8.5-6.5v12Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" />
    <circle cx="16" cy="9.6" r="1.7" fill="#fff" />
  </svg>
</template>

<style scoped>
.app-logo { display: block; flex-shrink: 0; }
</style>
