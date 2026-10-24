// Hapus banyak undangan sekaligus beserta isinya (admin, satu transaksi). Body: { ids: string[] } (maks. 500).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readJson(event)
  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 500) throw badRequest('Pilih 1–500 undangan.')
  const ids = [...new Set(body.ids.map((v, i) => uuidParam(v, `ids[${i}]`)))]
  const { data, error } = await user.db.rpc('admin_invitations_delete', { p_ids: ids })
  if (error) throw rpcError(error)
  return data as { invitations: number; reservations: number }
})
