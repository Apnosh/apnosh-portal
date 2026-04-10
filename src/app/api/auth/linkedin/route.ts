import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLinkedInOAuthUrl } from '@/lib/linkedin'

/**
 * GET /api/auth/linkedin?clientId=xxx
 * Initiates LinkedIn OAuth flow. Admin only.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const state = Buffer.from(JSON.stringify({ clientId, userId: user.id, ts: Date.now() })).toString('base64url')
  return NextResponse.redirect(getLinkedInOAuthUrl(state))
}
