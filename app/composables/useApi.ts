import type { FetchError } from 'ofetch'

/** Respons 401 karena verifikasi dua langkah belum dilakukan (bukan sesi berakhir). */
export function isMfaRequired(err: unknown): boolean {
  const e = err as FetchError<{ statusMessage?: string }> & { statusMessage?: string }
  return e?.statusCode === 401 && (e.statusMessage === 'mfa_required' || e.data?.statusMessage === 'mfa_required')
}

/** Pesan error ramah dari respons server (tanpa detail teknis). */
export function errorMessage(err: unknown, fallback = 'Terjadi kesalahan. Silakan coba lagi.'): string {
  const e = err as FetchError<{ data?: { message?: string } }> & { message?: string }
  const msg = e?.data?.data?.message
  if (typeof msg === 'string' && msg) return msg
  if (e?.statusCode === 0 || /fetch failed|network/i.test(String(e?.message ?? ''))) return 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.'
  return fallback
}

export function useApi() {
  const auth = useAuth()

  async function authHeader(): Promise<Record<string, string>> {
    const { data } = await useSupabase().auth.getSession()
    const token = data.session?.access_token
    return token ? { authorization: `Bearer ${token}` } : {}
  }

  async function request<T>(url: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
    try {
      const res: unknown = await $fetch(url, { method: options.method ?? 'GET', body: options.body as Record<string, unknown> | undefined, query: options.query, headers: await authHeader() })
      return res as T
    } catch (err) {
      if (isMfaRequired(err)) {
        auth.mfaPending.value = true
        await navigateTo('/verifikasi')
      } else if ((err as FetchError).statusCode === 401) {
        await auth.signOut()
        await navigateTo({ path: '/login', query: { sesi: 'berakhir' } })
      }
      throw err
    }
  }

  /** Unduh CSV dengan header otorisasi (tanpa token di URL). */
  async function download(url: string, query: Record<string, unknown>, fallbackName: string) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
    const res = await fetch(`${url}?${params}`, { headers: await authHeader() })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw Object.assign(new Error('download_failed'), { statusCode: res.status, data })
    }
    const blob = await res.blob()
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  return { request, download }
}
