import { hashToken } from '../../../../../lib/integration'
import { generateWebsiteToken, parseScopes, tokenHint } from '../../../../../lib/tokens'

// Token lengkap hanya dikembalikan SEKALI pada respons ini. Yang disimpan hanya HMAC-nya.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const secret = useRuntimeConfig().tokenHashSecret
  if (!secret || secret.length < 32) {
    throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'NUXT_TOKEN_HASH_SECRET belum diisi pada server.' } })
  }
  const body = await readJson(event)
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : ''
  const scopes = parseScopes(body.scopes)
  if (!scopes) throw badRequest('Pilih izin modul yang valid.')
  const token = generateWebsiteToken()
  const { data, error } = await user.db.from('website_tokens')
    .insert({ website_id: id, label, token_hash: hashToken(token, secret), token_hint: tokenHint(token), scopes, created_by: user.id })
    .select('id, label, token_hint, scopes, created_at, last_used_at, revoked_at').single()
  if (error) throw dbError(error)
  await audit(user, 'token.create', data.id, { website_id: id, scopes })
  setResponseStatus(event, 201)
  return { ...data, token }
})
