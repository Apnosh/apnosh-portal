import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDriveOAuthUrl } from '@/lib/google'

/**
 * GET /api/auth/google-drive?returnTo=/admin/clients/foo
 *
 * Admin-level Drive OAuth entry point. Unlike the per-client GA4/GSC
 * flows, this is a one-time grant for the Apnosh team that covers
 * access to every client's folder.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Confirm they're an admin before letting them grant team-wide access
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/admin'
  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    returnTo,
    ts: Date.now(),
  })).toString('base64url')

  return NextResponse.redirect(getDriveOAuthUrl(state))
}
