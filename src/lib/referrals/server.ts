import 'server-only'
/**
 * referrals/server — the database half of tell a friend.
 *
 * Every function here is BEST-EFFORT and SHUT BY DEFAULT:
 *
 *   · shut — referralsEnabled() is checked in every one of them, not only in the routes above
 *     them, so no code path can reach a referral write by forgetting a guard. With the switch off
 *     they all answer the empty answer and write nothing at all.
 *   · best-effort — before migration 261 runs, these tables do not exist. Every read and write is
 *     wrapped and a missing table is a console.warn, never a thrown error, following
 *     src/lib/promises/record.ts. The product keeps working; the loop just is not there.
 *
 * The pure rules (the charset, the state machine, the fraud floors, the amount) are in ./model,
 * so scripts/sim/referral.ts can prove them with nothing running.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { referralsEnabled } from '@/lib/referral-gate'
import { COLLECTED_STATUSES } from '@/lib/campaigns/refund-math'
import { getPromiseRows } from '@/lib/promises/read'
import {
  REFERRAL_CREDIT_CENTS, CODE_LENGTH, makeCode, normalizeCode, isCodeShape,
  referralBlock, creditAvailableCents, creditWords, isRealIntentId, priorIntentVerdict,
  overApplyVerdict, overAppliedCents, type HoldState, type ReferralStatus,
} from './model'

const warn = (where: string, e: unknown) =>
  console.warn(`[referrals] ${where} (apply migration 261?):`, e instanceof Error ? e.message : e)

/** Crypto randomness where it exists, Math.random where it does not. The charset does the work. */
function rand(): number {
  try {
    const buf = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buf)
    return buf[0] / 2 ** 32
  } catch {
    return Math.random()
  }
}

/* ── the code ───────────────────────────────────────────────────────────── */

/**
 * This client's code, made once and then kept forever. NULL when the loop is shut or the table is
 * not there — the caller shows nothing rather than a code that cannot be honoured.
 *
 * A collision on the unique index is retried a few times rather than reported: ten billion codes
 * means a collision is a coincidence, not a condition.
 */
export async function ensureReferralCode(clientId: string): Promise<string | null> {
  if (!referralsEnabled() || !clientId) return null
  const admin = createAdminClient()
  try {
    const { data, error } = await admin.from('referral_codes').select('code').eq('client_id', clientId).maybeSingle()
    if (error) { warn('could not read the code', error); return null }
    if (data?.code) return data.code as string
    for (let i = 0; i < 5; i += 1) {
      const code = makeCode(rand, CODE_LENGTH)
      const { error: insErr } = await admin.from('referral_codes').insert({ client_id: clientId, code })
      if (!insErr) return code
      // Another request made this client's code a moment ago — read it back rather than fight.
      const { data: again } = await admin.from('referral_codes').select('code').eq('client_id', clientId).maybeSingle()
      if (again?.code) return again.code as string
    }
    return null
  } catch (e) { warn('could not make a code', e); return null }
}

/**
 * This client's code, READ ONLY. Null when they have none yet.
 *
 * The public /owners/<slug> page reads this rather than ensureReferralCode: a GET anybody on the
 * internet can make must not write a row. The code is made when the owner turns their page on
 * (POST /api/referrals/featured), which is a thing they did on purpose.
 */
export async function referralCodeFor(clientId: string): Promise<string | null> {
  if (!referralsEnabled() || !clientId) return null
  try {
    const { data, error } = await createAdminClient().from('referral_codes').select('code').eq('client_id', clientId).maybeSingle()
    if (error) { warn('could not read the code', error); return null }
    return (data?.code as string) || null
  } catch (e) { warn('could not read the code', e); return null }
}

/** Whose code is this? NULL for a code nobody holds — which is what a mistyped code is. */
export async function clientForCode(rawCode: string): Promise<{ clientId: string; name: string } | null> {
  if (!referralsEnabled()) return null
  const code = normalizeCode(rawCode)
  if (!isCodeShape(code)) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('referral_codes').select('client_id').eq('code', code).maybeSingle()
    if (error || !data?.client_id) return null
    const { data: c } = await admin.from('clients').select('name').eq('id', data.client_id as string).maybeSingle()
    return { clientId: data.client_id as string, name: (c?.name as string) || '' }
  } catch (e) { warn('could not look up a code', e); return null }
}

/* ── the gate: only an owner we have kept a promise to ──────────────────── */

/**
 * Has this client ever had a promise reach a counted number?
 *
 * THE PLAN'S LAW, in one function. We do not ask an owner to recommend us before we have kept a
 * promise to them, so the Home card and the page both hang on this. It reads the same
 * getPromiseRows the card, Home and the "your count is in" cron read — there is no second idea of
 * what counted means.
 */
export async function hasCountedPromise(clientId: string): Promise<boolean> {
  if (!clientId) return false
  try {
    const rows = await getPromiseRows(clientId, 0)
    return rows.some((r) => r.state === 'counted')
  } catch (e) { warn('could not read the promises', e); return false }
}

/* ── what the owner's page shows ─────────────────────────────────────────── */

export interface FriendRow {
  id: string
  name: string
  status: ReferralStatus
  createdAt: string
  /** why it closed, when it did. The page turns a refund into its own honest word. */
  voidReason?: string | null
}

export interface ReferralState {
  enabled: boolean
  /** they have a counted promise, so the entry may be shown at all */
  eligible: boolean
  code: string | null
  friends: FriendRow[]
  /** credit sitting on the account, in cents, unspent and unvoided */
  creditCents: number
  featured: boolean
  slug: string | null
}

const SHUT: ReferralState = { enabled: false, eligible: false, code: null, friends: [], creditCents: 0, featured: false, slug: null }

/** Everything /dashboard/tell-a-friend and the Home card need, in one read. */
export async function referralStateFor(clientId: string): Promise<ReferralState> {
  if (!referralsEnabled() || !clientId) return SHUT
  const eligible = await hasCountedPromise(clientId)
  if (!eligible) return { ...SHUT, enabled: true }
  const admin = createAdminClient()
  const code = await ensureReferralCode(clientId)
  let friends: FriendRow[] = []
  let creditCents = 0
  let featured = false
  let slug: string | null = null
  try {
    const { data } = await admin
      .from('referrals')
      .select('id, referred_client_id, status, created_at, void_reason')
      .eq('referrer_client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100)
    const rows = (data ?? []) as { id: string; referred_client_id: string; status: string; created_at: string; void_reason: string | null }[]
    const names = new Map<string, string>()
    if (rows.length) {
      const { data: cs } = await admin.from('clients').select('id, name').in('id', rows.map((r) => r.referred_client_id))
      for (const c of (cs ?? []) as { id: string; name: string }[]) names.set(c.id, c.name)
    }
    friends = rows.map((r) => ({
      id: r.id,
      // First name only. The friend's business name is theirs to share, not ours to publish on
      // somebody else's screen beyond what the owner already knows they sent.
      name: (names.get(r.referred_client_id) || '').split(' ')[0] || '',
      status: r.status as ReferralStatus,
      createdAt: r.created_at,
      voidReason: r.void_reason,
    }))
  } catch (e) { warn('could not read the friends', e) }
  try {
    const { data } = await admin
      .from('client_credits')
      .select('id, cents, voided_at')
      .eq('client_id', clientId)
      .is('voided_at', null)
    // WHAT THEY STILL HAVE, not what a row remembers. consumed_cents is stamped when a checkout
    // HOLDS a credit, so an owner who opened checkout and closed the tab was shown $0 on a $50
    // they still had. Only money a collected order really took counts as gone — the same ledger
    // sum the checkout claims against, so the page and the till cannot disagree.
    for (const c of (data ?? []) as { id: string; cents: number }[]) {
      const settled = await settledCentsFor(c.id)
      if (settled == null) continue
      creditCents += Math.max(0, (c.cents || 0) - settled)
    }
  } catch (e) { warn('could not read the credits', e) }
  try {
    const { data } = await admin.from('clients').select('featured_opt_in, slug').eq('id', clientId).maybeSingle()
    featured = !!data?.featured_opt_in
    slug = (data?.slug as string) || null
  } catch (e) { warn('could not read the opt-in', e) }
  return { enabled: true, eligible: true, code, friends, creditCents, featured, slug }
}

/* ── a friend arrives ────────────────────────────────────────────────────── */

/** Fields a fraud floor needs about one account, read once. */
async function accountFacts(clientId: string) {
  const admin = createAdminClient()
  const { data: c } = await admin.from('clients').select('email, phone, name').eq('id', clientId).maybeSingle()
  let stripeCustomerId: string | null = null
  try {
    const { data: p } = await admin
      .from('campaign_payments')
      .select('stripe_customer_id')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    stripeCustomerId = (p?.stripe_customer_id as string) || null
  } catch { /* no payments yet is the normal case for a brand new friend */ }
  return {
    email: (c?.email as string) || null,
    phone: (c?.phone as string) || null,
    name: (c?.name as string) || '',
    stripeCustomerId,
  }
}

/**
 * IS THIS CLIENT NEW? The two facts the "already a customer" floor needs, both read as of a moment
 * in time — the day the code was typed at claim, the referral's own created_at at payout — so the
 * question is asked the same way twice and cannot answer differently the second time.
 *
 * Money that has already come to us counts wherever it came from: a campaign order (the payments
 * ledger) or a desk order (creative_requests.paid_at). NULL when ANY of the three facts is
 * unreadable — the payments, the desk, or the day the account was made — and the caller treats
 * that as blocked. A referral we cannot check is not a referral we pay.
 */
export interface NewnessFacts { hasPaidBefore: boolean; accountAgeDays: number }

export async function newnessFor(clientId: string, atIso: string): Promise<NewnessFacts | null> {
  if (!clientId) return null
  const admin = createAdminClient()
  const at = Date.parse(atIso)
  const asOf = Number.isFinite(at) ? new Date(at).toISOString() : new Date().toISOString()
  try {
    const [paid, desk, client] = await Promise.all([
      admin.from('campaign_payments').select('id').eq('client_id', clientId).in('status', COLLECTED_STATUSES).lt('created_at', asOf).limit(1),
      // select('id') with a paid_at filter: pre-258 there is no such column and the read errors,
      // which is caught below and blocks — the honest answer when we cannot tell.
      admin.from('creative_requests').select('id').eq('client_id', clientId).not('paid_at', 'is', null).lt('paid_at', asOf).limit(1),
      admin.from('clients').select('created_at').eq('id', clientId).maybeSingle(),
    ])
    if (paid.error) return null
    // A desk table without the paid_at COLUMN (pre-258) cannot have a paid desk order on it, so
    // that one error is "no desk order". Every other error is "we do not know" — a timeout, a
    // permission, a table that is not there — and reading those as "no desk order" turned an
    // unreadable account into a brand new one, which is the answer that pays $100.
    if (desk.error && desk.error.code !== '42703') return null
    const hasPaidBefore = (paid.data?.length ?? 0) > 0 || (!desk.error && (desk.data?.length ?? 0) > 0)
    const born = Date.parse((client.data?.created_at as string) || '')
    // NO BIRTHDAY, NO REFERRAL. An unreadable created_at used to become age 0, which sails through
    // the newness floor — the one place a missing fact bought somebody $100. Unknown blocks, the
    // same as every other unknown here.
    if (!Number.isFinite(born)) return null
    const ageDays = Math.max(0, Math.floor((Date.parse(asOf) - born) / 86_400_000))
    return { hasPaidBefore, accountAgeDays: ageDays }
  } catch (e) { warn('could not check whether the account is new', e); return null }
}

export interface ClaimResult {
  ok: boolean
  /** the referrer's business name, for "Your friend X sent you" */
  fromName?: string
  creditCents?: number
  reason?: string
}

/**
 * The friend finished setup with a code on. Writes the referral row and the friend's own credit.
 *
 * ONE PER REFERRED BUSINESS, EVER: referrals.referred_client_id is unique, so a second call — a
 * retry, a re-run of onboarding, somebody pasting a different code a week later — is refused by
 * the database rather than by a check somebody could forget.
 *
 * The friend's credit is written HERE, at signup, because it is money OFF a bill they have not
 * placed yet: nothing has left us, and if they never order, nothing ever does. The referrer's
 * credit is the opposite and waits for a counted number (see the cron).
 */
export async function claimReferral(rawCode: string, referredClientId: string): Promise<ClaimResult> {
  if (!referralsEnabled()) return { ok: false, reason: 'closed' }
  if (!referredClientId) return { ok: false, reason: 'missing account' }
  const from = await clientForCode(rawCode)
  if (!from) return { ok: false, reason: 'no such code' }
  const admin = createAdminClient()
  try {
    const { data: existing } = await admin.from('referrals').select('id').eq('referred_client_id', referredClientId).maybeSingle()
    // As of NOW: the code is being typed now, so "new" is measured now. The same question is asked
    // again at payout, as of the referral's own created_at, so the two answers cannot drift.
    const now = new Date().toISOString()
    const [a, b, newness] = await Promise.all([
      accountFacts(from.clientId), accountFacts(referredClientId), newnessFor(referredClientId, now),
    ])
    if (!newness) return { ok: false, reason: 'could not check the account' }
    const blocked = referralBlock({
      referrerClientId: from.clientId,
      referredClientId,
      referrerEmail: a.email, referredEmail: b.email,
      referrerPhone: a.phone, referredPhone: b.phone,
      referrerStripeCustomerId: a.stripeCustomerId, referredStripeCustomerId: b.stripeCustomerId,
      alreadyReferred: !!existing,
      referredHasPaidBefore: newness.hasPaidBefore,
      referredAccountAgeDays: newness.accountAgeDays,
    })
    if (blocked) return { ok: false, reason: blocked }

    const { data: ref, error } = await admin
      .from('referrals')
      .insert({
        referrer_client_id: from.clientId,
        referred_client_id: referredClientId,
        code: normalizeCode(rawCode),
        status: 'signed_up',
        credit_cents_referrer: REFERRAL_CREDIT_CENTS,
        credit_cents_referred: REFERRAL_CREDIT_CENTS,
      })
      .select('id')
      .maybeSingle()
    if (error || !ref?.id) { warn('could not write the referral', error); return { ok: false, reason: 'not saved' } }

    // The friend's money off. Unique on (referral_id, reason), so a retry cannot write two.
    const { error: credErr } = await admin.from('client_credits').insert({
      client_id: referredClientId,
      cents: REFERRAL_CREDIT_CENTS,
      reason: 'friend_signup',
      referral_id: ref.id,
    })
    if (credErr) warn('the referral is saved but the credit is not', credErr)

    // The CRM already has a field for this (migration 064). Filling it means the admin client
    // list says where this business came from without anybody reading the referral table.
    await admin.from('clients')
      .update({ referred_by_client_id: from.clientId, lead_source: 'referral' })
      .eq('id', referredClientId)
      .then(({ error: e }) => { if (e) warn('could not stamp the lead source', e) })

    return { ok: true, fromName: from.name, creditCents: REFERRAL_CREDIT_CENTS }
  } catch (e) { warn('could not claim the referral', e); return { ok: false, reason: 'not saved' } }
}

/* ── the credit at checkout ──────────────────────────────────────────────── */

export interface ClaimedCredit { creditId: string; cents: number }

/**
 * The credit this checkout may take off the bill, claimed for THIS PaymentIntent.
 *
 * WHY THE CLAIM HAPPENS AT PREPARE. The PaymentIntent is created with the credit already taken
 * off its amount, so from that moment the credit is committed to that intent: if two tabs each
 * made an intent, both would be $50 short and only one of them was paid for.
 *
 * WHAT IS LEFT IS THE LEDGER'S ANSWER, NOT THIS ROW'S. Available = the face value, minus the sum
 * of the friend credit on every COLLECTED payment that names this credit, minus a live hold (a
 * checkout still open and younger than a day). Anything else — an abandoned tab, a cancelled
 * intent, a charge that went back — is money the owner still has.
 *
 * The claim is written with the previous holder AND the previous held amount in the WHERE clause,
 * so two checkouts racing for the same credit cannot both win it.
 *
 * AND THE OLD CHECKOUT IS SHUT AT STRIPE FIRST. A ledger row that says 'failed' is not the same
 * thing as a PaymentIntent that cannot be paid: a declined intent is still confirmable, with the
 * discount already inside its amount. So when the last holder was a real intent that never
 * collected, it is cancelled at Stripe before this credit moves, and if it cannot be cancelled —
 * because it is processing, already succeeded, or Stripe would not answer — nothing is claimed.
 *
 * NULL means "no credit on this bill", which is every order in the product until the switch is on.
 */
export async function claimFriendCredit(clientId: string, intentKey: string, maxCents: number): Promise<ClaimedCredit | null> {
  if (!referralsEnabled() || !clientId || maxCents <= 0) return null
  const admin = createAdminClient()
  try {
    const { data, error } = await admin
      .from('client_credits')
      .select('id, cents, consumed_cents, held_cents, consumed_intent_id, consumed_at')
      .eq('client_id', clientId)
      .is('voided_at', null)
      .order('created_at', { ascending: true })
      .limit(10)
    if (error) { warn('could not read the credits', error); return null }
    const rows = (data ?? []) as { id: string; cents: number; consumed_cents: number; held_cents: number; consumed_intent_id: string | null; consumed_at: string | null }[]
    const now = Date.now()
    for (const row of rows) {
      // The two facts the arithmetic needs, both read from the LEDGER, not from this row.
      const [settled, hold] = await Promise.all([settledCentsFor(row.id), holdStateFor(row.consumed_intent_id)])
      // Unreadable is not "nothing was spent". A credit we cannot account for is a credit nobody
      // may take: losing an owner a discount is recoverable, spending it twice is not.
      if (settled == null || hold == null) { warn('could not account for a credit', row.id); return null }
      const available = creditAvailableCents({
        cents: row.cents || 0,
        settledCents: settled,
        heldCents: row.held_cents || 0,
        hold,
        heldAtMs: row.consumed_at ? Date.parse(row.consumed_at) : null,
        nowMs: now,
      })
      const use = Math.min(available, Math.round(maxCents))
      if (use <= 0) continue
      // THE OLD CHECKOUT HAS TO BE SHUT BEFORE THIS ONE OPENS. Everything above this line is our
      // own ledger, and our ledger does not know that a declined PaymentIntent is still payable at
      // Stripe. Asked only when the last holder was a real intent that has NOT collected — a
      // collected one is already counted in `settled`, so its money cannot come off twice.
      if (hold !== 'collected' && isRealIntentId(row.consumed_intent_id)) {
        if (!await retirePriorCheckout(row.consumed_intent_id as string)) {
          // The old checkout is alive, or Stripe would not say. This credit is spoken for; look at
          // the next one rather than hand the same $50 to two checkouts.
          continue
        }
      }
      let q = admin.from('client_credits')
        .update({
          consumed_cents: settled + use,
          held_cents: use,
          consumed_at: new Date().toISOString(),
          consumed_intent_id: intentKey,
        })
        .eq('id', row.id)
        // Optimistic lock on BOTH halves of the hold we just read. Whoever read it first is who may
        // take it, so two tabs at the same checkout cannot both spend the same credit, and a hold
        // that moved while we were reading the ledger makes this update match nothing.
        .eq('held_cents', row.held_cents || 0)
      q = row.consumed_intent_id ? q.eq('consumed_intent_id', row.consumed_intent_id) : q.is('consumed_intent_id', null)
      const { data: claimed, error: upErr } = await q.select('id')
      if (upErr) { warn('could not claim the credit', upErr); return null }
      if (claimed && claimed.length) return { creditId: row.id, cents: use }
    }
    return null
  } catch (e) { warn('could not claim a credit', e); return null }
}

/**
 * What this credit has REALLY paid for: the friend credit on every COLLECTED payment that names
 * it, added up. NULL when the ledger cannot be read.
 *
 * This is the fix for the whole bug. The old code inferred "spent" from the single latest
 * consumed_intent_id, so an owner could hold a credit on one intent, abandon it, spend it on a
 * second, then go back and pay the first — and every abandoned-then-paid round trip took another
 * $50 off a $50 credit. The ledger cannot be talked into that: every collected order that used the
 * credit is a row, and the sum of those rows is what is gone.
 */
export async function settledCentsFor(creditId: string): Promise<number | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('campaign_payments')
      .select('friend_credit_cents')
      .eq('client_credit_id', creditId)
      .in('status', COLLECTED_STATUSES)
    if (error) return null
    return (data ?? []).reduce((n, r) => n + (Number((r as { friend_credit_cents?: number }).friend_credit_cents) || 0), 0)
  } catch {
    return null
  }
}

/**
 * What became of the checkout that holds a credit. Reads the ledger, never Stripe. NULL when it
 * cannot be read, which stops the claim above rather than guessing.
 *
 * A key with no payment row is 'waiting', not 'dropped', because that is the normal shape for the
 * first half-second of a checkout: prepare claims the credit under a `hold:` key BEFORE the
 * PaymentIntent exists. The day-long clock in liveHoldCents is what eventually gives it back.
 */
async function holdStateFor(intentId: string | null): Promise<HoldState | null> {
  if (!intentId) return 'dropped'
  try {
    const { data, error } = await createAdminClient()
      .from('campaign_payments')
      .select('status')
      .eq('stripe_payment_intent_id', intentId)
      .maybeSingle()
    if (error) return null
    const status = (data?.status as string) || ''
    if (!status) return 'waiting'
    if ((COLLECTED_STATUSES as readonly string[]).includes(status)) return 'collected'
    if (status === 'pending') return 'waiting'
    // cancelled, failed, or sent back in full: nothing is holding this money any more.
    return 'dropped'
  } catch {
    return null
  }
}

/**
 * The checkout a credit was held against, PUT BEYOND USE. True when the credit may now move.
 *
 * WHY THIS EXISTS. Our ledger is not the whole story. A card declines, the webhook writes 'failed',
 * and every sum in model.ts hands the $50 back — but the PaymentIntent behind that decline is
 * still sitting at Stripe with the discount already inside its amount, and it can still be
 * confirmed. Without this, an owner could open a second checkout, get the same $50 off, pay it,
 * then go back to the first tab and pay that one too: two orders, one credit, both discounted.
 *
 * FAILS CLOSED. A status Stripe would not give us, a cancel that would not go through, or a
 * status that means the money is already moving all answer FALSE, and false means nobody takes
 * this credit today. Losing an owner a discount for a day is the small mistake.
 */
export async function retirePriorCheckout(intentId: string): Promise<boolean> {
  if (!isRealIntentId(intentId)) return true          // a hold: key or a SetupIntent takes no money
  let status: string | null = null
  try {
    status = (await stripe.paymentIntents.retrieve(intentId)).status ?? null
  } catch (e) {
    warn('could not read the old checkout at Stripe', e)
    return false
  }
  const verdict = priorIntentVerdict(status)
  if (verdict === 'live' || verdict === 'unknown') return false
  if (verdict === 'cancel') {
    try {
      await stripe.paymentIntents.cancel(intentId)
    } catch (e) {
      // It may have moved to processing in the moment between the read and the cancel. Either way
      // we could not shut it, so we do not touch the credit.
      warn('could not cancel the old checkout', e)
      return false
    }
  }
  await markCheckoutCancelled(intentId)
  return true
}

/**
 * The ledger row for a checkout we just cancelled, said in the ledger's own words.
 *
 * Only a row that never took money is rewritten — 'pending' (nobody paid) or 'failed' (the card
 * was declined). A collected or refunded row is money that really moved and is never touched here.
 */
async function markCheckoutCancelled(intentId: string): Promise<void> {
  try {
    await createAdminClient().from('campaign_payments')
      .update({ status: 'cancelled' })
      .eq('stripe_payment_intent_id', intentId)
      .in('status', ['pending', 'failed'])
  } catch (e) { warn('could not close the old checkout row', e) }
}

/**
 * THE LAST LOOK, at the moment a payment is recorded. True means "record the money, but with no
 * credit on it" — the caller writes friend_credit_cents 0.
 *
 * The cancel above closes the door; this is the alarm on it. If a credit somehow came off two
 * bills anyway, the money still has to be recorded — it was really taken, and a payment we drop is
 * worse than a discount we mis-priced. What must never happen is the second order being recorded
 * as though the discount were real, because then nothing anywhere says the owner was undercharged.
 * So the row keeps the money and loses the credit, and a person is told, by name and by amount.
 *
 * Pass `alreadyCounted` when the payment row is already 'paid' in the ledger (the webhook flips
 * first and asks second), so its own cents are not counted twice.
 */
export async function friendCreditOverApplied(args: {
  intentId: string
  clientId: string
  creditId: string | null | undefined
  rowCreditCents: number | null | undefined
  alreadyCounted?: boolean
}): Promise<boolean> {
  const creditId = (args.creditId ?? '').trim()
  const rowCents = Math.max(0, Math.round(Number(args.rowCreditCents) || 0))
  if (!creditId || rowCents <= 0) return false          // no credit on this order: nothing to check
  let face = 0
  try {
    const { data, error } = await createAdminClient().from('client_credits').select('cents').eq('id', creditId).maybeSingle()
    if (error || !data) { warn('could not read the credit at payment time', error); return false }
    face = Number(data.cents) || 0
  } catch (e) { warn('could not read the credit at payment time', e); return false }
  const settled = await settledCentsFor(creditId)
  const input = { faceCents: face, settledCents: settled, rowCreditCents: args.alreadyCounted ? 0 : rowCents }
  const verdict = overApplyVerdict(input)
  // Unreadable: change nothing. Zeroing a credit we cannot account for would hand an owner back
  // money they really did spend. Say it loudly so a person can look.
  if (verdict === 'unreadable') {
    console.error('[referrals] could not account for credit', creditId, 'while recording', args.intentId)
    return false
  }
  if (verdict !== 'over') return false
  const short = overAppliedCents(input)
  console.error(`[referrals] credit over-applied on ${args.intentId}; owner was undercharged by ${creditWords(short)}`)
  try {
    const admin = createAdminClient()
    const { getAdminUserIds, createNotification } = await import('@/lib/notify')
    const { data: client } = await admin.from('clients').select('name').eq('id', args.clientId).maybeSingle()
    const name = (client?.name as string) || 'A client'
    for (const adminId of await getAdminUserIds(admin)) {
      await createNotification({
        supabase: admin,
        userId: adminId,
        type: 'payment',
        title: 'Credit used twice',
        body: `Credit over-applied on ${args.intentId}: ${name} was undercharged by ${creditWords(short)}. Refund the order or settle it by hand.`,
        link: '/admin/referrals',
      })
    }
  } catch (e) { warn('could not page anybody about a credit used twice', e) }
  return true
}

/**
 * Move a claim from the temporary hold key onto the real PaymentIntent, once Stripe has given us
 * one. Guarded on the key we wrote: if the hold has moved on (a day passed and another checkout
 * took it), this stamps nothing and answers false, and the caller keeps naming the old key so a
 * release cannot reach into somebody else's claim.
 */
export async function stampCreditIntent(creditId: string, fromIntentId: string, intentId: string): Promise<boolean> {
  if (!referralsEnabled() || !creditId || !intentId) return false
  try {
    const { data } = await createAdminClient().from('client_credits')
      .update({ consumed_intent_id: intentId })
      .eq('id', creditId)
      .eq('consumed_intent_id', fromIntentId)
      .select('id')
    return !!(data && data.length)
  } catch (e) { warn('could not tie the credit to the checkout', e); return false }
}

/**
 * Give a claimed credit back, unspent. Called when the checkout that claimed it could not be
 * created — the alternative is an owner whose $50 vanished into a PaymentIntent that never was.
 *
 * ONLY THE INTENT THAT ASKS. The release names the key it holds, and both the read and the write
 * check it, so a late release from an abandoned tab cannot zero a hold that now belongs to the
 * checkout the owner is actually looking at. What is left after the release is the LEDGER's
 * number, not this row's own arithmetic.
 */
export async function releaseFriendCredit(creditId: string, intentId: string): Promise<void> {
  if (!referralsEnabled() || !creditId || !intentId) return
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('client_credits').select('held_cents, consumed_intent_id').eq('id', creditId).maybeSingle()
    if (!data || (data.consumed_intent_id as string | null) !== intentId) return
    const settled = await settledCentsFor(creditId)
    if (settled == null) return          // unreadable ledger: leave the hold alone, it expires anyway
    await admin.from('client_credits')
      .update({
        consumed_cents: settled,
        held_cents: 0,
        consumed_at: settled > 0 ? new Date().toISOString() : null,
        consumed_intent_id: null,
      })
      .eq('id', creditId)
      .eq('consumed_intent_id', intentId)
      .eq('held_cents', (data.held_cents as number) || 0)
  } catch (e) { warn('could not release the credit', e) }
}
