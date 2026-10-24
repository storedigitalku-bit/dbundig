<script setup lang="ts">
import { ClipboardList, Gift } from 'lucide-vue-next'
import type { NotificationItem } from '~/composables/useNotifications'

// Satu notifikasi: ikon bernada per jenis, judul, isi, waktu relatif, titik biru bila belum dibaca.
defineProps<{ item: NotificationItem; compact?: boolean }>()
const tone = (kind: string) => (kind === 'order'
  ? { color: '#b85c22', background: 'color-mix(in srgb, #b85c22 10%, transparent)' }
  : { color: '#6a53b8', background: 'color-mix(in srgb, #6a53b8 10%, transparent)' })
</script>

<template>
  <div class="notif" :class="{ unread: !item.read_at, compact }">
    <span class="notif-icon" :style="tone(item.kind)" aria-hidden="true">
      <ClipboardList v-if="item.kind === 'order'" :size="17" /><Gift v-else :size="17" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="notif-title">{{ item.title }}<span v-if="!item.read_at" class="sr-only"> (belum dibaca)</span></span>
      <span class="notif-body">{{ item.body }}</span>
      <span class="notif-time">{{ timeAgo(item.created_at) }}</span>
    </span>
    <span v-if="!item.read_at" class="dot" aria-hidden="true" />
  </div>
</template>

<style scoped>
.notif { display: flex; align-items: flex-start; gap: 0.75rem; min-width: 0; }
.notif-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; flex-shrink: 0; }
.notif-title { display: block; font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); }
.notif:not(.unread) .notif-title { font-weight: 400; color: var(--text-body); }
.notif-body { display: block; font-size: var(--fs-caption); color: var(--text-muted); overflow-wrap: anywhere; }
.compact .notif-body { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.notif-time { display: block; margin-top: 2px; font-size: var(--fs-micro); color: var(--text-faint); }
.dot { width: 8px; height: 8px; margin-top: 6px; border-radius: 999px; background: var(--brand); flex-shrink: 0; }
</style>
