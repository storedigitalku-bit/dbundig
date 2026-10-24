import { createClient } from '@supabase/supabase-js'
import { handleLogin } from '../../../lib/accounts'

// Login dashboard dengan username ATAU email. Password tidak pernah dicatat di log.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const service = useServiceClient()
  if (!service || !config.public.supabasePublishableKey) {
    throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'Konfigurasi server belum lengkap.' } })
  }
  const body = await readBody(event).catch(() => null) as Record<string, unknown> | null
  const result = await handleLogin({
    identifier: body?.identifier,
    password: body?.password,
    ip: getRequestIP(event, { xForwardedFor: true }) ?? '',
  }, {
    async allow(bucket, limit) {
      const { data, error } = await service.rpc('api_login_attempt', { p_bucket: bucket, p_limit: limit })
      if (error) {
        // Secret key salah/ditolak atau migrasi belum diterapkan — bukan "terlalu banyak percobaan".
        console.error(JSON.stringify({ scope: 'login', code: error.code ?? null }))
        throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'Konfigurasi server tidak valid: secret key Supabase ditolak. Hubungi admin.' } })
      }
      return data === true
    },
    async resolveUsername(username) {
      const { data } = await service.from('profiles').select('email').eq('username', username).maybeSingle()
      return data?.email || null
    },
    async signIn(email, password) {
      const anon = createClient(config.public.supabaseUrl, config.public.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { data, error } = await anon.auth.signInWithPassword({ email, password })
      if (error || !data.session) return null
      const s = data.session
      return { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type }
    },
  })
  setResponseHeader(event, 'cache-control', 'no-store')
  if (result.status !== 200) {
    throw createError({ statusCode: result.status, statusMessage: 'login_failed', data: { message: result.body.message } })
  }
  return result.body
})
