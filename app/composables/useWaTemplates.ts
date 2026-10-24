// Template pesan WhatsApp buatan admin (menu Pesan WhatsApp). Dimuat sekali per sesi; null = template bawaan.
const templates = ref<{ access: string | null; recap: string | null; loaded: boolean }>({ access: null, recap: null, loaded: false })
let pending: Promise<void> | null = null

export function useWaTemplates() {
  const api = useApi()
  function load(force = false): Promise<void> {
    if (templates.value.loaded && !force) return Promise.resolve()
    pending ??= api.request<{ access_template: string | null; recap_template: string | null }>('/api/app/admin/settings/whatsapp')
      .then((s) => { templates.value = { access: s.access_template, recap: s.recap_template, loaded: true } })
      // Gagal memuat → tetap pakai template bawaan (pesan tetap bisa dikirim).
      .catch(() => { templates.value = { ...templates.value, loaded: true } })
      .finally(() => { pending = null })
    return pending
  }
  return { templates, load }
}
