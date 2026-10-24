<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'
import type { Component } from 'vue'

withDefaults(defineProps<{ title: string; description?: string; icon?: Component }>(), { description: '', icon: () => Inbox })
</script>

<template>
  <div class="empty">
    <span class="empty-mark" aria-hidden="true"><component :is="icon" :size="20" :stroke-width="1.75" /></span>
    <span class="empty-title">{{ title }}</span>
    <span v-if="description" class="empty-desc">{{ description }}</span>
    <div v-if="$slots.action" class="empty-action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.empty { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 2.5rem 1.25rem; text-align: center; }
.empty-mark { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 0.75rem; border-radius: 999px; border: 1px dashed var(--n-200); color: var(--n-400); }
.empty-title { font-size: var(--fs-body); font-weight: var(--fw-medium); color: var(--text-heading); }
.empty-desc { font-size: var(--fs-caption); color: var(--text-muted); line-height: var(--lh-snug); max-width: 44ch; }
.empty-action { margin-top: 1rem; }
</style>
