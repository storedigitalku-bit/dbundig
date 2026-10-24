// Riwayat aktivitas admin (access_audit; RLS khusus admin). Nama pelaku diambil dari profil.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { page, size, from, to } = pageParams(event, 30)
  const query = getQuery(event)
  let request = user.db.from('access_audit').select('id, actor_id, action, target, detail, created_at', { count: 'exact' })
  if (typeof query.action === 'string' && /^[a-z_]{1,40}$/.test(query.action)) request = request.like('action', `${query.action}.%`)
  const { data, error, count } = await request.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
  if (error) throw dbError(error)
  const actorIds = [...new Set((data ?? []).map((r) => r.actor_id).filter((v): v is string => typeof v === 'string'))]
  const names = new Map<string, string>()
  if (actorIds.length) {
    const people = await user.db.from('profiles').select('id, username, display_name').in('id', actorIds)
    if (people.error) throw dbError(people.error)
    for (const p of people.data ?? []) names.set(p.id, p.username || p.display_name || 'Akun')
  }
  return {
    items: (data ?? []).map((r) => ({
      id: r.id, action: r.action, target: r.target, created_at: r.created_at,
      actor: r.actor_id ? (names.get(r.actor_id) ?? 'Akun terhapus') : 'Sistem',
      // Detail hanya kunci ringkas; tidak pernah berisi password/token.
      detail: (r.detail ?? {}) as Record<string, unknown>,
    })),
    total: count ?? 0, page, per_page: size,
  }
})
