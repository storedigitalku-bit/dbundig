// Tandai dibaca: { ids: [...] } atau { all: true }. RLS membatasi ke notifikasi milik sendiri.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readJson(event)
  let request = user.db.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (body.all !== true) {
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 500) throw badRequest('Pilih notifikasi yang akan ditandai.')
    request = request.in('id', body.ids.map((v) => uuidParam(v, 'ids')))
  }
  const { data, error } = await request.select('id')
  if (error) throw dbError(error)
  return { updated: (data ?? []).length }
})
