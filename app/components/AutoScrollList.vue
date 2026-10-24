<script setup lang="ts">
// Wadah daftar. Tanpa `auto`: daftar biasa yang bisa digulir.
// Dengan `auto` dan isi lebih tinggi dari wadah: isi berjalan sendiri pelan sebagai pita tanpa ujung
// (salinan kedua menyambung di bawah, jadi tidak pernah melompat kembali ke atas). Gerak memakai transform
// sub-piksel agar halus; berhenti saat disorot/difokus/disentuh atau tab tersembunyi; roda mouse & tombol panah
// tetap menggeser daftar. prefers-reduced-motion → kembali ke daftar biasa.
// Ponsel (< 768px): tidak bergulir sama sekali (tanpa gerak otomatis & tanpa gulir di dalam kartu) — halaman yang memakai
// komponen ini menampilkan beberapa baris teratas saja, sehingga gulir halaman tidak "tersangkut" di daftar.
const props = withDefaults(defineProps<{ label: string; auto?: boolean; speed?: number }>(), { auto: false, speed: 10 })
const box = ref<HTMLElement | null>(null)
const first = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)
const reduced = ref(false)
const looping = ref(false)
let period = 0
let offset = 0
let raf = 0
let last = 0
let holdUntil = 0
let paused = false
let inView = true
let running = false
let ro: ResizeObserver | undefined
let io: IntersectionObserver | undefined

const phone = useIsPhone()
const marquee = computed(() => props.auto && !reduced.value && !phone.value)

function apply() { if (track.value) track.value.style.transform = `translate3d(0, ${-offset}px, 0)` }
function wrap() { if (period > 0) offset = ((offset % period) + period) % period }
function measure() {
  if (!box.value || !first.value) return
  period = first.value.getBoundingClientRect().height
  looping.value = marquee.value && period > box.value.clientHeight + 1
  if (!looping.value) { offset = 0; apply() } else { wrap(); apply() }
}
function hold(ms: number) { holdUntil = performance.now() + ms }
function setPaused(v: boolean) { paused = v; if (v) stopLoop(); else { hold(800); startLoop() } }
function nudge(px: number) { if (!looping.value) return false; offset += px; wrap(); apply(); hold(2500); return true }
function onWheel(e: WheelEvent) { if (nudge(e.deltaY)) e.preventDefault() }
function onKey(e: KeyboardEvent) {
  const step = e.key === 'ArrowDown' ? 40 : e.key === 'ArrowUp' ? -40 : 0
  if (step && nudge(step)) e.preventDefault()
}

// Animasi hanya berjalan saat pita memang bergerak & terlihat: tidak berjalan untuk daftar statis, saat disorot,
// saat tab tersembunyi, atau saat daftar di luar layar (hemat CPU/baterai, tidak membuat halaman lag).
function startLoop() {
  if (running || !looping.value || paused || !inView || document.hidden) return
  running = true
  last = 0
  raf = requestAnimationFrame(tick)
}
function stopLoop() { running = false; cancelAnimationFrame(raf) }
function tick(t: number) {
  if (!running) return
  raf = requestAnimationFrame(tick)
  const dt = last ? Math.min(t - last, 64) : 0
  last = t
  if (t < holdUntil) return
  offset += (props.speed * dt) / 1000
  wrap()
  apply()
}
function onVisibility() { if (document.hidden) stopLoop(); else startLoop() }

onMounted(() => {
  reduced.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ro = new ResizeObserver(measure)
  if (box.value) ro.observe(box.value)
  if (first.value) ro.observe(first.value)
  if (box.value && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(([e]) => { inView = !!e?.isIntersecting; if (inView) startLoop(); else stopLoop() })
    io.observe(box.value)
  }
  document.addEventListener('visibilitychange', onVisibility)
  hold(1500)
})
onBeforeUnmount(() => { stopLoop(); ro?.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onVisibility) })
watch(marquee, () => nextTick(measure))
watch(looping, (v) => { if (v) startLoop(); else stopLoop() })
</script>

<template>
  <div ref="box" class="auto-scroll" :class="{ looping, marquee, 'is-static': phone }" :tabindex="phone ? -1 : 0" role="region" :aria-label="label"
    @mouseenter="setPaused(true)" @mouseleave="setPaused(false)" @focusin="setPaused(true)" @focusout="setPaused(false)"
    @touchstart.passive="hold(4000)" @wheel="onWheel" @keydown="onKey">
    <div ref="track" class="track">
      <div ref="first"><slot /></div>
      <!-- Salinan penyambung pita: hanya visual, tidak terbaca pembaca layar & tidak bisa difokus. -->
      <div v-if="looping" aria-hidden="true" inert><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.auto-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; margin-right: -0.5rem; padding-right: 0.5rem;
  /* Tepi bawah memudar agar baris yang terpotong terlihat disengaja. */
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent); }
.auto-scroll.marquee { overflow: hidden; }
.auto-scroll.looping {
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 18px), transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 18px), transparent); }
.looping .track { will-change: transform; }
/* Ponsel: daftar statis setinggi isinya — tanpa gulir di dalam, tanpa tepi memudar. */
.auto-scroll.is-static { flex: none; overflow: visible; margin-right: 0; padding-right: 0; -webkit-mask-image: none; mask-image: none; }
</style>
