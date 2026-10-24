import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Klien browser: HANYA URL + publishable key. Data dibaca lewat API server, bukan langsung. */
export function useSupabase(): SupabaseClient {
  if (client) return client
  const config = useRuntimeConfig()
  client = createClient(config.public.supabaseUrl || 'http://supabase.invalid', config.public.supabasePublishableKey || 'missing', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  })
  return client
}

export function supabaseConfigured(): boolean {
  const config = useRuntimeConfig()
  return !!config.public.supabaseUrl && !!config.public.supabasePublishableKey
}
