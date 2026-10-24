// Atur akses undangan satu akun pelanggan sekaligus: body { invitation_ids } menjadi daftar akses akhirnya.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  const ids = invitationIdsParam(body.invitation_ids)
  const target = await admin.db.from('profiles').select('id').eq('id', id).maybeSingle()
  if (target.error) throw dbError(target.error)
  if (!target.data) throw notFound('Akun tidak ditemukan.')
  const isAdmin = await admin.db.from('platform_admins').select('user_id').eq('user_id', id).maybeSingle()
  if (isAdmin.error) throw dbError(isAdmin.error)
  if (isAdmin.data) throw badRequest('Admin platform sudah melihat semua undangan; akses hanya diatur untuk akun pelanggan.')
  return await syncUserAccess(admin, id, ids)
})
