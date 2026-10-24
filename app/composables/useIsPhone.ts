// Mode ponsel = lebar < 768px (sama dengan batas menu bawah). Satu pendengar matchMedia dipakai bersama.
const QUERY = '(max-width: 767.98px)'
const isPhone = ref(false)
let bound = false

export function useIsPhone() {
  if (!bound && typeof window !== 'undefined' && 'matchMedia' in window) {
    bound = true
    const mq = window.matchMedia(QUERY)
    isPhone.value = mq.matches
    mq.addEventListener('change', (e) => { isPhone.value = e.matches })
  }
  return isPhone
}

/** Jumlah baris daftar ringkas di ponsel (Hadiah terpopuler, Data form masuk, Aktivitas, Katalog). */
export const PHONE_LIST_LIMIT = 4
