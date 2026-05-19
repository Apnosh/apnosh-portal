/**
 * Debug-only endpoint. Shows what the currently signed-in user's
 * session sees through RLS — useful for diagnosing sidebar gating
 * issues like "why doesn't my Local SEO tab show up."
 *
 * Delete when not actively debugging.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'no user', authErr }, { status: 401 })
  }

  /* Run the exact queries the sidebar does. */
  const { data: cu, error: cuErr } = await supabase
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const clientId = (cu as { client_id: string } | null)?.client_id ?? null

  let ccData = null
  let ccErr = null
  if (clientId) {
    const r = await supabase
      .from('channel_connections')
      .select('channel, access_token, status')
      .eq('client_id', clientId)
      .not('access_token', 'is', null)
    ccData = r.data
    ccErr = r.error
  }

  return NextResponse.json({
    userId: user.id,
    userEmail: user.email,
    clientId,
    clientLookupError: cuErr?.message,
    channelConnections: ccData,
    channelConnectionsError: ccErr?.message,
  })
}
