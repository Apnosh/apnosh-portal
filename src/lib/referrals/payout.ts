import 'server-only'
/**
 * referrals/payout — the one place a referrer is ever paid.
 *
 * IT RUNS ON THE COUNT, NOT ON THE MONEY. The referred owner's order being charged is not enough:
 * a card clears at 9pm and is refunded at 9am, and a credit issued in between is real money we
 * gave away for an order that never happened. So the referrer's $50 waits until that order's
 * promise reaches 'counted' — the same state the campaign card, Home and the "your count is in"
 * cron read (src/lib/promises/lines.ts). One window later, with a number the owner can see.
 *
 * IDEMPOTENT ON referrals.credited_at. The row is CLAIMED by stamping it (`where credited_at is
 * null`) before any credit is written, so two overlapping cron runs cannot pay the same referral
 * twice — the same claim-first pattern the count-is-in cron uses for its notice.
 *
 * Called from the daily count-is-in cron, behind REFERRALS_ENABLED. With the switch off it reads
 * nothing and writes nothing.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { referralsEnabled } from '@/lib/referral-gate'
import { SETTLED_STATUSES } from '@/lib/campaigns/refund-math'
import { getPromiseRows } from '@/lib/promises/read'
import { notifyClientOwners } from '@/lib/notifications'
import { getClientLanguage } from '@/lib/i18n/language'
import { t } from '@/lib/i18n/t'
import { newnessFor, retirePriorCheckout } from './server'
import { REFERRAL_CREDIT_CENTS, REFUND_VOID_REASON, creditWords, nextStatus, readyToCredit, referralBlock, type ReferralStatus } from './model'

const warn = (where: string, e: unknown) =>
  console.warn(`[referrals] ${where} (apply migration 261?):`, e instanceof Error ? e.message : e)

export interface PayoutReport {
  ran: boolean
  advanced: number
  credited: number
  voided: number
  note?: string
}

interface Row {
  id: string
  referrer_client_id: string
  referred_client_id: string
  status: ReferralStatus
  credit_cents_referrer: number | null
  referred_payment_id: string | null
  created_at: string
}

interface Order { id: string; status: string; campaign_id: string | null; created_at: string; paid_at: string | null; client_credit_id?: string | null; stripe_payment_intent_id?: string | null }

/**
 * The referred client's first order PAID AFTER THE REFERRAL WAS MADE, or null while there is none.
 *
 * The "after" is the whole point. Without it, an owner who has been ours for a year could have a
 * code typed onto their account and the loop would reach back to an order they paid for in
 * January and pay somebody $50 for it. An order counts for a referral only if the money moved
 * after the introduction did.
 *
 * paid_at, not created_at: created_at is when the checkout was STARTED, and an intent opened
 * before the code was typed and paid a week later is still an order that came after.
 */
async function firstPaidOrder(clientId: string, afterIso: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('campaign_payments')
    .select('id, status, campaign_id, created_at, paid_at, client_credit_id, stripe_payment_intent_id')
    .eq('client_id', clientId)
    // SETTLED, not COLLECTED. A disputed charge is money the bank is holding while it decides,
    // and paying a referrer $50 off it is giving away real money on a charge that may be about to
    // go back. The dispute is settled or it is not; either way the count is not in yet.
    .in('status', SETTLED_STATUSES)
    .gt('paid_at', afterIso)
    .order('paid_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as Order | null) ?? null
}

/** Was this order's money taken AFTER the referral? Fails closed on an order with no paid_at. */
function paidAfter(order: Order | null, afterIso: string): boolean {
  if (!order?.paid_at) return false
  const paid = Date.parse(order.paid_at), made = Date.parse(afterIso)
  return Number.isFinite(paid) && Number.isFinite(made) && paid > made
}

/**
 * Where the money behind this referral stands.
 *
 *   'here'  — settled, ours, and a payout may be built on it
 *   'held'  — DISPUTED. The bank is holding it while it decides. Not a refund, so the referral is
 *             not voided; not money either, so nothing is paid out of it. It waits for tomorrow's
 *             run, which is exactly what a dispute is: not decided yet.
 *   'gone'  — sent back in full. Nothing is owed to anybody, and the referral is voided.
 *
 * An unreadable row answers 'held': it stops the payout and voids nothing, which is the reversible
 * mistake.
 */
type MoneyState = 'here' | 'held' | 'gone'

async function moneyState(paymentId: string): Promise<MoneyState> {
  try {
    const { data, error } = await createAdminClient().from('campaign_payments').select('status').eq('id', paymentId).maybeSingle()
    if (error || !data) return 'held'
    if (data.status === 'refunded') return 'gone'
    if (data.status === 'disputed') return 'held'
    return 'here'
  } catch { return 'held' }
}

/**
 * Has the referred client's order produced a counted number?
 *
 * Tied to the ORDER when we know which campaign it paid for, so a referral cannot be paid off
 * some unrelated older campaign of theirs. When the payment row has no campaign (a desk order, a
 * recovery row), any counted promise on that account is the honest answer.
 */
async function orderCounted(clientId: string, campaignId: string | null): Promise<boolean> {
  try {
    const rows = await getPromiseRows(clientId, 0)
    const counted = rows.filter((r) => r.state === 'counted')
    if (!counted.length) return false
    return campaignId ? counted.some((r) => r.campaignId === campaignId) : true
  } catch (e) { warn('could not read the promises', e); return false }
}

/** Both accounts' facts, for the fraud floors run again at payout time. */
async function facts(clientId: string) {
  const admin = createAdminClient()
  const { data: c } = await admin.from('clients').select('email, phone').eq('id', clientId).maybeSingle()
  const { data: p } = await admin.from('campaign_payments').select('stripe_customer_id').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return {
    email: (c?.email as string) || null,
    phone: (c?.phone as string) || null,
    stripeCustomerId: (p?.stripe_customer_id as string) || null,
  }
}

/**
 * Hand a credit back after the order that used it was refunded. The hold is cleared and the row's
 * cached consumed_cents is reset; what the credit is really worth is worked out from the payments
 * ledger every time it is claimed (claimFriendCredit), and a refunded payment is not in it.
 *
 * IT ONLY CLEARS THE HOLD IT CAME FOR. This used to clear whatever hold was on the row, whoever it
 * belonged to — so a refund on January's order could drop the hold a checkout the owner has open
 * RIGHT NOW is sitting on, and the same $50 would come off two bills. Now the write names the
 * intent it is undoing. When some OTHER checkout holds the row, that checkout is shut at Stripe
 * first, and if it cannot be shut the hold is left alone: it expires on its own in a day, and
 * claimFriendCredit asks Stripe the same question before anybody takes it.
 */
async function reopenCredit(creditId: string, refundedIntentId: string | null): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('client_credits')
      .select('held_cents, consumed_intent_id').eq('id', creditId).is('voided_at', null).maybeSingle()
    if (error || !data) { warn('could not read the credit to give back', error); return }
    const holder = (data.consumed_intent_id as string | null) ?? null
    if (holder && holder !== refundedIntentId) {
      // Somebody else's checkout is on this row. Shut it or leave it alone.
      if (!await retirePriorCheckout(holder)) return
    }
    let q = admin.from('client_credits')
      .update({ consumed_cents: 0, held_cents: 0, consumed_at: null, consumed_intent_id: null })
      .eq('id', creditId)
      .is('voided_at', null)
      .eq('held_cents', (data.held_cents as number) || 0)
    q = holder ? q.eq('consumed_intent_id', holder) : q.is('consumed_intent_id', null)
    await q
  } catch (e) { warn('could not give the credit back', e) }
}

async function voidReferral(id: string, reason: string): Promise<boolean> {
  try {
    const { data } = await createAdminClient().from('referrals')
      .update({ status: 'void', voided_at: new Date().toISOString(), void_reason: reason })
      .eq('id', id)
      .is('credited_at', null)          // a paid referral is never rewritten by this cron
      .select('id')
    return !!(data && data.length)
  } catch (e) { warn('could not void a referral', e); return false }
}

/**
 * Walk every open referral once. Advance the ones whose friend has paid, void the ones whose
 * order went back, and pay the ones whose number is in.
 *
 * `dryRun` computes the same answers and writes nothing.
 */
export async function runReferralPayouts(opts: { dryRun?: boolean; limit?: number } = {}): Promise<PayoutReport> {
  if (!referralsEnabled()) return { ran: false, advanced: 0, credited: 0, voided: 0, note: 'referrals are shut' }
  const admin = createAdminClient()
  let rows: Row[] = []
  try {
    const { data, error } = await admin
      .from('referrals')
      .select('id, referrer_client_id, referred_client_id, status, credit_cents_referrer, referred_payment_id, created_at')
      .in('status', ['signed_up', 'first_order_paid'])
      .is('credited_at', null)
      .is('voided_at', null)
      .limit(opts.limit ?? 200)
    if (error) { warn('could not read the referrals', error); return { ran: false, advanced: 0, credited: 0, voided: 0, note: 'no table' } }
    rows = (data ?? []) as Row[]
  } catch (e) { warn('could not read the referrals', e); return { ran: false, advanced: 0, credited: 0, voided: 0, note: 'no table' } }

  let advanced = 0, credited = 0, voided = 0
  for (const r of rows) {
    try {
      const order = r.referred_payment_id
        ? await (async () => {
            const { data } = await admin.from('campaign_payments').select('id, status, campaign_id, created_at, paid_at, client_credit_id, stripe_payment_intent_id').eq('id', r.referred_payment_id as string).maybeSingle()
            return (data as Order | null) ?? null
          })()
        : await firstPaidOrder(r.referred_client_id, r.created_at)
      if (!order) continue                        // the friend has not ordered yet: nothing to do
      // Belt and braces on the stored order too: a referred_payment_id written by an older run
      // (or by hand) must still be an order paid after the introduction.
      if (!paidAfter(order, r.created_at)) continue

      let status: ReferralStatus = r.status
      if (status === 'signed_up') {
        const next = nextStatus(status, 'order_paid')
        if (next) {
          advanced += 1
          status = next
          if (!opts.dryRun) {
            await admin.from('referrals')
              .update({ status: next, referred_payment_id: order.id, first_order_paid_at: new Date().toISOString() })
              .eq('id', r.id).is('credited_at', null).is('voided_at', null)
          }
        }
      }

      // The money check comes BEFORE the count check, always: money that went back — or that the
      // bank is holding — cannot make a payout, however good the number looks.
      const money = await moneyState(order.id)
      if (money === 'held') continue           // disputed: decide nothing today, void nothing
      if (money === 'gone') {
        // THE FRIEND'S $50 GOES BACK TOO. Their order was sent back in full, so the credit it was
        // spent on was never really spent: the refunded payment drops out of the ledger sum the
        // checkout claims against, and clearing the stale hold here means the row on their account
        // reads the same way the arithmetic already does.
        if (!opts.dryRun && order.client_credit_id) await reopenCredit(order.client_credit_id, order.stripe_payment_intent_id ?? null)
        if (!opts.dryRun && await voidReferral(r.id, REFUND_VOID_REASON)) voided += 1
        else if (opts.dryRun) voided += 1
        continue
      }

      const counted = await orderCounted(r.referred_client_id, order.campaign_id)
      if (!readyToCredit({ status }, counted)) continue

      // The floors again, now that both accounts have a card on file. Same card account is the
      // strongest signal there is that this is one person, and it only exists after they pay.
      //
      // The NEWNESS floor is re-run here too, as of the day the referral was made: an account that
      // had already paid us before the code was typed is our customer, not an introduction, and
      // this is the last gate before real money leaves.
      const [a, b, newness] = await Promise.all([
        facts(r.referrer_client_id), facts(r.referred_client_id), newnessFor(r.referred_client_id, r.created_at),
      ])
      if (!newness) continue                     // unreadable: pay nothing, look again tomorrow
      const blocked = referralBlock({
        referrerClientId: r.referrer_client_id, referredClientId: r.referred_client_id,
        referrerEmail: a.email, referredEmail: b.email,
        referrerPhone: a.phone, referredPhone: b.phone,
        referrerStripeCustomerId: a.stripeCustomerId, referredStripeCustomerId: b.stripeCustomerId,
        referredHasPaidBefore: newness.hasPaidBefore,
        referredAccountAgeDays: newness.accountAgeDays,
      })
      if (blocked) {
        if (!opts.dryRun && await voidReferral(r.id, blocked)) voided += 1
        else if (opts.dryRun) voided += 1
        continue
      }

      if (opts.dryRun) { credited += 1; continue }

      // CLAIM FIRST. The stamp is the lock: exactly one run gets the row back, and only that run
      // writes the money.
      const { data: claimed, error: claimErr } = await admin.from('referrals')
        .update({ status: 'credited', credited_at: new Date().toISOString() })
        .eq('id', r.id)
        .is('credited_at', null)
        .is('voided_at', null)
        .select('id')
      if (claimErr) { warn('could not claim the referral', claimErr); continue }
      if (!claimed || !claimed.length) continue        // another run has it

      const cents = r.credit_cents_referrer && r.credit_cents_referrer > 0 ? r.credit_cents_referrer : REFERRAL_CREDIT_CENTS
      const { error: credErr } = await admin.from('client_credits').insert({
        client_id: r.referrer_client_id,
        cents,
        reason: 'friend_credited',
        referral_id: r.id,
      })
      if (credErr) {
        // The stamp is down and the money is not. Say so loudly — this is the one failure here
        // that owes somebody something. The unique index on (referral_id, reason) means a manual
        // re-insert is safe.
        console.error('[referrals] CREDITED but the credit row failed to write for referral', r.id, credErr.message)
        continue
      }
      credited += 1

      // In the owner's own language. This is the one message this loop ever sends them, and it is
      // about their money — an owner who set the portal to Spanish should not get it in English.
      const lang = await getClientLanguage(r.referrer_client_id)
      const amount = creditWords(cents)
      await notifyClientOwners(r.referrer_client_id, {
        kind: 'payment',
        title: t('Your {amount} friend credit is here', lang, { amount }),
        body: t("Your friend's first order got its number, so your {amount} is on your account. It comes off your next order.", lang, { amount }),
        link: '/dashboard/tell-a-friend',
        email: true,
        emailCategory: 'billing',
      }).catch(() => ({ notified: 0 }))
    } catch (e) {
      warn('could not settle a referral', e)
    }
  }
  return { ran: true, advanced, credited, voided }
}
