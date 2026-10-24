import { isInternalEmail } from '../../../../lib/accounts'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { page, size, from, to } = pageParams(event, 50)
  const query = getQuery(event)
  let request = user.db.from('profiles').select('id, username, email, display_name, whatsapp, whatsapp_sent_at, created_at', { count: 'exact' })
  // Karakter penyusun filter PostgREST dibuang sebelum dipakai di or().
  const pattern = searchPattern(typeof query.q === 'string' ? query.q.replace(/[,()]/g, ' ') : query.q)
  if (pattern) request = request.or(`email.ilike.${pattern},username.ilike.${pattern},display_name.ilike.${pattern}`)
  const { data, error, count } = await request.order('created_at', { ascending: false }).range(from, to)
  if (error) throw dbError(error)
  const admins = await user.db.from('platform_admins').select('user_id')
  if (admins.error) throw dbError(admins.error)
  const adminIds = new Set((admins.data ?? []).map((a) => a.user_id))
  // Jumlah undangan yang diberikan ke tiap akun pada halaman ini.
  const ids = (data ?? []).map((p) => p.id)
  const counts = new Map<string, number>()
  const titles = new Map<string, string>()
  const invitationIds = new Map<string, string>()
  if (ids.length) {
    const access = await user.db.from('invitation_access').select('user_id, invitation_id, invitations(title)').in('user_id', ids).limit(10000)
    if (access.error) throw dbError(access.error)
    for (const row of access.data ?? []) {
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1)
      titles.set(row.user_id, (row.invitations as { title?: string } | null)?.title || 'Tanpa judul')
      invitationIds.set(row.user_id, row.invitation_id as string)
    }
  }
  return {
    items: (data ?? []).map((p) => ({
      id: p.id, username: p.username, display_name: p.display_name, whatsapp: p.whatsapp ?? null, whatsapp_sent_at: p.whatsapp_sent_at ?? null, created_at: p.created_at,
      email: isInternalEmail(p.email) ? '' : p.email,
      role: adminIds.has(p.id) ? 'admin' : 'customer',
      access_count: counts.get(p.id) ?? 0,
      access_title: titles.get(p.id) ?? null,
      access_invitation_id: invitationIds.get(p.id) ?? null,
    })),
    total: count ?? 0, page, per_page: size,
  }
})
