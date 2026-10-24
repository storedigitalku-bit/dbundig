import { hashToken } from '../../../../../lib/integration'
import { generateWebsiteToken, tokenHint } from '../../../../../lib/tokens'

// Rotasi atomik (RPC): token lama dicabut, token baru ditampilkan sekali.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const secret = useRuntimeConfig().tokenHashSecret
  if (!secret || secret.length < 32) {
    throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'NUXT_TOKEN_HASH_SECRET belum diisi pada server.' } })
  }
  const token = generateWebsiteToken()
  const { data, error } = await user.db.rpc('admin_rotate_token', { p_token: id, p_new_hash: hashToken(token, secret), p_new_hint: tokenHint(token) })
  if (error) {
    if (error.message === 'not_found') throw notFound('Token tidak ditemukan atau sudah dicabut.')
    throw dbError(error)
  }
  return { id: data as string, token, token_hint: tokenHint(token) }
})
