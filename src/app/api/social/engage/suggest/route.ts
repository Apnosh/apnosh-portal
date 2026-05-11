/**
 * POST /api/social/engage/suggest
 *
 * Body: { clientId, commentText, commenterName?, postCaption?, kind }
 * Returns the ReplySuggestion shape or { suggestion: null }.
 *
 * Auth: admin OR client owning the clientId.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { suggestReply } from '@/lib/admin/suggest-reply'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return new NextResponse('Invalid JSON', { status: 400 })
  }
  const { clientId, commentText, commenterName, postCaption, kind } = body as {
    clientId?: string
    commentText?: string
    commenterName?: string
    postCaption?: string
    kind?: 'comment' | 'dm' | 'mention'
  }
  if (!clientId || !commentText) {
    return new NextResponse('clientId and commentText required', { status: 400 })
  }

  // Auth scope
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'
  if (!isAdmin) {
    const [{ data: biz }, { data: cu }] = await Promise.all([
      supabase.from('businesses').select('client_id').eq('owner_id', user.id).eq('client_id', clientId).maybeSingle(),
      supabase.from('client_users').select('client_id').eq('auth_user_id', user.id).eq('client_id', clientId).maybeSingle(),
    ])
    if (!biz && !cu) {
      return new NextResponse('Not authorized for this client', { status: 403 })
    }
  }

  const suggestion = await suggestReply({
    clientId,
    commentText,
    commenterName: commenterName ?? null,
    postCaption: postCaption ?? null,
    kind: (kind === 'dm' || kind === 'mention') ? kind : 'comment',
  })

  return NextResponse.json({ suggestion })
}
