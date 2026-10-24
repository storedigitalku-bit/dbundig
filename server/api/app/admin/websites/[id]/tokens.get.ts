// token_hash tidak pernah dipilih (dan tidak dapat dibaca role authenticated).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data, error } = await user.db.from('website_tokens')
    .select('id, label, token_hint, scopes, created_at, last_used_at, revoked_at, replaced_by')
    .eq('website_id', id).order('created_at', { ascending: false })
  if (error) throw dbError(error)
  return { items: data ?? [] }
})
