/**
 * Server-side admin-only gate for /admin/* sub-pages that operate on
 * agency-wide tools (Site Builder, Operator, ops handoff). Strategists
 * can drill into a client but cannot use these. We redirect them back
 * to the safer /work surface instead of leaving them stuck on a 403.
 */

import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function requireAdminUser(): Promise<{ userId: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile?.role as string | null) !== 'admin') {
    // Non-admin strategist would land here when clicking a deep link
    // they shouldn't have access to. Send them to their workday hub.
    redirect('/work/today')
  }

  return { userId: user.id }
}
