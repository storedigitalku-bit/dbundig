/**
 * Toast sementara: satu pesan aktif, hilang otomatis setelah 5 detik.
 * Pesan baru menggantikan pesan lama dan mengulang timer (tidak bertumpuk).
 * Status permanen (mis. koneksi) TIDAK memakai toast.
 */
export type ToastType = 'success' | 'error' | 'info'
export interface ToastState { id: number; type: ToastType; message: string }

export const TOAST_DURATION_MS = 5000
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

export function useToast() {
  const current = useState<ToastState | null>('toast', () => null)
  function show(type: ToastType, message: string) {
    if (timer) clearTimeout(timer)
    current.value = { id: ++seq, type, message }
    timer = setTimeout(() => { current.value = null; timer = null }, TOAST_DURATION_MS)
  }
  function dismiss() {
    if (timer) clearTimeout(timer)
    timer = null
    current.value = null
  }
  return {
    current,
    dismiss,
    success: (m: string) => show('success', m),
    error: (m: string) => show('error', m),
    info: (m: string) => show('info', m),
  }
}
