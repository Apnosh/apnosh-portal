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
import { referralsEnabled } from '@/lib/referral-gate'
import { COLLECTED_STATUSES } from '@/lib/campaigns/refund-math'
import { getPromiseRows } from '@/lib/promises/read'
import {
  REFERRAL_CREDIT_CENTS, CODE_LENGTH, makeCode, normalizeCode, isCodeShape,
  referralBlock, creditAvailableCents, type HoldState, type ReferralStatus,
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
      .select('id, referred_client_id, status, created_at')
      .eq('referrer_client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100)
    const rows = (data ?? []) as { id: string; referred_client_id: string; status: string; created_at: string }[]
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
    }))
  } catch (e) { warn('could not read the friends', e) }
  try {
    const { data } = await admin
      .from('client_credits')
      .select('cents, consumed_cents, voided_at')
      .eq('client_id', clientId)
      .is('voided_at', null)
    for (const c of (data ?? []) as { cents: number; consumed_cents: number }[]) {
      creditCents += Math.max(0, (c.cents || 0) - (c.consumed_cents || 0))
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
    const [a, b] = await Promise.all([accountFacts(from.clientId), accountFacts(referredClientId)])
    const blocked = referralBlock({
      referrerClientId: from.clientId,
      referredClientId,
      referrerEmail: a.email, referredEmail: b.email,
      referrerPhone: a.phone, referredPhone: b.phone,
      referrerStripeCustomerId: a.stripeCustomerId, referredStripeCustomerId: b.stripeCustomerId,
      alreadyReferred: !!existing,
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
async function settledCentsFor(creditId: string): Promise<number | null> {
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
