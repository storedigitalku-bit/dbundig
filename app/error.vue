<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const title = computed(() => (props.error.statusCode === 404 ? 'Halaman tidak ditemukan' : 'Terjadi kesalahan'))
const description = computed(() => (props.error.statusCode === 404
  ? 'Alamat yang Anda buka tidak tersedia.'
  : 'Muat ulang halaman. Bila masalah berlanjut, hubungi admin platform.'))
useHead({ title: `${title.value} — MDUNDIG` })
</script>

<template>
  <div class="wrap">
    <div class="card box">
      <p class="text-overline">Kode {{ error.statusCode }}</p>
      <h1>{{ title }}</h1>
      <p class="text-caption">{{ description }}</p>
      <div class="control-row">
        <button class="btn btn-primary" type="button" @click="clearError({ redirect: '/' })">Ke ringkasan</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap { min-height: 100dvh; display: grid; place-items: center; padding: 1rem; background: var(--bg-page); }
.box { max-width: 440px; width: 100%; padding: 2rem; display: flex; flex-direction: column; gap: 0.75rem; }
</style>
