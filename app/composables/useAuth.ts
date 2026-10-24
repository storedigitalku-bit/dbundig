import type { Session } from '@supabase/supabase-js'

export interface Me {
  id: string
  username: string | null
  email: string
  display_name: string
  role: 'admin' | 'customer'
  created_at: string | null
}

let initPromise: Promise<void> | null = null

export function useAuth() {
  const session = useState<Session | null>('auth-session', () => null)
  const me = useState<Me | null>('auth-me', () => null)
  const ready = useState<boolean>('auth-ready', () => false)
  // Akun dengan verifikasi dua langkah: sudah login (password benar) tetapi kode authenticator belum dimasukkan.
  const mfaPending = useState<boolean>('auth-mfa-pending', () => false)

  async function loadMe(): Promise<Me | null> {
    if (!session.value) { me.value = null; return null }
    try {
      me.value = await $fetch<Me>('/api/app/me', { headers: { authorization: `Bearer ${session.value.access_token}` } })
      mfaPending.value = false
    } catch (err) {
      me.value = null
      mfaPending.value = isMfaRequired(err)
    }
    return me.value
  }

  function init(): Promise<void> {
    if (initPromise) return initPromise
    initPromise = (async () => {
      if (!supabaseConfigured()) { ready.value = true; return }
      const supabase = useSupabase()
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      supabase.auth.onAuthStateChange((event, next) => {
        session.value = next
        if (event === 'SIGNED_OUT') me.value = null
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void loadMe()
      })
      if (session.value) await loadMe()
      ready.value = true
    })()
    return initPromise
  }

  /** Login dengan username ATAU email lewat server (username dipetakan ke akun di server). */
  async function signIn(identifier: string, password: string) {
    const res = await $fetch<{ session: { access_token: string; refresh_token: string } }>('/api/app/auth/login', {
      method: 'POST', body: { identifier, password },
    })
    const { data, error } = await useSupabase().auth.setSession({ access_token: res.session.access_token, refresh_token: res.session.refresh_token })
    if (error) throw error
    session.value = data.session
    await loadMe()
  }

  /** Masukkan kode 6 digit dari aplikasi authenticator → sesi naik ke aal2. */
  async function verifyMfa(code: string) {
    const supabase = useSupabase()
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) throw listError
    const factor = factors.totp.find((f) => f.status === 'verified')
    if (!factor) throw new Error('Verifikasi dua langkah tidak ditemukan untuk akun ini.')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    if (error) throw error
    session.value = (await supabase.auth.getSession()).data.session
    await loadMe()
    if (mfaPending.value) throw new Error('Kode belum diterima server. Coba lagi.')
  }

  async function signOut() {
    await useSupabase().auth.signOut().catch(() => {})
    session.value = null
    me.value = null
    mfaPending.value = false
  }

  const isAdmin = computed(() => me.value?.role === 'admin')
  return { session, me, ready, isAdmin, mfaPending, init, loadMe, signIn, signOut, verifyMfa }
}
