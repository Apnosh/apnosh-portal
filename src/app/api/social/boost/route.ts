/**
 * POST /api/social/boost
 *
 * Owner approves a boost spec in /dashboard/social/boost. We write a
 * row to ad_campaigns with status='pending' so the strategist sees it
 * in their queue and launches it in Meta Ads Manager. The same table
 * stores the live campaign id and cached metrics once the strategist
 * launches, so this single table is the spine of the boost lifecycle.
 *
 * Direct Meta Ads launch goes here when we wire the Marketing API.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  clientId: string
  postId: string
  budget: number
  days: number
  audience: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  if (!body.clientId || !body.postId || !body.budget || !body.days || !body.audience) {
    return new NextResponse('Missing required fields', { status: 400 })
  }
  if (!['locals', 'foodies', 'recent'].includes(body.audience)) {
    return new NextResponse('Invalid audience', { status: 400 })
  }

  // Auth scope check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'
  if (!isAdmin) {
    const [{ data: biz }, { data: cu }] = await Promise.all([
      supabase.from('businesses').select('client_id').eq('owner_id', user.id).eq('client_id', body.clientId).maybeSingle(),
      supabase.from('client_users').select('client_id').eq('auth_user_id', user.id).eq('client_id', body.clientId).maybeSingle(),
    ])
    if (!biz && !cu) {
      return new NextResponse('Not authorized for this client', { status: 403 })
    }
  }

  const admin = createAdminClient()

  // Snapshot the post so the campaign still renders if the source is deleted later.
  const { data: post } = await admin
    .from('scheduled_posts')
    .select('text, media_urls, platforms')
    .eq('id', body.postId)
    .eq('client_id', body.clientId)
    .maybeSingle()
  if (!post) {
    return new NextResponse('Post not found for this client', { status: 404 })
  }
  const snapshot = {
    text: ((post.text as string) ?? '').slice(0, 500),
    media_url: ((post.media_urls as string[] | null) ?? [])[0] ?? null,
    platforms: (post.platforms as string[] | null) ?? [],
  }

  const { data: inserted, error: insertErr } = await admin
    .from('ad_campaigns')
    .insert({
      client_id: body.clientId,
      source_post_id: body.postId,
      source_post_snapshot: snapshot,
      budget_total: body.budget,
      days: body.days,
      audience_preset: body.audience,
      platform: 'meta',
      status: 'pending',
      approved_by: user.id,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (insertErr) {
    return new NextResponse(`Could not save: ${insertErr.message}`, { status: 500 })
  }

  await admin.from('events').insert({
    client_id: body.clientId,
    event_type: 'boost_request.created',
    subject_type: 'ad_campaign',
    subject_id: inserted?.id ?? null,
    actor_id: user.id,
    actor_role: isAdmin ? 'admin' : 'client',
    summary: `Boost request $${body.budget} × ${body.days}d`,
    payload: {
      post_id: body.postId,
      budget: body.budget,
      days: body.days,
      audience: body.audience,
    },
  })

  return NextResponse.json({ ok: true, campaignId: inserted?.id ?? null })
}
