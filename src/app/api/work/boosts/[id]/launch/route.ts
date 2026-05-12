/**
 * POST /api/work/boosts/[id]/launch
 *
 * Buyer marks a pending campaign as launching or active in Meta Ads.
 * Optionally stores the platform_campaign_id for later metric sync.
 *
 * Body: { platformCampaignId?: string | null, markActive?: boolean }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

interface Body {
  platformCampaignId?: string | null
  markActive?: boolean
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['paid_media', 'ad_buyer']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null

  // Verify the campaign exists and the buyer can see it (RLS via select).
  const { data: existing } = await supabase
    .from('ad_campaigns')
    .select('id, client_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `cannot launch from status ${existing.status}` }, { status: 409 })
  }

  const newStatus = body?.markActive ? 'active' : 'launching'
  const launchedAt = body?.markActive ? new Date().toISOString() : null

  const admin = createAdminClient()
  const { error: updateErr } = await admin
    .from('ad_campaigns')
    .update({
      status: newStatus,
      platform_campaign_id: body?.platformCampaignId ?? null,
      launched_at: launchedAt,
    })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: existing.client_id,
    event_type: body?.markActive ? 'boost.activated' : 'boost.launching',
    subject_type: 'ad_campaign',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: body?.markActive ? 'Boost active' : 'Boost in launching state',
    payload: { platform_campaign_id: body?.platformCampaignId ?? null },
  })

  return NextResponse.json({
    ok: true,
    status: newStatus,
    platformCampaignId: body?.platformCampaignId ?? null,
    launchedAt,
  })
}
