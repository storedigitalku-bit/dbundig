import { normalizeWhatsapp } from '../../../../lib/crud'

// Tambah reservasi manual (admin). Stok diperiksa dalam transaksi database (lock baris hadiah).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readJson(event)
  const giftId = uuidParam(body.gift_id, 'gift_id')
  const whatsapp = normalizeWhatsapp(body.guest_whatsapp)
  if (!whatsapp) throw badRequest('Nomor WhatsApp tidak valid (contoh: 0812xxxxxxxx atau 62812xxxxxxxx).')
  const { data, error } = await user.db.rpc('admin_reservation_create', {
    p_gift: giftId,
    p_name: typeof body.guest_name === 'string' ? body.guest_name : '',
    p_whatsapp: whatsapp,
    p_message: typeof body.message === 'string' ? body.message : '',
    p_note: typeof body.admin_note === 'string' ? body.admin_note : '',
  })
  if (error) throw rpcError(error)
  setResponseStatus(event, 201)
  return { id: data as string }
})
