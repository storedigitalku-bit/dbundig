import { ORDER_STATUSES, buildOrderFields } from '../../../../lib/crud'

// Ubah Order Undangan (admin): status & catatan untuk semua order; judul & isi field hanya untuk order input manual.
// Isi order dari widget (dikirim klien) hanya-lihat — juga dikunci trigger database.
// payload_hash asli tidak diubah sehingga retry dari WordPress tetap dikenali (idempoten).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  if (body.post_title !== undefined || body.entries !== undefined) {
    const current = await user.db.from('form_orders').select('source').eq('id', id).maybeSingle()
    if (current.error) throw dbError(current.error)
    if (!current.data) throw notFound()
    if (current.data.source !== 'admin') {
      throw createError({ statusCode: 409, statusMessage: 'widget_order_readonly', data: { message: 'Isi order dari widget hanya dapat dilihat. Ubah status atau catatan admin saja.' } })
    }
  }
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !(ORDER_STATUSES as readonly string[]).includes(body.status)) throw badRequest('Status tidak valid.')
    patch.status = body.status
  }
  if (body.admin_note !== undefined) {
    if (typeof body.admin_note !== 'string' || body.admin_note.length > 2000) throw badRequest('Catatan maksimal 2000 karakter.')
    patch.admin_note = body.admin_note.trim()
  }
  if (body.post_title !== undefined) {
    if (typeof body.post_title !== 'string' || body.post_title.length > 1000) throw badRequest('Judul tidak valid.')
    patch.post_title = body.post_title.trim()
  }
  if (body.entries !== undefined) {
    const built = buildOrderFields(body.entries)
    if (typeof built === 'string') throw badRequest(built)
    patch.fields = built.fields
    patch.labels = built.labels
  }
  if (!Object.keys(patch).length) throw badRequest('Tidak ada perubahan.')
  const { data, error } = await user.db.from('form_orders').update(patch).eq('id', id).select('id').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound()
  await audit(user, 'order.update', id, { fields: Object.keys(patch) })
  return { ok: true }
})
