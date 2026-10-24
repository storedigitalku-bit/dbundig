// Profil sendiri: hanya display_name (hak kolom DB juga hanya mengizinkan kolom ini).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readJson(event)
  const name = typeof body.display_name === 'string' ? body.display_name.trim() : null
  if (name === null || name.length > 120) throw badRequest('Nama tampilan maksimal 120 karakter.')
  const { error } = await user.db.from('profiles').update({ display_name: name }).eq('id', user.id)
  if (error) throw dbError(error)
  return { ok: true, display_name: name }
})
