/**
 * POST /api/campaigns/[id]/stop — the owner ends a running campaign, terminally.
 *
 * A dedicated route: the campaign PATCH deliberately rejects every status except
 * 'shipped' (un-shipping would dodge the one-shot mint), so stop gets its own
 * verb with its own guarantees:
 *   - atomic claim (status shipped→stopped, guarded) — two stops can't both win,
 *     and a stopped campaign can never re-ship (the ship claim requires 'draft').
 *   - production sweep (stopCampaign): voids never-started creator work, pulls
 *     every unpublished team draft out of the publish path, cancels undelivered
 *     services. In-flight creator work is PROTECTED — it finishes and bills.
 *   - an honest settlement back to the owner: what stopped, what continues,
 *     what has been billed so far. Money is never touched: charges exist only
 *     for approved/published work, which the sweep never voids.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign } from '@/lib/campaigns/server'
import { stopCampaign, getCampaignCharges } from '@/lib/campaigns/work-orders'
import { summarize } from '@/lib/campaigns/types'
import { notifyStaffForClient, notifyClientOwners } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  if (campaign.status !== 'shipped') {
    return NextResponse.json({ error: 'Only a running campaign can be stopped.' }, { status: 409 })
  }

  // Atomic claim: exactly one stop wins; a racing stop (or a just-landed edit)
  // loses loudly instead of double-sweeping.
  const admin = createAdminClient()
  const { data: claimed } = await admin
    .from('campaigns')
    .update({ status: 'stopped', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'shipped')
    .select('id')
    .maybeSingle()
  if (!claimed) return NextResponse.json({ error: 'This campaign changed just now. Refresh and try again.' }, { status: 409 })

  const sweep = await stopCampaign(id).catch(() => ({ voidedOrders: 0, rejectedDrafts: 0, cancelledServices: 0, inFlight: 0 }))
  const charges = await getCampaignCharges(id).catch(() => ({ accruedCents: 0, count: 0 }))
  const monthlyStopped = summarize(campaign.draft.items).perMonth

  const name = campaign.draft.name || 'Your campaign'
  const stoppedCount = sweep.voidedOrders + sweep.rejectedDrafts + sweep.cancelledServices
  const settlementLines = [
    stoppedCount > 0 ? `${stoppedCount} unstarted piece${stoppedCount === 1 ? '' : 's'} of work stopped.` : 'Nothing was left to stop.',
    sweep.inFlight > 0 ? `${sweep.inFlight} piece${sweep.inFlight === 1 ? ' is' : 's are'} already being made — they finish and bill as normal.` : null,
    charges.accruedCents > 0 ? `Billed so far: $${Math.round(charges.accruedCents / 100)}. That stands — the work was done.` : 'Nothing has been billed.',
    monthlyStopped > 0 ? `Monthly items ($${Math.round(monthlyStopped)}/mo) stop now.` : null,
  ].filter((l): l is string => !!l)

  // Staff must know immediately — especially when in-flight work continues.
  await notifyStaffForClient(campaign.clientId, ['strategist', 'community_mgr'], {
    kind: 'client_signoff',
    title: `Campaign stopped by the owner: ${name}`,
    body: sweep.inFlight > 0
      ? `${sweep.inFlight} in-flight piece(s) continue and bill; everything unstarted was voided.`
      : 'Everything unstarted was voided.',
    link: `/work/today?focus=${id}`,
  }).catch(() => ({ notified: 0 }))

  await notifyClientOwners(campaign.clientId, {
    kind: 'client_signoff',
    title: `${name} is stopped`,
    body: settlementLines.join(' '),
    link: `/dashboard/campaigns/${id}`,
  }).catch(() => ({ notified: 0 }))

  return NextResponse.json({
    ok: true,
    settlement: {
      stopped: stoppedCount,
      voidedOrders: sweep.voidedOrders,
      rejectedDrafts: sweep.rejectedDrafts,
      cancelledServices: sweep.cancelledServices,
      inFlight: sweep.inFlight,
      billedCents: charges.accruedCents,
      monthlyStopped,
      summary: settlementLines.join(' '),
    },
  })
}
