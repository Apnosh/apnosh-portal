/**
 * Direct messages: the threads, one thread, and a reply into it.
 * ==============================================================
 * GET  ?clientId=…                                     → conversations, unread first
 * GET  ?clientId=…&conversationId=…&accountId=…        → that thread, oldest first
 * POST { clientId, conversationId, accountId, text }   → send one message
 *
 * Several owners said their customers reach them here rather than through
 * reviews, and one has no website at all, so her Instagram inbox is her shop.
 *
 * Through Zernio, the vendor already connected. Written against its OpenAPI
 * specification rather than its prose documentation, which was wrong seven times
 * across the comments endpoints.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { listConversations, listMessages, sendMessage } from '@/lib/channels/adapters/zernio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const clientId = p.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  const conversationId = p.get('conversationId')
  const accountId = p.get('accountId')
  try {
    if (conversationId && accountId) {
      return NextResponse.json({ messages: await listMessages(clientId, conversationId, accountId) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const all = await listConversations(clientId, 30)
    /* Unread first, then most recently active. An inbox is a queue to work, and
       a thread somebody is waiting on outranks one already handled. */
    const conversations = all.sort((a, b) =>
      (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) ||
      String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    return NextResponse.json(
      { conversations, unread: conversations.filter((c) => c.unread > 0).length },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    /* Say it failed. An empty inbox and an inbox we could not read are very
       different claims, and only one of them is ever true by accident. */
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load messages' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; conversationId?: string; accountId?: string; text?: string }
  const { clientId, conversationId, accountId, text } = body
  if (!clientId || !conversationId || !accountId || !text?.trim()) {
    return NextResponse.json({ error: 'clientId, conversationId, accountId and text required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  /* Private, but still sent in the business's name to a real customer. Capped so
     a paste accident cannot deliver an essay. */
  if (text.trim().length > 1500) {
    return NextResponse.json({ error: 'That message is too long' }, { status: 400 })
  }
  try {
    await sendMessage(clientId, conversationId, accountId, text.trim())
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not send' }, { status: 502 })
  }
}
