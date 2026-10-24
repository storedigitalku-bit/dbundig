<script setup lang="ts">
// Grafik garis+area satu seri. Lebar mengikuti kontainer (ResizeObserver) sehingga garis tetap 2px.
// Hover/keyboard: crosshair + tooltip. Tabel tersembunyi untuk pembaca layar.
interface Point { date: string; value: number; extra?: string }
const props = withDefaults(defineProps<{ points: Point[]; color?: string; label: string; height?: number }>(), { color: '#2563eb', height: 220 })

const wrap = ref<HTMLElement | null>(null)
const width = ref(600)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!wrap.value) return
  width.value = wrap.value.clientWidth || 600
  ro = new ResizeObserver(([e]) => { if (e) width.value = Math.max(240, e.contentRect.width) })
  ro.observe(wrap.value)
})
onBeforeUnmount(() => ro?.disconnect())

const m = { top: 12, right: 12, bottom: 28, left: 32 }
const innerW = computed(() => width.value - m.left - m.right)
const innerH = computed(() => props.height - m.top - m.bottom)
const niceMax = computed(() => {
  const max = Math.max(...props.points.map((p) => p.value), 0)
  if (max <= 4) return 4
  const mag = 10 ** Math.floor(Math.log10(max))
  const n = max / mag
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
})
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * niceMax.value)).filter((v, i, a) => a.indexOf(v) === i))
const x = (i: number) => m.left + (props.points.length <= 1 ? innerW.value / 2 : (i / (props.points.length - 1)) * innerW.value)
const y = (v: number) => m.top + innerH.value - (v / niceMax.value) * innerH.value
const line = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' '))
const area = computed(() => props.points.length
  ? `${line.value} L${x(props.points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` : '')
const fmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dateLabel = (d: string) => fmt.format(new Date(`${d}T00:00:00Z`))
const labelEvery = computed(() => Math.max(1, Math.ceil(props.points.length / Math.max(2, Math.floor(innerW.value / 64)))))

const active = ref<number | null>(null)
function onMove(e: MouseEvent) {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
  const px = e.clientX - rect.left - m.left
  const i = Math.round((px / Math.max(innerW.value, 1)) * (props.points.length - 1))
  active.value = Math.min(props.points.length - 1, Math.max(0, i))
}
function onKey(e: KeyboardEvent) {
  if (!props.points.length) return
  if (e.key === 'ArrowRight') active.value = Math.min(props.points.length - 1, (active.value ?? -1) + 1)
  else if (e.key === 'ArrowLeft') active.value = Math.max(0, (active.value ?? props.points.length) - 1)
  else return
  e.preventDefault()
}
const tip = computed(() => {
  if (active.value === null) return null
  const p = props.points[active.value]!
  const left = Math.min(Math.max(x(active.value), 70), width.value - 70)
  return { p, left, top: y(p.value) }
})
</script>

<template>
  <div ref="wrap" class="trend">
    <svg :width="width" :height="height" role="img" :aria-label="`${label}: grafik ${points.length} hari. Gunakan panah kiri/kanan untuk melihat nilai.`"
      tabindex="0" @mousemove="onMove" @mouseleave="active = null" @keydown="onKey" @blur="active = null">
      <g v-for="t in ticks" :key="t">
        <line :x1="m.left" :x2="width - m.right" :y1="y(t)" :y2="y(t)" class="grid" />
        <text :x="m.left - 8" :y="y(t)" class="axis" text-anchor="end" dominant-baseline="middle">{{ t }}</text>
      </g>
      <template v-for="(p, i) in points" :key="p.date">
        <text v-if="i % labelEvery === 0 || i === points.length - 1" :x="x(i)" :y="height - 8" class="axis" text-anchor="middle">{{ dateLabel(p.date) }}</text>
      </template>
      <path :d="area" :fill="color" fill-opacity="0.1" />
      <path :d="line" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <template v-if="points.length <= 14">
        <circle v-for="(p, i) in points" :key="`d${i}`" :cx="x(i)" :cy="y(p.value)" r="3.5" :fill="color" stroke="var(--bg-surface)" stroke-width="2" />
      </template>
      <g v-if="tip">
        <line :x1="x(active!)" :x2="x(active!)" :y1="m.top" :y2="m.top + innerH" class="cross" />
        <circle :cx="x(active!)" :cy="tip.top" r="5" :fill="color" stroke="var(--bg-surface)" stroke-width="2" />
      </g>
    </svg>
    <div v-if="tip" class="tip" :style="{ left: `${tip.left}px`, top: `${Math.max(tip.top - 12, 0)}px` }" role="status">
      <strong>{{ tip.p.value }}</strong> {{ label.toLowerCase() }}
      <span class="tip-date">{{ dateLabel(tip.p.date) }}<template v-if="tip.p.extra"> · {{ tip.p.extra }}</template></span>
    </div>
    <table class="sr-only">
      <caption>{{ label }}</caption>
      <thead><tr><th scope="col">Tanggal</th><th scope="col">Jumlah</th></tr></thead>
      <tbody><tr v-for="p in points" :key="`t${p.date}`"><td>{{ dateLabel(p.date) }}</td><td>{{ p.value }}</td></tr></tbody>
    </table>
  </div>
</template>

<style scoped>
.trend { position: relative; width: 100%; min-width: 0; }
.trend svg { display: block; overflow: visible; }
.trend svg:focus-visible { outline: 2px solid var(--brand); outline-offset: 4px; border-radius: var(--r-sm); }
.grid { stroke: var(--n-100); stroke-width: 1; }
.cross { stroke: var(--n-300); stroke-width: 1; }
.axis { fill: var(--text-muted); font-size: 11px; font-family: var(--font-sans); }
.tip {
  position: absolute; transform: translate(-50%, -100%); pointer-events: none; white-space: nowrap;
  padding: 0.4rem 0.6rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-sm);
  box-shadow: var(--sh-pop); font-size: var(--fs-caption); color: var(--text-body);
}
.tip strong { color: var(--text-heading); }
.tip-date { display: block; color: var(--text-muted); }
</style>
