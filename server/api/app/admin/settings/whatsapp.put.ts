import { ACCESS_REQUIRED, RECAP_REQUIRED, TEMPLATE_MAX, missingPlaceholders } from '../../../../../shared/whatsapp'
import { cpLength } from '../../../../lib/contract'

// Simpan template pesan WhatsApp. Kosong/null = kembali ke template bawaan.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readJson(event)
  const items: Array<{ key: string; field: string; required: readonly string[]; label: string }> = [
    { key: 'wa.access_template', field: 'access_template', required: ACCESS_REQUIRED, label: 'Pesan akses akun' },
    { key: 'wa.recap_template', field: 'recap_template', required: RECAP_REQUIRED, label: 'Pesan rekap reservasi' },
  ]
  for (const it of items) {
    if (!(it.field in body)) continue
    const raw = body[it.field]
    if (raw !== null && typeof raw !== 'string') throw badRequest(`${it.label} tidak valid.`)
    const value = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : ''
    if (!value) {
      const { error } = await user.db.from('app_settings').delete().eq('key', it.key)
      if (error) throw dbError(error)
      continue
    }
    if (cpLength(value) > TEMPLATE_MAX) throw badRequest(`${it.label} maksimal ${TEMPLATE_MAX} karakter.`)
    const missing = missingPlaceholders(value, it.required)
    if (missing.length) throw badRequest(`${it.label} wajib memuat ${missing.map((m) => `{${m}}`).join(', ')}.`)
    const { error } = await user.db.from('app_settings').upsert({ key: it.key, value, updated_by: user.id, updated_at: new Date().toISOString() })
    if (error) throw dbError(error)
  }
  await audit(user, 'settings.update', 'whatsapp')
  return { ok: true }
})
