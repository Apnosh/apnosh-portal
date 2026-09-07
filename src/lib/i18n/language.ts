import 'server-only'
/**
 * The client's language, read on the server.
 *
 * One helper, so a server component or a route never writes its own read of the column and
 * never has to decide what a missing column means. Safe before migration 259 runs: a missing
 * column comes back as 42703 (or PostgREST's PGRST204) and we return English, which is what
 * every owner is being shown today. Never throws.
 *
 * The client half of this lives in components/mvp/mvp-language.tsx, which reads the same field
 * off the client row the app already resolved.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_LANG, isLang, type Lang } from './t'

export async function getClientLanguage(clientId: string): Promise<Lang> {
  if (!clientId) return DEFAULT_LANG
  try {
    const { data, error } = await createAdminClient()
      .from('clients')
      .select('preferred_language')
      .eq('id', clientId)
      .maybeSingle()
    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204') {
        console.warn('[getClientLanguage] clients.preferred_language is missing; run migration 259. Using English.')
      } else {
        console.warn('[getClientLanguage] read failed:', error.message)
      }
      return DEFAULT_LANG
    }
    const v = (data as { preferred_language?: unknown } | null)?.preferred_language
    return isLang(v) ? v : DEFAULT_LANG
  } catch (e) {
    console.warn('[getClientLanguage] threw:', e)
    return DEFAULT_LANG
  }
}
