export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { data, error } = await user.db.from('websites')
    .select('id, name, site_url, external_site_id, bound_at, status, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) throw dbError(error)
  const tokens = await user.db.from('website_tokens').select('website_id, revoked_at, last_used_at')
  if (tokens.error) throw dbError(tokens.error)
  const stats = new Map<string, { active: number; last_used_at: string | null }>()
  for (const t of tokens.data ?? []) {
    const s = stats.get(t.website_id) ?? { active: 0, last_used_at: null }
    if (!t.revoked_at) s.active++
    if (t.last_used_at && (!s.last_used_at || t.last_used_at > s.last_used_at)) s.last_used_at = t.last_used_at
    stats.set(t.website_id, s)
  }
  return {
    items: (data ?? []).map((w) => ({ ...w, active_tokens: stats.get(w.id)?.active ?? 0, last_used_at: stats.get(w.id)?.last_used_at ?? null })),
  }
})
