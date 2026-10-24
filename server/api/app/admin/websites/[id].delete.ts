// Hapus website (admin). Ditolak bila sudah memiliki data undangan/order; nonaktifkan saja agar data tetap aman.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const [inv, ord] = await Promise.all([
    user.db.from('invitations').select('id', { count: 'exact', head: true }).eq('website_id', id),
    user.db.from('form_orders').select('id', { count: 'exact', head: true }).eq('website_id', id),
  ])
  if (inv.error) throw dbError(inv.error)
  if (ord.error) throw dbError(ord.error)
  if ((inv.count ?? 0) > 0 || (ord.count ?? 0) > 0) {
    throw createError({
      statusCode: 409, statusMessage: 'in_use',
      data: { message: `Website masih memiliki ${inv.count ?? 0} undangan dan ${ord.count ?? 0} order. Ubah status menjadi Nonaktif untuk menghentikan koneksi.` },
    })
  }
  const { data, error } = await user.db.from('websites').delete().eq('id', id).select('id').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound()
  await audit(user, 'website.delete', id)
  return { ok: true }
})
