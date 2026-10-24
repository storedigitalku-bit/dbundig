import { RECAP_LIST_LIMIT } from '../../../../../../shared/whatsapp'

// Rekap reservasi satu undangan untuk dikirim ke mempelai lewat WhatsApp (khusus admin).
// Hanya nama hadiah & nama tamu (tanpa nomor WhatsApp tamu atau ucapan).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const inv = await user.db.from('invitation_overview').select('id, title, website_name').eq('id', id).maybeSingle()
  if (inv.error) throw dbError(inv.error)
  if (!inv.data) throw notFound()
  // Jumlah seluruh reservasi terkonfirmasi + 6 terbaru saja (sisanya dilihat pelanggan di web).
  const res = await user.db.from('reservations').select('gift_name, guest_name, created_at', { count: 'exact' })
    .eq('invitation_id', id).eq('status', 'confirmed').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(RECAP_LIST_LIMIT)
  if (res.error) throw dbError(res.error)
  // Pemegang undangan (akses 1:1): akses eksplisit, atau pemetaan otomatis pemiliknya.
  const acc = await user.db.from('invitation_access').select('profiles!invitation_access_user_id_fkey(id, username, display_name, whatsapp)').eq('invitation_id', id).limit(1).maybeSingle()
  if (acc.error) throw dbError(acc.error)
  let holder = (acc.data?.profiles ?? null) as { id: string; username: string | null; display_name: string; whatsapp: string | null } | null
  if (!holder) {
    const owner = await user.db.from('invitations').select('website_id, owner_external_id').eq('id', id).maybeSingle()
    if (owner.error) throw dbError(owner.error)
    if (owner.data?.owner_external_id) {
      const map = await user.db.from('owner_mappings').select('profiles!owner_mappings_user_id_fkey(id, username, display_name, whatsapp)')
        .eq('website_id', owner.data.website_id).eq('external_owner_id', owner.data.owner_external_id).limit(1).maybeSingle()
      if (map.error) throw dbError(map.error)
      holder = (map.data?.profiles ?? null) as typeof holder
    }
  }
  return {
    title: inv.data.title || 'Tanpa judul',
    website_name: inv.data.website_name ?? null,
    total: res.count ?? (res.data ?? []).length,
    latest: (res.data ?? []).map((r) => ({ gift: String(r.gift_name || 'Hadiah'), guest: String(r.guest_name) })),
    holder: holder ? { id: holder.id, username: holder.username, name: holder.display_name || holder.username || 'Pelanggan', whatsapp: holder.whatsapp } : null,
  }
})
