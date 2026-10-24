import { normalizeWhatsapp } from '../../../../../../shared/whatsapp'

// Catat bahwa akses akun sudah dikirim lewat WhatsApp (tombol jadi abu-abu). Nomor tujuan ikut disimpan
// bila diisi/diubah di popup kirim. Isi pesan & password tidak pernah dikirim ke server.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  const patch: Record<string, unknown> = { whatsapp_sent_at: new Date().toISOString() }
  if (body.whatsapp !== undefined) {
    const wa = normalizeWhatsapp(body.whatsapp)
    if (!wa) throw badRequest('Nomor WhatsApp tidak valid. Gunakan nomor aktif, mis. 0812-3456-7890 atau +62 812 3456 7890.')
    patch.whatsapp = wa
  }
  const service = useServiceClient()
  if (!service) throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'NUXT_SUPABASE_SECRET_KEY belum diisi pada server.' } })
  const { data, error } = await service.from('profiles').update(patch).eq('id', id).select('whatsapp, whatsapp_sent_at').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound('Akun tidak ditemukan.')
  await audit(user, 'user.whatsapp_sent', id)
  return { whatsapp: data.whatsapp, whatsapp_sent_at: data.whatsapp_sent_at }
})
