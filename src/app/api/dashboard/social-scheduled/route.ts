/**
 * What is going out, what went out, and what you handed to Apnosh.
 * ================================================================
 * GET    ?clientId=…            → scheduled, failed, and drafts with your team
 * DELETE ?clientId=…&postId=…   → call one off before it goes
 *
 * The composer could schedule a post and then there was nowhere to see it,
 * change it or stop it. That is worse than not scheduling at all: the owner has
 * handed over a promise with no way to check it was kept.
 *
 * Two sources on one screen on purpose. A post waiting at the vendor and a brief
 * waiting with your team are the same thing to an owner -- something they have
 * asked for that has not happened yet -- and splitting them across two screens
 * would be the product's plumbing showing through.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { listScheduledPosts, cancelScheduledPost } from '@/lib/channels/adapters/zernio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  const admin = createAdminClient()
  const [postsR, draftsR] = await Promise.allSettled([
    listScheduledPosts(clientId, 50),
    admin.from('content_drafts')
      .select('id, idea, caption, status, target_platforms, target_publish_date, created_at')
      .eq('client_id', clientId)
      .in('status', ['idea', 'draft', 'revising', 'approved'])
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const all = postsR.status === 'fulfilled' ? postsR.value : []
  /* Waiting first, then anything that failed, then what already went. An owner
     opens this to check on what has NOT happened yet. */
  const waiting = all.filter((p) => ['scheduled', 'pending', 'queued', 'draft'].includes(p.status))
  const failed = all.filter((p) => p.status === 'failed' || p.failure)
  const sent = all.filter((p) => ['published', 'sent', 'posted'].includes(p.status)).slice(0, 10)

  const withTeam = draftsR.status === 'fulfilled' && !draftsR.value.error
    ? (draftsR.value.data ?? []).map((d: Record<string, unknown>) => ({
      id: String(d.id),
      idea: String(d.caption || d.idea || 'A post you asked us to write'),
      status: String(d.status),
      platforms: Array.isArray(d.target_platforms) ? (d.target_platforms as string[]) : [],
      wantedFor: d.target_publish_date ? String(d.target_publish_date) : null,
    }))
    : []

  return NextResponse.json(
    {
      waiting, failed, sent, withTeam,
      /* Say so rather than showing an empty list as if it were the truth. */
      error: postsR.status === 'rejected'
        ? (postsR.reason instanceof Error ? postsR.reason.message : 'Could not reach your accounts')
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function DELETE(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  const postId = req.nextUrl.searchParams.get('postId')
  if (!clientId || !postId) return NextResponse.json({ error: 'clientId and postId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  try {
    /* The post must be one of THIS client's, checked against their own list
       rather than trusted from the request. Otherwise an id typed into a URL
       cancels somebody else's post. */
    const mine = await listScheduledPosts(clientId, 100)
    if (!mine.some((p) => p.id === postId)) {
      return NextResponse.json({ error: 'That post is not yours' }, { status: 403 })
    }
    await cancelScheduledPost(clientId, postId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not cancel it' }, { status: 502 })
  }
}
