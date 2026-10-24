// Siapa yang dapat melihat undangan ini: akses eksplisit + pemetaan pemilik.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const { data: invitation, error } = await user.db.from('invitations').select('id, website_id, owner_external_id').eq('id', id).maybeSingle()
  if (error) throw dbError(error)
  if (!invitation) throw notFound()
  const explicit = await user.db.from('invitation_access')
    .select('user_id, created_at, profiles!invitation_access_user_id_fkey(username, email, display_name)').eq('invitation_id', id)
  if (explicit.error) throw dbError(explicit.error)
  let mapped: unknown[] = []
  if (invitation.owner_external_id) {
    const m = await user.db.from('owner_mappings')
      .select('id, user_id, external_owner_id, profiles!owner_mappings_user_id_fkey(username, email, display_name)')
      .eq('website_id', invitation.website_id).eq('external_owner_id', invitation.owner_external_id)
    if (m.error) throw dbError(m.error)
    mapped = m.data ?? []
  }
  return { owner_external_id: invitation.owner_external_id, explicit: explicit.data ?? [], mapped }
})
