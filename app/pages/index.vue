<script setup lang="ts">
import { ClipboardList, FileText, Gift, Globe, KeyRound, ListChecks, Trash2, User, Users } from 'lucide-vue-next'
import type { Component } from 'vue'

useHead({ title: 'Ringkasan — MDUNDIG' })

interface Kpi { total: number; this_week: number; last_week: number; series: number[] }
interface Stats {
  today: string; days: number
  kpis: { invitations: Kpi; gifts: Kpi; reservations: Kpi }
  trend: Array<{ date: string; confirmed: number; cancelled: number }>
  status: { confirmed: number; cancelled: number }
  top_gifts: Array<{ gift_id: string; name: string; image_url: string; invitation_title: string; count: number }>
  websites?: { total: number; active: number; active_tokens: number; series: number[] }
  orders?: { total: number; today: number; week: number; month: number; new: number
    latest: Array<{ id: string; name: string; contact: string; status: string; created_at: string }> }
  activity: Array<{ type: string; title: string; subtitle: string; at: string }>
}

// Warna kategori KPI (divalidasi: lightness, chroma, CVD, kontras — lihat docs/LAPORAN.md).
const C = { blue: '#2563eb', peach: '#b85c22', lilac: '#6a53b8', rose: '#d4547e' }

const api = useApi()
const auth = useAuth()
const data = ref<Stats | null>(null)
const loading = ref(true)
const error = ref('')
const days = ref(7)
async function load() {
  error.value = ''
  try { data.value = await api.request<Stats>('/api/app/dashboard', { query: { days: days.value } }) } catch (err) { error.value = errorMessage(err) } finally { loading.value = false }
}
onMounted(load)
watch(days, load)

// Data diperbarui sendiri tiap menit (diam-diam, hanya saat tab terlihat) agar urutan & daftar terbaru ikut berganti.
let refresher: ReturnType<typeof setInterval> | undefined
onMounted(() => { refresher = setInterval(() => { if (!document.hidden) void load() }, 60_000) })
// Reservasi/order baru (Realtime) → ringkasan langsung diperbarui.
const { tick: notifTick } = useNotifications()
watch(notifTick, () => { void load() })
onBeforeUnmount(() => clearInterval(refresher))

// Panel baris bawah setinggi panel Status reservasi; isinya digulir di dalam panel.
const statusPanel = ref<HTMLElement | null>(null)
const listH = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  if (!statusPanel.value) return
  ro = new ResizeObserver(([e]) => { listH.value = Math.round(e!.target.getBoundingClientRect().height) })
  ro.observe(statusPanel.value)
})
onBeforeUnmount(() => ro?.disconnect())

const greeting = computed(() => auth.me.value?.display_name || auth.me.value?.username || '')
const trendPoints = computed(() => (data.value?.trend ?? []).map((d) => ({ date: d.date, value: d.confirmed, extra: d.cancelled ? `${d.cancelled} dibatalkan` : '' })))
const trendTotal = computed(() => trendPoints.value.reduce((n, p) => n + p.value, 0))
const statusSegments = computed(() => [
  { label: 'Terkonfirmasi', value: data.value?.status.confirmed ?? 0, color: C.blue },
  { label: 'Dibatalkan', value: data.value?.status.cancelled ?? 0, color: '#98a2b3' },
])
// Gambar dari WordPress yang gagal dimuat (http:// di HTTPS / situs lokal) diganti ikon.
const failedImg = reactive(new Set<string>())
// Ponsel: tiap daftar ringkas hanya 4 teratas (tanpa gulir otomatis maupun gulir di dalam kartu).
const phone = useIsPhone()
const phoneTop = <T>(list: T[]): T[] => (phone.value ? list.slice(0, PHONE_LIST_LIMIT) : list)
const topTotal = computed(() => Math.max(1, data.value?.kpis.reservations.total ?? 0))

const AUDIT: Record<string, { title: string; icon: Component; color: string }> = {
  'website.create': { title: 'Website ditambahkan', icon: Globe, color: C.rose },
  'website.update': { title: 'Website diperbarui', icon: Globe, color: C.rose },
  'website.delete': { title: 'Website dihapus', icon: Globe, color: C.rose },
  'token.create': { title: 'Token website dibuat', icon: KeyRound, color: C.rose },
  'token.rotate': { title: 'Token website dirotasi', icon: KeyRound, color: C.rose },
  'token.revoke': { title: 'Token website dicabut', icon: KeyRound, color: C.rose },
  'user.create': { title: 'Akun dibuat', icon: User, color: '#475467' },
  'user.update': { title: 'Akun diperbarui', icon: User, color: '#475467' },
  'user.delete': { title: 'Akun dihapus', icon: User, color: '#475467' },
  'access.grant': { title: 'Akses undangan diberikan', icon: Users, color: '#475467' },
  'access.revoke': { title: 'Akses undangan dicabut', icon: Users, color: '#475467' },
  'invitation.delete': { title: 'Undangan dihapus', icon: Trash2, color: C.blue },
  'order.create': { title: 'Order manual ditambahkan', icon: ClipboardList, color: C.peach },
}
const activity = computed(() => (data.value?.activity ?? []).map((a) => {
  if (a.type === 'reservation') return { ...a, icon: Gift, color: C.lilac }
  if (a.type === 'order') return { ...a, subtitle: a.subtitle, icon: ClipboardList, color: C.peach }
  const meta = AUDIT[a.title] ?? { title: a.title, icon: FileText, color: '#475467' }
  return { ...a, title: meta.title, subtitle: `oleh ${a.subtitle}`, icon: meta.icon, color: meta.color }
}))
const shortTime = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
const when = (iso: string) => shortTime.format(new Date(iso))
const tint = (color: string) => ({ color, background: `color-mix(in srgb, ${color} 10%, transparent)` })
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Ringkasan</h1>
        <p class="text-caption">Halo, {{ greeting }}. {{ auth.isAdmin.value ? 'Ringkasan seluruh data platform.' : 'Ringkasan Daftar Hadiah undangan Anda.' }}</p>
      </div>
    </div>
    <p v-if="error" class="alert tone-err" role="alert">{{ error }} <button class="btn btn-ghost btn-sm" type="button" @click="load">Coba lagi</button></p>

    <!-- Baris 1: KPI -->
    <div class="kpis" :class="auth.isAdmin.value ? 'kpis-4' : 'kpis-3'">
      <KpiCard label="Total undangan" :icon="FileText" :color="C.blue" :loading="loading" to="/daftar-hadiah"
        :value="data?.kpis.invitations.total ?? null" :series="data?.kpis.invitations.series" :this-week="data?.kpis.invitations.this_week" :last-week="data?.kpis.invitations.last_week" />
      <KpiCard label="Hadiah aktif" :icon="Gift" :color="C.peach" :loading="loading" to="/daftar-hadiah"
        :value="data?.kpis.gifts.total ?? null" :series="data?.kpis.gifts.series" :this-week="data?.kpis.gifts.this_week" :last-week="data?.kpis.gifts.last_week" />
      <KpiCard label="Reservasi terkonfirmasi" :icon="ListChecks" :color="C.lilac" :loading="loading" to="/daftar-hadiah/reservasi"
        :value="data?.kpis.reservations.total ?? null" :series="data?.kpis.reservations.series" :this-week="data?.kpis.reservations.this_week" :last-week="data?.kpis.reservations.last_week" />
      <KpiCard v-if="auth.isAdmin.value" label="Website terhubung" :icon="Globe" :color="C.rose" :loading="loading" to="/admin/website"
        :value="data?.websites?.total ?? null" :series="data?.websites?.series" :caption="data?.websites ? `${data.websites.active_tokens} token aktif · ${data.websites.active} aktif` : ''" />
    </div>

    <!-- Baris 2: tren & status -->
    <div class="row-2">
      <section class="card panel" aria-labelledby="trend-title">
        <div class="panel-head">
          <div>
            <h2 id="trend-title">Tren reservasi</h2>
            <p class="text-caption">{{ formatNumber(trendTotal) }} reservasi terkonfirmasi dalam {{ days }} hari terakhir</p>
          </div>
          <div class="w-40 shrink-0">
            <label for="trend-range" class="sr-only">Rentang waktu</label>
            <select id="trend-range" v-model.number="days" class="select">
              <option :value="7">7 hari terakhir</option>
              <option :value="14">14 hari terakhir</option>
              <option :value="30">30 hari terakhir</option>
              <option :value="90">90 hari terakhir</option>
            </select>
          </div>
        </div>
        <div class="panel-body">
          <div v-if="loading" class="skeleton" style="height: 220px" />
          <ChartsTrendChart v-else :points="trendPoints" label="Reservasi terkonfirmasi" :color="C.blue" />
        </div>
      </section>
      <section ref="statusPanel" class="card panel" aria-labelledby="status-title">
        <div class="panel-head">
          <div>
            <h2 id="status-title">Status reservasi</h2>
            <p class="text-caption">Perbandingan status seluruh reservasi</p>
          </div>
        </div>
        <div class="panel-body center">
          <div v-if="loading" class="skeleton" style="height: 148px; width: 148px; border-radius: 999px" />
          <ChartsDonutChart v-else :segments="statusSegments" center-label="Total" />
        </div>
      </section>
    </div>

    <!-- Baris 3: daftar -->
    <div class="row-3" :class="{ 'row-3-admin': auth.isAdmin.value }" :style="listH ? { '--list-h': `${listH}px` } : undefined">
      <section class="card panel" aria-labelledby="top-title">
        <div class="panel-head">
          <div><h2 id="top-title">Hadiah terpopuler</h2><p class="text-caption">Hadiah dengan reservasi terbanyak</p></div>
          <NuxtLink to="/daftar-hadiah" class="link-sm">Lihat semua</NuxtLink>
        </div>
        <div class="panel-body">
          <LoadingRows v-if="loading" :rows="4" />
          <EmptyState v-else-if="!data?.top_gifts.length" :icon="Gift" title="Belum ada hadiah" description="Hadiah muncul setelah widget Daftar Hadiah dibuka." class="fill" />
          <AutoScrollList v-else label="Daftar hadiah terpopuler">
          <ul class="items">
            <li v-for="g in phoneTop(data.top_gifts)" :key="g.gift_id" class="item">
              <span class="thumb">
                <img v-if="g.image_url && !failedImg.has(g.gift_id)" :src="g.image_url" :alt="''" loading="lazy" referrerpolicy="no-referrer" @error="failedImg.add(g.gift_id)">
                <Gift v-else :size="18" aria-hidden="true" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="item-row">
                  <span class="item-title truncate">{{ g.name }}</span>
                  <span class="item-meta">{{ g.count }} reservasi</span>
                </div>
                <div class="bar" role="img" :aria-label="`${Math.round((g.count / topTotal) * 100)}% dari reservasi terkonfirmasi`">
                  <span :style="{ width: `${Math.min(100, (g.count / topTotal) * 100)}%` }" />
                </div>
                <span class="item-sub truncate">{{ g.invitation_title || 'Tanpa judul' }}</span>
              </div>
            </li>
          </ul>
          </AutoScrollList>
        </div>
      </section>

      <section v-if="auth.isAdmin.value" class="card panel" aria-labelledby="orders-title" data-testid="admin-summary">
        <div class="panel-head">
          <div><h2 id="orders-title">Data form masuk</h2><p class="text-caption">Order Undangan terbaru</p></div>
          <NuxtLink to="/order-undangan" class="link-sm">Lihat semua</NuxtLink>
        </div>
        <div class="panel-body">
          <LoadingRows v-if="loading" :rows="3" />
          <EmptyState v-else-if="!data?.orders?.latest.length" :icon="ClipboardList" title="Belum ada order" description="Order dari widget Form Order muncul di sini." class="fill" />
          <AutoScrollList v-else auto label="Daftar order terbaru">
          <ul class="items people">
            <li v-for="o in phoneTop(data.orders.latest)" :key="o.id">
              <NuxtLink :to="{ path: '/order-undangan', query: { order: o.id } }" class="person">
                <FaceAvatar :seed="o.contact || o.id" :name="o.name" :size="38" />
                <span class="min-w-0 flex-1">
                  <span class="item-title block truncate">{{ o.name }}</span>
                  <span class="item-sub block truncate">{{ o.contact || 'Tanpa kontak' }}</span>
                </span>
                <span class="person-side">
                  <span class="badge badge-dot" :class="orderStatusTone(o.status)">{{ ORDER_STATUS_LABEL[o.status] ?? o.status }}</span>
                  <span class="item-meta">{{ when(o.created_at) }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>
          </AutoScrollList>
        </div>
      </section>

      <section class="card panel" aria-labelledby="act-title">
        <div class="panel-head">
          <div><h2 id="act-title">Aktivitas terbaru</h2><p class="text-caption">{{ auth.isAdmin.value ? 'Reservasi, order, dan perubahan pengaturan' : 'Reservasi terbaru' }}</p></div>
        </div>
        <div class="panel-body">
          <LoadingRows v-if="loading" :rows="4" />
          <EmptyState v-else-if="!activity.length" title="Belum ada aktivitas" description="Aktivitas akan muncul di sini." class="fill" />
          <AutoScrollList v-else auto label="Daftar aktivitas terbaru">
          <ul class="items">
            <li v-for="(a, i) in phoneTop(activity)" :key="`${a.at}-${i}`" class="item">
              <span class="act-icon" :style="tint(a.color)" aria-hidden="true"><component :is="a.icon" :size="17" /></span>
              <span class="min-w-0 flex-1">
                <span class="item-title block truncate">{{ a.title }}</span>
                <span class="item-sub block truncate">{{ a.subtitle || '—' }}</span>
              </span>
              <span class="item-meta whitespace-nowrap">{{ when(a.at) }}</span>
            </li>
          </ul>
          </AutoScrollList>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.kpis { display: grid; gap: 0.75rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 640px) { .kpis { gap: 1rem; } }
/* 3 kartu (pelanggan) di grid 2 kolom: kartu terakhir selebar baris. */
@media (max-width: 1279.98px) { .kpis-3 > :last-child { grid-column: 1 / -1; } }
@media (min-width: 1280px) { .kpis-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); } .kpis-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

.row-2 { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1024px) { .row-2 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); } }
.row-3 { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1024px) { .row-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1280px) { .row-3-admin { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

/* Semua panel dalam satu baris setinggi sama; isi kosong tetap rata tengah. */
.panel { display: flex; flex-direction: column; min-width: 0; height: 100%; }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem 0.75rem; }
.panel-head h2 { font-size: var(--fs-h3); margin-bottom: 2px; }
.panel-body { flex: 1; display: flex; flex-direction: column; padding: 0.25rem 1.25rem 1.25rem; min-height: 0; }
.panel-body.center { align-items: center; justify-content: center; }
.row-3 > .panel { height: var(--list-h, 320px); }
/* Satu kolom (ponsel/tablet): tinggi mengikuti isi, maks. 420px lalu digulir di dalam panel. */
@media (max-width: 1023.98px) { .row-3 > .panel { height: auto; max-height: 420px; } }
/* Ponsel: kartu setinggi isinya (4 baris teratas), tanpa gulir di dalam kartu. */
@media (max-width: 767.98px) { .row-3 > .panel { max-height: none; } .row-3 .panel-body { overflow: visible; } }
.row-3 .panel-body { overflow: hidden; }
.fill { flex: 1; justify-content: center; }
.link-sm { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--brand); white-space: nowrap; }
.link-sm:hover { color: var(--brand-hover); }

.items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.item { display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0; border-bottom: 1px solid var(--border); }
.item:last-child { border-bottom: 0; }
.item-row { display: flex; justify-content: space-between; gap: 0.75rem; align-items: baseline; }
.item-title { font-size: var(--fs-label); font-weight: var(--fw-medium); color: var(--text-heading); }
.item-sub { font-size: var(--fs-caption); color: var(--text-muted); }
.item-meta { font-size: var(--fs-caption); color: var(--text-muted); white-space: nowrap; }
.thumb { display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border-radius: var(--r-sm); background: var(--n-100); color: var(--n-500); overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.bar { height: 6px; border-radius: 999px; background: var(--n-100); margin: 0.35rem 0 0.25rem; overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 999px; background: var(--brand); min-width: 0; }
.act-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; flex-shrink: 0; }

.people li { border-bottom: 1px solid var(--border); }
.people li:last-child { border-bottom: 0; }
/* Daftar berjalan tanpa ujung: garis pemisah tetap ada di sambungan antar-salinan. */
.looping .item:last-child, .looping .people li:last-child { border-bottom: 1px solid var(--border); }
.person { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.25rem; border-radius: var(--r-sm); }
.person:hover { background: var(--bg-subtle); }
.person-side { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
</style>
