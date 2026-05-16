'use server'

/**
 * Admin-only: re-extract facts for one client on demand. Useful when
 * a strategist just connected a new channel or finished onboarding
 * and doesn't want to wait for the nightly cron.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractFactsForClient, type ExtractResult } from '@/lib/agent/fact-extractor'

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: 'Admin required' }
  return { userId: user.id }
}

export async function refreshFactsForClient(
  clientId: string,
): Promise<{ success: true; result: ExtractResult } | { success: false; error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { success: false, error: ctx.error }
  try {
    const result = await extractFactsForClient(clientId)
    return { success: true, result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
