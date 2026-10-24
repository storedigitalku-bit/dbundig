import { DEFAULT_ACCESS_TEMPLATE, DEFAULT_RECAP_TEMPLATE } from '../../../../../shared/whatsapp'

// Template pesan WhatsApp (khusus admin). null = memakai template bawaan.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { data, error } = await user.db.from('app_settings').select('key, value').in('key', ['wa.access_template', 'wa.recap_template'])
  if (error) throw dbError(error)
  const get = (key: string) => {
    const v = (data ?? []).find((r) => r.key === key)?.value
    return typeof v === 'string' && v.trim() ? v : null
  }
  return {
    access_template: get('wa.access_template'),
    recap_template: get('wa.recap_template'),
    defaults: { access: DEFAULT_ACCESS_TEMPLATE, recap: DEFAULT_RECAP_TEMPLATE },
  }
})
