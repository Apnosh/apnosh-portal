/**
 * POST /api/social/boost
 *
 * v1 stub: lands a boost request in client_tasks for the strategist
 * to confirm and launch in Meta Ads Manager. Direct integration with
 * Meta Ads goes here when we wire it.
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

const AUDIENCE_LABEL: Record<string, string> = {
  locals:  'Locals (within 5 miles)',
  foodies: 'Food enthusiasts (locals who follow food / dining)',
  recent:  'Recent visitors (90-day engaged)',
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

  if (!body.clientId || !body.postId || !body.budget || !body.days) {
    return new NextResponse('Missing required fields', { status: 400 })
  }

  // Confirm scope.
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

  const audienceLabel = AUDIENCE_LABEL[body.audience] ?? body.audience
  const dailySpend = (body.budget / body.days).toFixed(2)
  const title = `Boost request: $${body.budget} × ${body.days} days`
  const bodyText = [
    `**Boost request**`,
    '',
    `**Post:** ${body.postId}`,
    `**Total budget:** $${body.budget}`,
    `**Duration:** ${body.days} days`,
    `**Daily spend:** ~$${dailySpend}/day`,
    `**Audience:** ${audienceLabel}`,
    '',
    'Owner approved budget. Strategist to confirm targeting and launch in Meta Ads Manager.',
  ].join('\n')

  const admin = createAdminClient()
  const { data: inserted, error: insertErr } = await admin
    .from('client_tasks')
    .insert({
      client_id: body.clientId,
      title,
      body: bodyText,
      status: 'todo',
      due_at: new Date(Date.now() + 1 * 86_400_000).toISOString(),
      assignee_type: 'admin',
      visible_to_client: true,
    })
    .select('id')
    .single()

  if (insertErr) {
    return new NextResponse(`Could not save: ${insertErr.message}`, { status: 500 })
  }

  await admin.from('events').insert({
    client_id: body.clientId,
    event_type: 'boost_request.created',
    subject_type: 'client_task',
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

  return NextResponse.json({ ok: true, taskId: inserted?.id ?? null })
}
