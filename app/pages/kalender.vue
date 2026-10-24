<script setup lang="ts">
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-vue-next'

definePageMeta({ admin: true })
useHead({ title: 'Kalender Acara — MDUNDIG' })

// Tanggal akad / resepsi / ngunduh mantu dari isi Order Undangan (widget Form Order). Tanggal diolah sebagai teks
// YYYY-MM-DD (tanpa zona waktu) agar tidak bergeser hari.
interface EventRow {
  order_id: string; kind: 'akad' | 'resepsi' | 'ngunduh'; event_date: string; event_time: string | null; address: string | null; maps: string | null
  groom: string | null; bride: string | null; customer: string | null; post_title: string; status: string
}
const KIND: Record<EventRow['kind'], string> = { akad: 'Akad', resepsi: 'Resepsi', ngunduh: 'Ngunduh Mantu' }
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

const api = useApi()
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const now = new Date()
const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }

const month = ref({ y: now.getFullYear(), m: now.getMonth() })
const selected = ref(todayIso)
const events = ref<EventRow[]>([])
const upcoming = ref<EventRow[]>([])
const loading = ref(true)
const error = ref('')

// Kisi 6 minggu dimulai Senin sebelum/tepat tanggal 1.
const grid = computed(() => {
  const first = new Date(Date.UTC(month.value.y, month.value.m, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const start = addDays(iso(first), -offset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
})
const byDate = computed(() => {
  const map = new Map<string, EventRow[]>()
  for (const e of events.value) map.set(e.event_date, [...(map.get(e.event_date) ?? []), e])
  return map
})
const monthLabel = computed(() => `${MONTHS[month.value.m]} ${month.value.y}`)
const inMonth = (d: string) => Number(d.slice(5, 7)) - 1 === month.value.m
const selectedEvents = computed(() => byDate.value.get(selected.value) ?? [])
const monthCount = computed(() => events.value.filter((e) => inMonth(e.event_date)).length)

async function loadMonth() {
  loading.value = true
  error.value = ''
  try {
    const g = grid.value
    events.value = (await api.request<{ items: EventRow[] }>('/api/app/admin/events', { query: { from: g[0], to: g[g.length - 1] } })).items
  } catch (err) {
    error.value = errorMessage(err, 'Kalender gagal dimuat.')
  } finally {
    loading.value = false
  }
}
async function loadUpcoming() {
  try { upcoming.value = (await api.request<{ items: EventRow[] }>('/api/app/admin/events', { query: { from: todayIso, to: addDays(todayIso, 13) } })).items } catch { upcoming.value = [] }
}
function shift(n: number) {
  const d = new Date(Date.UTC(month.value.y, month.value.m + n, 1))
  month.value = { y: d.getUTCFullYear(), m: d.getUTCMonth() }
  selected.value = iso(d)
  void loadMonth()
}
function goToday() {
  month.value = { y: now.getFullYear(), m: now.getMonth() }
  selected.value = todayIso
  void loadMonth()
}
onMounted(() => { void loadMonth(); void loadUpcoming() })

const couple = (e: EventRow) => (e.groom && e.bride ? `${e.groom} & ${e.bride}` : e.groom || e.bride || e.customer || e.post_title || 'Tanpa nama')
const fullDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  const day = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getUTCDay()]
  return `${day}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
const relative = (s: string) => {
  const diff = Math.round((Date.parse(`${s}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000)
  return diff === 0 ? 'Hari ini' : diff === 1 ? 'Besok' : `${diff} hari lagi`
}
const safeMaps = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : null)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Kalender Acara</h1><p class="text-caption">Akad, resepsi, dan ngunduh mantu dari Order Undangan.</p></div>
      <button class="btn btn-secondary" type="button" @click="goToday"><CalendarDays :size="16" /> Hari ini</button>
    </div>
    <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>

    <section class="card" aria-labelledby="up-title" data-testid="upcoming">
      <div class="card-header">
        <div>
          <h2 id="up-title" class="flex items-center gap-2"><CalendarClock :size="18" /> Acara 14 hari ke depan</h2>
          <p class="text-caption">Agar persiapan undangan tidak terlewat</p>
        </div>
        <span v-if="upcoming.length" class="badge">{{ upcoming.length }} acara</span>
      </div>
      <p v-if="!upcoming.length" class="card-body text-caption">Belum ada acara dalam 14 hari ke depan.</p>
      <ul v-else class="ev-list">
        <li v-for="e in upcoming" :key="`${e.order_id}-${e.kind}`">
          <NuxtLink :to="{ path: '/order-undangan', query: { order: e.order_id } }" class="ev">
            <span class="ev-date"><strong>{{ Number(e.event_date.slice(8, 10)) }}</strong>{{ MONTHS[Number(e.event_date.slice(5, 7)) - 1]!.slice(0, 3) }}</span>
            <span class="min-w-0 flex-1">
              <span class="ev-title block truncate">{{ couple(e) }}</span>
              <span class="text-caption block truncate">{{ KIND[e.kind] }}{{ e.event_time ? ` · ${e.event_time}` : '' }}{{ e.address ? ` · ${e.address}` : '' }}</span>
            </span>
            <span class="badge" :class="e.event_date === todayIso ? 'tone-ok' : ''">{{ relative(e.event_date) }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section class="card" aria-labelledby="cal-title">
      <div class="card-header">
        <div>
          <h2 id="cal-title" class="flex items-center gap-2"><CalendarDays :size="18" /> {{ monthLabel }}</h2>
          <p class="text-caption">{{ monthCount }} acara bulan ini · pilih tanggal untuk melihat rinciannya</p>
        </div>
        <div class="flex gap-1">
          <button class="btn btn-secondary btn-sm btn-icon" type="button" aria-label="Bulan sebelumnya" @click="shift(-1)"><ChevronLeft :size="16" /></button>
          <button class="btn btn-secondary btn-sm btn-icon" type="button" aria-label="Bulan berikutnya" @click="shift(1)"><ChevronRight :size="16" /></button>
        </div>
      </div>
      <div class="card-body">
        <div class="cal" role="grid" :aria-label="`Kalender ${monthLabel}`" :aria-busy="loading">
          <div v-for="d in DAYS" :key="d" class="cal-head" role="columnheader">{{ d }}</div>
          <button v-for="d in grid" :key="d" type="button" class="cal-day" role="gridcell"
            :class="{ out: !inMonth(d), today: d === todayIso, on: d === selected, has: byDate.has(d) }"
            :aria-pressed="d === selected" :aria-label="`${fullDate(d)}${byDate.get(d)?.length ? `, ${byDate.get(d)!.length} acara` : ''}`"
            :data-date="d" @click="selected = d">
            <span class="cal-num">{{ Number(d.slice(8, 10)) }}</span>
            <span class="cal-chips">
              <span v-for="e in (byDate.get(d) ?? []).slice(0, 2)" :key="`${e.order_id}-${e.kind}`" class="chip truncate">{{ KIND[e.kind] }} · {{ couple(e) }}</span>
              <span v-if="(byDate.get(d)?.length ?? 0) > 2" class="chip more">+{{ byDate.get(d)!.length - 2 }}</span>
            </span>
            <span v-if="byDate.has(d)" class="cal-dots" aria-hidden="true"><i v-for="n in Math.min(3, byDate.get(d)!.length)" :key="n" /></span>
          </button>
        </div>
      </div>
      <div class="day-detail" data-testid="day-detail">
        <p class="day-title">{{ fullDate(selected) }}</p>
        <p v-if="!selectedEvents.length" class="text-caption">Tidak ada acara pada tanggal ini.</p>
        <ul v-else class="ev-list flat">
          <li v-for="e in selectedEvents" :key="`${e.order_id}-${e.kind}`" class="ev-row">
            <span class="badge">{{ KIND[e.kind] }}</span>
            <span class="min-w-0 flex-1">
              <span class="ev-title block truncate">{{ couple(e) }}</span>
              <span class="text-caption block">{{ e.event_time || 'Waktu belum diisi' }}{{ e.address ? ` · ${e.address}` : '' }}</span>
            </span>
            <a v-if="safeMaps(e.maps)" :href="safeMaps(e.maps)!" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm btn-icon" :aria-label="`Buka peta ${couple(e)}`"><MapPin :size="15" /></a>
            <NuxtLink :to="{ path: '/order-undangan', query: { order: e.order_id } }" class="btn btn-secondary btn-sm">Detail</NuxtLink>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ev-list { list-style: none; margin: 0; padding: 0; }
.ev-list > li + li { border-top: 1px solid var(--border); }
.ev { display: flex; align-items: center; gap: 0.9rem; padding: 0.75rem 1.25rem; color: inherit; text-decoration: none; }
.ev:hover { background: var(--bg-subtle); }
.ev-date { display: grid; place-items: center; width: 46px; height: 46px; flex-shrink: 0; border-radius: var(--r); background: color-mix(in srgb, var(--brand) 9%, transparent); color: var(--brand); font-size: var(--fs-caption); line-height: 1.1; text-transform: uppercase; }
.ev-date strong { font-size: 1.05rem; font-weight: var(--fw-medium); }
.ev-title { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); }
.cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.cal-head { padding: 0.25rem 0; text-align: center; font-size: var(--fs-caption); color: var(--text-muted); }
.cal-day { position: relative; display: flex; flex-direction: column; gap: 3px; min-height: 92px; padding: 0.4rem; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--bg-surface); text-align: left; font: inherit; color: inherit; cursor: pointer; min-width: 0; }
.cal-day:hover { background: var(--bg-subtle); }
.cal-day.out { opacity: 0.45; }
.cal-day.on { border-color: var(--brand); box-shadow: inset 0 0 0 1px var(--brand); }
.cal-num { font-size: var(--fs-label); color: var(--text-heading); }
.cal-day.today .cal-num { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 999px; background: var(--brand); color: var(--text-inverse); }
.cal-chips { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.chip { display: block; padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, var(--brand) 10%, transparent); color: var(--brand-ink, var(--brand)); font-size: 11px; line-height: 1.5; }
.chip.more { background: var(--n-100); color: var(--text-muted); }
.cal-dots { display: none; }
.day-detail { padding: 1rem 1.25rem 1.25rem; border-top: 1px solid var(--border); }
.day-title { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); margin-bottom: 0.5rem; }
.ev-list.flat > li { padding: 0.6rem 0; }
.ev-row { display: flex; align-items: center; gap: 0.75rem; }
/* Ponsel: sel ringkas — titik penanda acara, rincian di bawah kalender. */
@media (max-width: 767.98px) {
  .cal-day { min-height: 46px; align-items: center; padding: 0.3rem 0.1rem; }
  .cal-chips { display: none; }
  .cal-dots { display: flex; gap: 2px; justify-content: center; }
  .cal-dots i { width: 5px; height: 5px; border-radius: 999px; background: var(--brand); }
  .ev { padding: 0.7rem 1rem; }
  .day-detail { padding: 1rem; }
}
</style>
