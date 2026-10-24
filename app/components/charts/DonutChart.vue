<script setup lang="ts">
// Donut status dengan celah 2px antar-segmen, total di tengah, legenda selalu ada (ikon warna + label + angka + persen).
interface Segment { label: string; value: number; color: string }
const props = withDefaults(defineProps<{ segments: Segment[]; centerLabel?: string; size?: number }>(), { centerLabel: 'Total', size: 148 })
const stroke = 18
const r = computed(() => (props.size - stroke) / 2)
const c = computed(() => 2 * Math.PI * r.value)
const total = computed(() => props.segments.reduce((n, s) => n + s.value, 0))
const arcs = computed(() => {
  let offset = 0
  const nonZero = props.segments.filter((s) => s.value > 0).length
  return props.segments.map((s) => {
    const len = total.value ? (s.value / total.value) * c.value : 0
    const gap = nonZero > 1 && len > 0 ? 2 : 0
    const arc = { ...s, dash: `${Math.max(len - gap, 0)} ${c.value}`, offset: -offset }
    offset += len
    return arc
  })
})
const pct = (v: number) => (total.value ? Math.round((v / total.value) * 100) : 0)
</script>

<template>
  <div class="donut">
    <div class="donut-ring" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
        <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--n-100)" :stroke-width="stroke" />
        <g :transform="`rotate(-90 ${size / 2} ${size / 2})`">
          <circle v-for="a in arcs" :key="a.label" :cx="size / 2" :cy="size / 2" :r="r" fill="none" :stroke="a.color" :stroke-width="stroke"
            :stroke-dasharray="a.dash" :stroke-dashoffset="a.offset" />
        </g>
      </svg>
      <div class="center"><strong>{{ formatNumber(total) }}</strong><span>{{ centerLabel }}</span></div>
    </div>
    <ul class="legend">
      <li v-for="s in segments" :key="s.label">
        <span class="swatch" :style="{ background: s.color }" aria-hidden="true" />
        <span class="name">{{ s.label }}</span>
        <span class="val">{{ formatNumber(s.value) }}</span>
        <span class="pct">{{ pct(s.value) }}%</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.donut { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; justify-content: center; }
.donut-ring { position: relative; flex-shrink: 0; }
.center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; line-height: 1.2; }
.center strong { font-size: 1.5rem; font-weight: var(--fw-medium); color: var(--text-heading); }
.center span { font-size: var(--fs-caption); color: var(--text-muted); }
.legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; min-width: 180px; flex: 1; }
.legend li { display: grid; grid-template-columns: 10px 1fr auto 3rem; align-items: center; gap: 0.6rem; font-size: var(--fs-label); }
.swatch { width: 10px; height: 10px; border-radius: 999px; }
.name { color: var(--text-body); }
.val { color: var(--text-heading); font-weight: var(--fw-medium); text-align: right; }
.pct { color: var(--text-muted); text-align: right; }
</style>
