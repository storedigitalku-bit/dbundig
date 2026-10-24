// Hapus akun (admin). Akses undangan & pemetaannya ikut terhapus; data undangan/reservasi tidak tersentuh.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  if (id === admin.id) throw badRequest('Anda tidak dapat menghapus akun Anda sendiri.')
  const service = useServiceClient()
  if (!service) throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'NUXT_SUPABASE_SECRET_KEY belum diisi pada server.' } })
  const { data: isAdminRow } = await service.from('platform_admins').select('user_id').eq('user_id', id).maybeSingle()
  if (isAdminRow) {
    const { count } = await service.from('platform_admins').select('user_id', { count: 'exact', head: true })
    if ((count ?? 0) <= 1) throw badRequest('Admin platform terakhir tidak dapat dihapus.')
  }
  const { error } = await service.auth.admin.deleteUser(id)
  if (error) throw createError({ statusCode: /not.?found/i.test(error.message) ? 404 : 502, statusMessage: 'delete_failed', data: { message: 'Akun gagal dihapus.' } })
  await audit(admin, 'user.delete', id)
  return { ok: true }
})
