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
 *   - subscription cancel: the campaign's Stripe monthly subscription(s) are canceled
 *     IMMEDIATELY (cancelCampaignSubscriptions) — the settlement says monthly billing
 *     ends now, so it does. Idempotent + degrade-safe; a failure pages staff.
 *   - THE MONEY BACK: a campaign paid upfront is prorated against what actually landed
 *     (creator pieces, team posts and services) and the rest is refunded to the card.
 *     Charges for delivered work stand — that work was really done.
 *   - an honest settlement back to the owner: what stopped, what continues, what we are
 *     sending back, and what still bills.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign } from '@/lib/campaigns/server'
import { stopCampaign, getCampaignCharges } from '@/lib/campaigns/work-orders'
import { cancelCampaignSubscriptions } from '@/lib/campaigns/campaign-subscription-server'
import { owedRefundCents, refundCampaignPayment, pageAdmins, REFUND_UNCONFIRMED } from '@/lib/campaigns/refunds-server'
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

  // The money half of the stop: cancel the campaign's Stripe subscription(s) IMMEDIATELY (the
  // settlement says billing ends now, so it must). Idempotent + degrade-safe by contract
  // (cancelCampaignSubscriptions): no subscription / no Stripe keys / already canceled never
  // errors the stop; a real cancel failure pages staff and the settlement says so honestly.
  const subs = await cancelCampaignSubscriptions(id).catch(() => ({ canceled: 0, alreadyCanceled: 0, failed: 0 }))

  // THE MONEY BACK. A campaign paid upfront that stops with work undelivered is owed a refund. The
  // old settlement said "Nothing is owed" here — while we were holding their money for work that
  // was just voided one line above. Now the ledger is asked what actually landed (creator pieces,
  // team posts AND services, since services finally write a money row), and the rest goes back.
  // Runs AFTER the sweep on purpose: the sweep is what makes cancelled work stale, so the delivered
  // total is measured against the campaign's final state.
  const money = await owedRefundCents(id).catch(() => ({ ok: false, owedCents: 0, deliveredCents: 0, paid: null, reason: 'the ledger could not be read' }))
  // FAIL CLOSED. An unreadable ledger looks exactly like "nothing was delivered", which is the
  // biggest refund we can send. So we send nothing, say so plainly, and put it in front of a person.
  const refundBlocked = !!money.paid && !money.ok
  let refundedCents = 0
  let owedCents = 0
  let refundOk = true
  if (money.paid && money.ok && money.owedCents > 0) {
    owedCents = money.owedCents
    const r = await refundCampaignPayment({
      campaignId: id,
      amountCents: money.owedCents,
      reason: 'You stopped this campaign, so we sent back what you paid for work we had not delivered.',
      notifyOwner: false,          // the settlement below says it once, with the number
    }).catch(() => null)
    refundedCents = r?.refundedCents ?? 0
    refundOk = r?.ok === true
  }
  // "Failed" means we owed money and could not send it. A refund that returns ok with 0 cents is
  // the already-refunded case: nothing moved because nothing was left, which is not a failure.
  const refundFailed = owedCents > 0 && !refundOk

  const name = campaign.draft.name || 'Your campaign'
  const stoppedCount = sweep.voidedOrders + sweep.rejectedDrafts + sweep.cancelledServices
  const monthlyLine = monthlyStopped <= 0 ? null
    : subs.failed > 0
      ? `We are turning off your monthly billing ($${Math.round(monthlyStopped)}/mo) now. Our team is finishing it by hand.`
      : 'Monthly billing is canceled. Nothing else charges this card for this campaign.'
  // The money line, in the owner's words. A prepaid campaign talks about the refund; a
  // pay-on-delivery campaign talks about the invoice. "Nothing is owed" is now only ever said when
  // nothing was prepaid AND nothing was delivered — the one case where it is true.
  const moneyLine = money.paid
    ? refundBlocked
      ? REFUND_UNCONFIRMED
      : refundedCents > 0
        ? `We refund $${(refundedCents / 100).toFixed(2)} for work not delivered. It lands on your card in 5 to 10 days.`
        : refundFailed
          ? `We owe you $${(owedCents / 100).toFixed(2)} back for work we did not deliver. Our team is sending it by hand today.`
          : money.paid.totalCents > 0
            ? 'Everything you ordered was delivered, so there is nothing to send back.'
            // A monthly-only order is keyed to a SetupIntent: the card was SAVED, never charged, so
            // total_cents is 0. Saying "everything you ordered was delivered" there was a claim
            // about work we may not have done, made only because there was no money to send back.
            : 'Your monthly service is cancelled. Nothing was charged up front, so nothing is sent back.'
    : charges.accruedCents > 0
      ? `Owed for delivered work so far: $${Math.round(charges.accruedCents / 100)}. That stands — the work was done; it arrives on one invoice.`
      : 'Nothing is owed.'

  const settlementLines = [
    stoppedCount > 0 ? `${stoppedCount} unstarted piece${stoppedCount === 1 ? '' : 's'} of work stopped.` : 'Nothing was left to stop.',
    // What really happens to in-flight work: stopCampaign voids only creator orders still 'offered'
    // or 'accepted' (work-orders.ts:1042), so anything already in_progress / revision / delivered /
    // approved keeps going. What it does NOT do is keep billing: the refund above already sent back
    // the money for every piece that had not landed, these among them, and once they land the
    // checkout still covers them. So "bill as normal" was only ever true when nothing was prepaid.
    sweep.inFlight > 0
      ? refundedCents > 0
        ? `${sweep.inFlight} piece${sweep.inFlight === 1 ? ' is' : 's are'} already being made. They finish, and there is nothing more to pay for them.`
        : `${sweep.inFlight} piece${sweep.inFlight === 1 ? ' is' : 's are'} already being made — they finish and bill as normal.`
      : null,
    moneyLine,
    monthlyLine,
  ].filter((l): l is string => !!l)

  // Staff must know immediately — especially when in-flight work continues.
  await notifyStaffForClient(campaign.clientId, ['strategist', 'community_mgr'], {
    kind: 'client_signoff',
    title: `Campaign stopped by the owner: ${name}`,
    body: sweep.inFlight > 0
      ? `${sweep.inFlight} in-flight piece(s) continue${refundedCents > 0 ? ' and are already refunded, so they are on us' : ' and bill'}; everything unstarted was voided.`
      : 'Everything unstarted was voided.',
    link: `/work/today?focus=${id}`,
  }).catch(() => ({ notified: 0 }))

  // We could not even work out what was owed. A person settles it, and the owner was told so.
  if (refundBlocked) {
    await pageAdmins(campaign.clientId, 'A stop could not settle its refund', `"${name}" was stopped but we could not read what had been delivered (${money.reason ?? 'unknown'}), so nothing was sent back. Work out the refund and send it by hand today.`, `/admin/campaign-orders?focus=${id}`)
  }

  // A refund we promised and did not send is the worst outcome here, so it is never silent.
  if (refundFailed) {
    await notifyStaffForClient(campaign.clientId, ['strategist'], {
      kind: 'payment',
      title: 'Refund owed on a stopped campaign',
      body: `"${name}" stopped owing the owner $${(owedCents / 100).toFixed(2)} back and the automatic refund did not go through. Refund it in Stripe today.`,
      link: `/admin/campaign-orders?focus=${id}`,
    }).catch(() => ({ notified: 0 }))
  }

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
      deliveredCents: money.deliveredCents,
      refundedCents,
      refundOwedCents: owedCents,
      refundFailed,
      refundBlocked,
      monthlyStopped,
      subscriptionsCanceled: subs.canceled + subs.alreadyCanceled,
      subscriptionCancelFailed: subs.failed,
      summary: settlementLines.join(' '),
    },
  })
}
