import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramDirectOAuthUrl } from '@/lib/instagram'

/**
 * GET /api/auth/instagram-direct?clientId=xxx
 * Initiates Instagram Direct Login (not Facebook login).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const state = Buffer.from(JSON.stringify({ clientId, userId: user.id, ts: Date.now() })).toString('base64url')
  return NextResponse.redirect(getInstagramDirectOAuthUrl(state))
}
