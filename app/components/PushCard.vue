<script setup lang="ts">
import { BellRing } from 'lucide-vue-next'

// Notifikasi di perangkat ini (Web Push): reservasi/order baru muncul di ponsel/komputer walau dashboard ditutup.
const auth = useAuth()
const api = useApi()
const toast = useToast()
const config = useRuntimeConfig()
const key = config.public.vapidPublicKey as string
const supported = ref(false)
const ios = ref(false)
const standalone = ref(false)
const permission = ref<NotificationPermission>('default')
const subscribed = ref(false)
const busy = ref(false)

function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}
async function registration() { return navigator.serviceWorker.ready }

onMounted(async () => {
  supported.value = !!key && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  ios.value = /iphone|ipad|ipod/i.test(navigator.userAgent)
  standalone.value = window.matchMedia('(display-mode: standalone)').matches
  if (!supported.value) return
  permission.value = Notification.permission
  const sub = await (await registration()).pushManager.getSubscription().catch(() => null)
  subscribed.value = !!sub
})

async function enable() {
  if (busy.value) return
  busy.value = true
  try {
    permission.value = await Notification.requestPermission()
    if (permission.value !== 'granted') { toast.error('Izin notifikasi ditolak. Aktifkan dari pengaturan browser untuk situs ini.'); return }
    const reg = await registration()
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource })
    await api.request('/api/app/push/subscribe', { method: 'POST', body: sub.toJSON() })
    subscribed.value = true
    toast.success('Notifikasi aktif di perangkat ini.')
  } catch (err) {
    toast.error(errorMessage(err, 'Notifikasi gagal diaktifkan di perangkat ini.'))
  } finally {
    busy.value = false
  }
}
async function disable() {
  if (busy.value) return
  busy.value = true
  try {
    const sub = await (await registration()).pushManager.getSubscription()
    if (sub) {
      await api.request('/api/app/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {})
      await sub.unsubscribe()
    }
    subscribed.value = false
    toast.success('Notifikasi di perangkat ini dimatikan.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="card" aria-labelledby="push-title" data-testid="push-card">
    <div class="card-header">
      <div>
        <h2 id="push-title" class="flex items-center gap-2"><BellRing :size="18" /> Notifikasi di perangkat ini</h2>
        <p class="text-caption">{{ auth.isAdmin.value ? 'Order & reservasi baru' : 'Reservasi hadiah baru' }} muncul walau dashboard ditutup</p>
      </div>
      <span v-if="supported" class="badge" :class="subscribed ? 'tone-ok badge-dot' : ''">{{ subscribed ? 'Aktif' : 'Nonaktif' }}</span>
    </div>
    <div class="card-body flex flex-col gap-3">
      <p v-if="!key" class="text-caption">{{ auth.isAdmin.value ? 'Belum tersedia: isi kunci VAPID di server (lihat README → Push notification).' : 'Belum diaktifkan oleh admin.' }}</p>
      <p v-else-if="ios && !standalone" class="text-caption">Di iPhone/iPad: buka MDUNDIG di Safari → <strong>Bagikan</strong> → <strong>Tambahkan ke Layar Utama</strong>, lalu buka dari ikon tersebut untuk mengaktifkan notifikasi.</p>
      <p v-else-if="!supported" class="text-caption">Browser ini belum mendukung notifikasi. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.</p>
      <template v-else>
        <p v-if="permission === 'denied'" class="alert tone-err" role="alert">Notifikasi diblokir browser. Izinkan dari ikon gembok di bilah alamat, lalu coba lagi.</p>
        <div class="flex justify-end">
          <button v-if="subscribed" class="btn btn-secondary" type="button" :disabled="busy" @click="disable">Matikan di perangkat ini</button>
          <AsyncButton v-else :loading="busy" :disabled="permission === 'denied'" @click="enable"><BellRing :size="16" /> Aktifkan notifikasi</AsyncButton>
        </div>
      </template>
    </div>
  </section>
</template>
