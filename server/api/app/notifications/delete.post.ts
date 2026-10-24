// Hapus notifikasi: { ids: [...] }, { read: true } (semua yang sudah dibaca), atau { all: true } (semuanya).
// Hanya notifikasi milik sendiri (RLS); data order/reservasi tidak tersentuh.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readJson(event)
  let request = user.db.from('notifications').delete()
  if (body.all === true) {
    request = request.not('id', 'is', null)
  } else if (body.read === true) {
    request = request.not('read_at', 'is', null)
  } else {
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 500) throw badRequest('Pilih notifikasi yang akan dihapus.')
    request = request.in('id', body.ids.map((v) => uuidParam(v, 'ids')))
  }
  const { data, error } = await request.select('id')
  if (error) throw dbError(error)
  return { deleted: (data ?? []).length }
})
