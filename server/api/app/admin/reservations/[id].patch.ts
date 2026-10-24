import { normalizeWhatsapp } from '../../../../lib/crud'

// Ubah reservasi (admin): data tamu, status terkonfirmasi/dibatalkan, catatan.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  const whatsapp = normalizeWhatsapp(body.guest_whatsapp)
  if (!whatsapp) throw badRequest('Nomor WhatsApp tidak valid (contoh: 0812xxxxxxxx atau 62812xxxxxxxx).')
  if (body.status !== 'confirmed' && body.status !== 'cancelled') throw badRequest('Status tidak valid.')
  const { error } = await user.db.rpc('admin_reservation_update', {
    p_id: id,
    p_name: typeof body.guest_name === 'string' ? body.guest_name : '',
    p_whatsapp: whatsapp,
    p_message: typeof body.message === 'string' ? body.message : '',
    p_status: body.status,
    p_note: typeof body.admin_note === 'string' ? body.admin_note : '',
  })
  if (error) throw rpcError(error)
  return { ok: true }
})
