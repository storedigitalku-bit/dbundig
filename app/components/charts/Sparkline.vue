<script setup lang="ts">
// Sparkline 7 hari: garis 2px + area 10%, titik akhir r=3 dengan cincin permukaan. Dekoratif (angka ada di kartu).
// `fluid`: lebar mengikuti wadah (diukur), sehingga garis tidak terdistorsi di kartu sempit.
const props = withDefaults(defineProps<{ values: number[]; color: string; width?: number; height?: number; fluid?: boolean }>(), { width: 112, height: 40, fluid: false })
const pad = 4
const wrap = ref<HTMLElement | null>(null)
const measured = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  if (!props.fluid || !wrap.value) return
  ro = new ResizeObserver(([e]) => { measured.value = Math.round(e!.contentRect.width) })
  ro.observe(wrap.value)
})
onBeforeUnmount(() => ro?.disconnect())
const w = computed(() => (props.fluid && measured.value > 0 ? measured.value : props.width))
const points = computed(() => {
  const v = props.values.length ? props.values : [0, 0]
  const max = Math.max(...v, 1)
  const step = (w.value - pad * 2) / Math.max(v.length - 1, 1)
  return v.map((n, i) => [pad + i * step, props.height - pad - (n / max) * (props.height - pad * 2)] as const)
})
const line = computed(() => points.value.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '))
const area = computed(() => {
  const p = points.value
  return `${line.value} L${p[p.length - 1]![0].toFixed(1)} ${props.height - pad} L${p[0]![0].toFixed(1)} ${props.height - pad} Z`
})
const last = computed(() => points.value[points.value.length - 1]!)
</script>

<template>
  <div ref="wrap" class="spark-wrap" :class="{ fluid }">
    <svg :width="w" :height="height" :viewBox="`0 0 ${w} ${height}`" aria-hidden="true" class="spark">
      <path :d="area" :fill="color" fill-opacity="0.1" />
      <path :d="line" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle :cx="last[0]" :cy="last[1]" r="3" :fill="color" stroke="var(--bg-surface)" stroke-width="2" />
    </svg>
  </div>
</template>

<style scoped>
.spark { display: block; overflow: visible; }
.spark-wrap { flex-shrink: 0; }
/* Lebar `fluid` diatur oleh induk (mis. 112px atau 100%). */
.spark-wrap.fluid { min-width: 0; overflow: hidden; }
</style>
