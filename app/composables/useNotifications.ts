export interface NotificationItem {
  id: string; kind: 'order' | 'reservation'; title: string; body: string; link: string; read_at: string | null; created_at: string
}

import type { RealtimeChannel } from '@supabase/supabase-js'

let channel: RealtimeChannel | null = null
let channelUser = ''

// Jumlah notifikasi belum dibaca, dibagikan lonceng (topbar) & menu samping.
// Notifikasi baru datang seketika lewat Supabase Realtime (RLS: hanya milik akun sendiri); `tick` bertambah setiap
// ada notifikasi baru agar halaman yang terbuka (Notifikasi, Ringkasan) ikut memuat ulang.
export function useNotifications() {
  const unread = useState('notif-unread', () => 0)
  const tick = useState('notif-tick', () => 0)
  const api = useApi()
  const auth = useAuth()
  async function refresh() {
    try {
      unread.value = (await api.request<{ unread: number }>('/api/app/notifications/count')).unread
    } catch {
      // Gagal sesekali (mis. jaringan) tidak perlu mengganggu pengguna; angka lama dipertahankan sampai pembaruan berikutnya.
    }
  }
  async function markRead(ids: string[] | 'all') {
    await api.request('/api/app/notifications/read', { method: 'POST', body: ids === 'all' ? { all: true } : { ids } })
    await refresh()
  }
  function startRealtime() {
    const uid = auth.me.value?.id
    if (!uid || !supabaseConfigured() || (channel && channelUser === uid)) return
    stopRealtime()
    channelUser = uid
    channel = useSupabase()
      .channel(`notif-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        tick.value++
        void refresh()
      })
      .subscribe()
  }
  function stopRealtime() {
    if (channel) void useSupabase().removeChannel(channel).catch(() => {})
    channel = null
    channelUser = ''
  }
  return { unread, tick, refresh, markRead, startRealtime, stopRealtime }
}
