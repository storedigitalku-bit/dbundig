// Hapus satu undangan beserta reservasi, katalog, dan aksesnya (admin, satu transaksi).
// Bila halaman undangan di WordPress masih aktif, undangan akan tercatat lagi (tanpa reservasi lama) saat widget dibuka.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data, error } = await user.db.rpc('admin_invitations_delete', { p_ids: [id] })
  if (error) throw rpcError(error)
  const result = data as { invitations: number; reservations: number }
  if (!result.invitations) throw notFound()
  return result
})
