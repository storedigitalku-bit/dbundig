<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

// Konfirmasi tindakan berisiko (hapus/cabut). Tombol terkunci selama proses.
withDefaults(defineProps<{ open: boolean; title: string; message: string; confirmLabel?: string; loading?: boolean; subtitle?: string }>(), { confirmLabel: 'Hapus', loading: false, subtitle: 'Tindakan ini tidak dapat dibatalkan.' })
const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <ModalDialog :open="open" :icon="TriangleAlert" tone="danger" :title="title" :subtitle="subtitle" size="sm" :closable="!loading" @close="emit('close')">
    <p>{{ message }}</p>
    <template #footer>
      <button class="btn btn-secondary" type="button" :disabled="loading" @click="emit('close')">Batal</button>
      <AsyncButton variant="danger" :loading="loading" @click="emit('confirm')">{{ confirmLabel }}</AsyncButton>
    </template>
  </ModalDialog>
</template>
