// Ringkasan. Pelanggan hanya menerima angka Daftar Hadiah miliknya — tanpa Form Order.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { data, error } = await user.db.rpc('my_registry_summary')
  if (error) throw dbError(error)
  const recent = await user.db.from('reservation_report')
    .select('id, invitation_id, invitation_title, gift_name, guest_name, created_at, status')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(5)
  if (recent.error) throw dbError(recent.error)
  const summary = { registry: data as Record<string, number>, recent: recent.data }
  if (!user.isAdmin) return summary
  const platform = await user.db.rpc('admin_platform_summary')
  if (platform.error) throw dbError(platform.error)
  return { ...summary, platform: platform.data }
})
