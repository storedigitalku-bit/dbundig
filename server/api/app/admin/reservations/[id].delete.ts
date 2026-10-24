// Hapus reservasi (admin). Stok hadiah otomatis kembali.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { error } = await user.db.rpc('admin_reservation_delete', { p_id: id })
  if (error) throw rpcError(error)
  return { ok: true }
})
