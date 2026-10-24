<script setup lang="ts">
import { TrendingDown, TrendingUp } from 'lucide-vue-next'
import type { Component } from 'vue'
import { NuxtLink } from '#components'

// Kartu KPI: ikon bernada, label, angka besar, perubahan vs 7 hari sebelumnya, sparkline 7 hari.
const props = withDefaults(defineProps<{
  label: string; value: number | null; icon: Component; color: string
  series?: number[]; thisWeek?: number; lastWeek?: number; caption?: string; to?: string; loading?: boolean
}>(), { series: () => [], thisWeek: undefined, lastWeek: undefined, caption: '', to: '', loading: false })

const delta = computed(() => {
  if (props.thisWeek === undefined || props.lastWeek === undefined) return null
  const diff = props.thisWeek - props.lastWeek
  if (props.lastWeek === 0) return { up: diff >= 0, text: diff > 0 ? `+${diff} baru` : 'Tidak berubah', flat: diff === 0 }
  const pct = Math.round((diff / props.lastWeek) * 100)
  return { up: pct >= 0, text: `${pct > 0 ? '+' : ''}${pct}%`, flat: pct === 0 }
})
</script>

<template>
  <component :is="to ? NuxtLink : 'div'" :to="to || undefined" class="kpi card" :class="{ clickable: !!to }">
    <div class="kpi-top">
      <span class="kpi-icon" :style="{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }" aria-hidden="true"><component :is="icon" :size="20" :stroke-width="1.9" /></span>
      <span class="kpi-label">{{ label }}</span>
    </div>
    <div class="kpi-body">
      <div class="min-w-0">
        <span v-if="loading" class="skeleton block" style="width: 56px; height: 30px" />
        <span v-else class="kpi-value">{{ value === null ? '—' : formatNumber(value) }}</span>
        <p v-if="delta && !loading" class="kpi-delta" :class="{ up: delta.up && !delta.flat }">
          <component :is="delta.up ? TrendingUp : TrendingDown" v-if="!delta.flat" :size="14" aria-hidden="true" />
          <span>{{ delta.text }}</span> <span class="muted long">vs 7 hari sebelumnya</span><span class="muted short">vs 7 hari lalu</span>
        </p>
        <p v-else-if="caption && !loading" class="kpi-delta muted">{{ caption }}</p>
      </div>
      <ChartsSparkline v-if="series.length" class="kpi-spark" :values="series" :color="color" fluid />
    </div>
  </component>
</template>

<style scoped>
.kpi { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.1rem 1.25rem; height: 100%; min-width: 0; container-type: inline-size; transition: border-color var(--dur) var(--ease); }
.kpi.clickable:hover { border-color: var(--border-strong); }
.kpi-top { display: flex; align-items: center; gap: 0.75rem; }
.kpi-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--r); flex-shrink: 0; }
.kpi-label { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-body); }
.kpi-body { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.75rem; flex: 1; }
.kpi-body > .min-w-0 { align-self: flex-start; }
.kpi-value { display: block; font-size: 1.75rem; line-height: 1.15; font-weight: var(--fw-medium); color: var(--text-heading); letter-spacing: var(--tracking-tight); }
.kpi-delta { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.35rem; font-size: var(--fs-caption); color: var(--text-body); }
.kpi-delta.up { color: var(--brand-ink); }
.kpi-delta .muted, .muted { color: var(--text-muted); }
.kpi-spark { width: 112px; }
.short { display: none; }
/* Kartu sempit (mis. 2 kolom di ponsel): lebih ringkas, grafik mini di bawah angka selebar kartu. */
@container (max-width: 260px) {
  .kpi-top { gap: 0.6rem; align-items: flex-start; }
  .kpi-icon { width: 32px; height: 32px; }
  .kpi-icon :deep(svg) { width: 17px; height: 17px; }
  .kpi-label { font-size: var(--fs-caption); line-height: 1.3; padding-top: 1px; }
  .kpi-body { flex-direction: column; align-items: stretch; gap: 0.5rem; }
  .kpi-value { font-size: 1.5rem; }
  .kpi-spark { width: 100%; }
  .long { display: none; }
  .short { display: inline; }
}
</style>
