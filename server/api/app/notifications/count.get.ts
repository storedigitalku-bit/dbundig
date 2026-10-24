// Jumlah notifikasi belum dibaca (untuk lonceng; ringan, dipanggil berkala).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { count, error } = await user.db.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) throw dbError(error)
  return { unread: count ?? 0 }
})
