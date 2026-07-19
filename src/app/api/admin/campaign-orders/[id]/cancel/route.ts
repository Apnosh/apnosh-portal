/**
 * POST /api/admin/campaign-orders/[id]/cancel — a human resolves an owner's
 * cancellation REQUEST. Admin-only.
 *
 *   { action: 'approve' } → the real terminal stop: atomic shipped→stopped claim,
 *     production sweep (void un-started work, pull unpublished drafts, cancel
 *     undelivered services; in-flight work is protected and still bills), and an
 *     immediate Stripe subscription cancel. Mirrors the owner's old stop path.
 *   { action: 'decline', note? } → the campaign keeps running; cancel_state flips
 *     to 'declined' and the owner is told why.
 *
 * Either way the owner gets an honest notification.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign } from '@/lib/campaigns/server'
import { stopCampaign, getCampaignCharges } from '@/lib/campaigns/work-orders'
import { cancelCampaignSubscriptions } from '@/lib/campaigns/campaign-subscription-server'
import { summarize } from '@/lib/campaigns/types'
import { notifyClientOwners } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'" }, { status: 400 })
  }

  const campaign = await getCampaign(id)
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (campaign.cancelState !== 'requested') {
    return NextResponse.json({ error: 'No open cancellation request on this order.' }, { status: 409 })
  }

  const admin = createAdminClient()
  const name = campaign.draft.name

  if (action === 'decline') {
    await admin.from('campaigns')
      .update({ cancel_state: 'declined', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'shipped')
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''
    await notifyClientOwners(campaign.clientId, {
      kind: 'client_signoff',
      title: `We could not cancel ${name}`,
      body: `Your cancellation request could not be approved${note ? `: ${note}` : ' — the work was already too far along'}. The campaign is still running.`,
      link: `/dashboard/campaigns/${id}/order`,
    }).catch(() => ({ notified: 0 }))
    return NextResponse.json({ ok: true, outcome: 'declined' })
  }

  // approve → the terminal stop. Atomic claim so it can't double-run.
  const { data: claimed } = await admin
    .from('campaigns')
    .update({ status: 'stopped', cancel_state: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'shipped')
    .select('id')
    .maybeSingle()
  if (!claimed) return NextResponse.json({ error: 'This order changed just now. Refresh and try again.' }, { status: 409 })

  const sweep = await stopCampaign(id).catch(() => ({ voidedOrders: 0, rejectedDrafts: 0, cancelledServices: 0, inFlight: 0 }))
  const charges = await getCampaignCharges(id).catch(() => ({ accruedCents: 0, count: 0 }))
  const monthlyStopped = summarize(campaign.draft.items).perMonth
  const subs = await cancelCampaignSubscriptions(id).catch(() => ({ canceled: 0, alreadyCanceled: 0, failed: 0 }))

  const lines: string[] = ['Your cancellation was approved. Nothing new starts or posts.']
  if (sweep.inFlight > 0) lines.push('Work already being made finishes and bills as normal.')
  if (monthlyStopped > 0) lines.push(subs.failed > 0 ? `We are turning off your monthly billing ($${Math.round(monthlyStopped)}/mo) now.` : `Monthly billing ($${Math.round(monthlyStopped)}/mo) is canceled.`)
  if (charges.accruedCents > 0) lines.push(`Billed so far: $${(charges.accruedCents / 100).toFixed(2)}.`)

  await notifyClientOwners(campaign.clientId, {
    kind: 'client_signoff',
    title: `${name} is canceled`,
    body: lines.join(' '),
    link: `/dashboard/campaigns/${id}`,
  }).catch(() => ({ notified: 0 }))

  return NextResponse.json({ ok: true, outcome: 'approved', settlement: { summary: lines.join(' '), subscriptionCancelFailed: subs.failed } })
}
