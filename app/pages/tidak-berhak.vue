<script setup lang="ts">
import { ShieldAlert } from 'lucide-vue-next'

useHead({ title: 'Tidak berhak — MDUNDIG' })
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Akses ditolak</h1></div>
    <div class="card">
      <EmptyState :icon="ShieldAlert" title="Anda tidak berhak membuka halaman ini" description="Halaman ini khusus admin platform. Hubungi admin bila Anda memerlukan akses.">
        <template #action><NuxtLink to="/" class="btn btn-secondary">Kembali ke ringkasan</NuxtLink></template>
      </EmptyState>
    </div>
  </div>
</template>
