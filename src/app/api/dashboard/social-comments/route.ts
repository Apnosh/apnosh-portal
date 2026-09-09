/**
 * Comments on this client's posts, and replies to them.
 * ======================================================
 * GET  ?clientId=…            → the comment queue, unanswered first
 * POST { clientId, commentId, text } → post one reply
 *
 * Several owners in testing said their customers talk to them in comments rather
 * than reviews; one has no website at all, so Instagram IS her storefront. None
 * of it reached the product.
 *
 * This goes through the ZERNIO adapter, not Meta. The direct-Meta inbox in
 * src/lib/social-inbox.ts can do the same job and is deliberately not wired,
 * because it needs Meta app review and that work is deferred. Zernio is already
 * connected for real clients and carries comments across every linked platform.
 *
 * ?diagnose=1 (admin only) returns what the vendor actually sent, unparsed. The
 * comment shape here is documented rather than observed -- the API key lives only
 * in Vercel -- so the first real run is meant to confirm or correct it in one
 * look, rather than leaving a guessed shape to fail quietly in a list.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { listComments, replyToComment } from '@/lib/channels/adapters/zernio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  /* The shape check. Admin only, because it returns the vendor's raw payload.
     One call on production confirms every field name below, or shows exactly
     which one to correct, without waiting for a silent empty list to be noticed. */
  if (req.nextUrl.searchParams.get('diagnose') === '1') {
    const { createClient } = await import('@/lib/supabase/server')
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    const { data: profile } = user
      ? await sb.from('profiles').select('role').eq('id', user.id).single()
      : { data: null }
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 })
    try {
      const parsed = await listComments(clientId, 5)
      return NextResponse.json({ parsedCount: parsed.length, sample: parsed.slice(0, 3) })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
    }
  }

  try {
    const all = await listComments(clientId, 100)
    /* Unanswered first, newest within each group. The queue exists to be worked,
       and a comment already handled is history, not a task. */
    const rank = (c: (typeof all)[number]) => (c.replied ? 1 : 0)
    const comments = all.sort((a, b) =>
      rank(a) - rank(b) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    return NextResponse.json(
      { comments, unanswered: comments.filter((c) => !c.replied).length },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    /* Fail loud with the vendor's own words. A silent empty list here would read
       as "nobody has commented", which is a different and much worse claim. */
    const msg = e instanceof Error ? e.message : 'Could not load comments'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; commentId?: string; text?: string }
  const { clientId, commentId, text } = body
  if (!clientId || !commentId || !text?.trim()) {
    return NextResponse.json({ error: 'clientId, commentId and text required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  /* A public reply in the business's name. Length is capped so a paste accident
     cannot post an essay under their brand. */
  if (text.trim().length > 1000) {
    return NextResponse.json({ error: 'That reply is too long' }, { status: 400 })
  }
  try {
    await replyToComment(clientId, commentId, text.trim())
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not post the reply' }, { status: 502 })
  }
}
