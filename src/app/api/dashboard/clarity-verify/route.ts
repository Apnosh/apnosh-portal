/**
 * POST /api/dashboard/clarity-verify
 *
 * Triggers the server-side fetch + grep that confirms whether the
 * Clarity tracking snippet is actually live on the client's homepage.
 * Persists the result so the heatmaps + setup pages can show accurate
 * "snippet detected" / "snippet missing" state.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { verifyClarityInstallation } from '@/lib/dashboard/clarity-verify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.apnosh.com'), 303)
  }

  /* Resolve client_id same way the rest of the dashboard does. */
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: cu } = await admin
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle() as { data: { client_id: string } | null }
  if (!cu?.client_id) {
    return NextResponse.json({ error: 'No client account' }, { status: 404 })
  }

  await verifyClarityInstallation(cu.client_id)
  /* Redirect back to where they came from. The form posts as a
     traditional submission so a 303 to the heatmaps page is the
     cleanest UX — page reloads with fresh data. */
  return NextResponse.redirect(
    new URL('/dashboard/insights/heatmaps?verified=1', process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.apnosh.com'),
    303,
  )
}
