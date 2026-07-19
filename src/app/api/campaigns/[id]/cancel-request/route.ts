/**
 * POST /api/campaigns/[id]/cancel-request — the owner ASKS to cancel a running
 * order. This is a request, NOT a guaranteed stop (Amazon-style): it does not
 * void work or cancel billing on its own. A human reviews it in
 * /admin/campaign-orders and either approves (the real terminal stop) or
 * declines (the campaign keeps running).
 *
 * Idempotent: asking twice while a request is open just returns the open state.
 * Only a running ('shipped') campaign can be requested — a draft isn't an order,
 * and a 'stopped' one is already ended.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign } from '@/lib/campaigns/server'
import { notifyStaffForClient } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  if (campaign.status !== 'shipped') {
    return NextResponse.json({ error: 'Only a running order can be canceled.' }, { status: 409 })
  }
  // Already asked and awaiting review — no-op, return the open state.
  if (campaign.cancelState === 'requested') {
    return NextResponse.json({ ok: true, cancelState: 'requested', alreadyRequested: true })
  }

  const body = await req.json().catch(() => ({}))
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : null

  const admin = createAdminClient()
  // Claim on status='shipped' so a request can never land on a campaign that
  // stopped or un-shipped in the same moment.
  const { data: claimed } = await admin
    .from('campaigns')
    .update({
      cancel_requested_at: new Date().toISOString(),
      cancel_reason: reason,
      cancel_state: 'requested',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'shipped')
    .select('id')
    .maybeSingle()
  if (!claimed) return NextResponse.json({ error: 'This order changed just now. Refresh and try again.' }, { status: 409 })

  // Tell the team so a human actually reviews it (best-effort — the request is
  // recorded regardless, and the admin queue reads it from the DB).
  await notifyStaffForClient(campaign.clientId, ['strategist', 'community_mgr'], {
    kind: 'client_request',
    title: 'Owner asked to cancel an order',
    body: `${campaign.draft.name}${reason ? ` — "${reason}"` : ''}. Review it in campaign orders: approve to stop it, or decline to keep it running.`,
    link: `/admin/campaign-orders/${id}`,
  }).catch(() => {})

  return NextResponse.json({ ok: true, cancelState: 'requested' })
}
