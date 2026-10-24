import { passwordProblem } from '../../../../../lib/accounts'

// Admin mengatur ulang password akun (pengganti "lupa password" lewat email).
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  const problem = passwordProblem(body.password)
  if (problem) throw badRequest(problem)
  const service = useServiceClient()
  if (!service) {
    throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'NUXT_SUPABASE_SECRET_KEY belum diisi pada server.' } })
  }
  const exists = await user.db.from('profiles').select('id').eq('id', id).maybeSingle()
  if (exists.error) throw dbError(exists.error)
  if (!exists.data) throw notFound('Akun tidak ditemukan.')
  const { error } = await service.auth.admin.updateUserById(id, { password: body.password as string })
  if (error) throw createError({ statusCode: 502, statusMessage: 'update_failed', data: { message: 'Password gagal diperbarui oleh Supabase Auth.' } })
  {
    const { error: sentError } = await service.from('profiles').update({ whatsapp_sent_at: null }).eq('id', id)
    if (sentError) console.error(JSON.stringify({ scope: 'user.password_reset', step: 'whatsapp_sent_at', code: sentError.code ?? null }))
  }
  await audit(user, 'user.password_reset', id)
  return { ok: true }
})
