export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  const userId = uuidParam(body.user_id, 'user_id')
  const has = await existingAccess(user, userId)
  if (has.invitationId && has.invitationId !== id) {
    throw createError({ statusCode: 409, statusMessage: 'user_has_access', data: { message: `Akun ini sudah punya akses ke undangan "${has.title}". ${ONE_INVITATION_MESSAGE} Cabut aksesnya dulu atau ganti lewat menu Pengguna & Akses.` } })
  }
  if (has.invitationId === id) return { ok: true }
  if (has.mapped) {
    throw createError({ statusCode: 409, statusMessage: 'user_has_access', data: { message: `Akun ini sudah mendapat undangan lewat pemetaan otomatis. ${ONE_INVITATION_MESSAGE}` } })
  }
  const holder = await invitationHolder(user, id, userId)
  if (holder) throw invitationTaken(holder)
  const { error } = await user.db.from('invitation_access').insert({ invitation_id: id, user_id: userId, granted_by: user.id })
  if (error) throw dbError(error)
  await audit(user, 'access.grant', id, { user_id: userId })
  setResponseStatus(event, 201)
  return { ok: true }
})
