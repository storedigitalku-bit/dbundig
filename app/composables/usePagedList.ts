/** Daftar dengan pagination server-side + filter; respons lama diabaikan bila filter berubah. */
export function usePagedList<T>(url: string | (() => string), filters: Ref<Record<string, unknown>>, perPage = 20) {
  const api = useApi()
  const items = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(1)
  const loading = ref(false)
  const error = ref('')
  let seq = 0

  async function load() {
    const current = ++seq
    loading.value = true
    error.value = ''
    try {
      const target = typeof url === 'function' ? url() : url
      const res = await api.request<{ items: T[]; total: number }>(target, { query: { ...filters.value, page: page.value, per_page: perPage } })
      if (current !== seq) return
      items.value = res.items
      total.value = res.total
    } catch (err) {
      if (current !== seq) return
      error.value = errorMessage(err, 'Data gagal dimuat.')
    } finally {
      if (current === seq) loading.value = false
    }
  }

  watch(filters, () => { page.value = 1; void load() }, { deep: true })
  function setPage(p: number) { page.value = p; void load() }

  return { items, total, page, perPage, loading, error, load, setPage }
}
