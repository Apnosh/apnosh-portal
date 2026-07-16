/**
 * G4 auto-subscription — starts the monthly subscription for a paid charge-at-checkout order, from the
 * SAVED CARD, at /checkout/complete. The client saw + agreed to the monthly on the bill before paying;
 * this is the machinery that actually starts it (previously the monthly was shown but never billed).
 * Server-only. TEST MODE is enforced by the shared `stripe` client's key — this module never picks keys.
 *
 * GUARANTEES:
 *  - Idempotent: an existing stripe_subscription_id short-circuits, AND stripe's idempotencyKey
 *    (campsub_<campaignId>) means a racing retry/webhook can't create a second subscription.
 *  - Honest on failure: creation failure stamps subscription_status='failed' + pages staff. It NEVER
 *    blocks or unwinds the one-time order (already paid + shipped) and NEVER silently drops the
 *    recurring revenue — the failed row is a durable, retryable record.
 *  - Degrade-safe: missing columns (pre-migration 221) or missing table no-op cleanly.
 */
import 'server-only'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe, startCampaignSubscription } from '@/lib/stripe'
import { checkoutBill } from './checkout-bill'
import { notifyStaffForClient } from '@/lib/notifications'
import type { CampaignDraft } from './types'

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type SubResult =
  | { ok: true; status: 'active' | 'none' | 'already'; subscriptionId?: string }
  | { ok: false; status: 'failed'; error: string }

/**
 * Ensure the monthly subscription for a paid order exists. Reads the payment row (its draft snapshot
 * gives the authoritative monthly total), starts the subscription from the saved card, and records it.
 * Best-effort by contract — the caller must not block on it.
 */
export async function ensureCampaignSubscription(paymentIntentId: string, campaignId: string): Promise<SubResult> {
  const a = admin()
  // Read the payment row (untyped — migration 215/221 not in generated types).
  let row: Record<string, unknown> | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (a.from('campaign_payments') as any)
      .select('client_id, stripe_customer_id, stripe_subscription_id, subscription_status, draft')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()
    row = data
  } catch {
    return { ok: true, status: 'none' }   // table/columns missing (pre-215/221) — nothing to do
  }
  if (!row) return { ok: true, status: 'none' }

  // Already started (idempotent short-circuit).
  if (typeof row.stripe_subscription_id === 'string' && row.stripe_subscription_id) {
    return { ok: true, status: 'already', subscriptionId: row.stripe_subscription_id }
  }

  // The authoritative monthly total from the snapshot the client paid against (never re-derived
  // from a mutable catalog). No recurring lines → nothing to start; record 'none'.
  const draft = (row.draft ?? null) as CampaignDraft | null
  const monthlyCents = draft && Array.isArray(draft.items) ? checkoutBill(draft).perMonthCents : 0
  if (!draft || monthlyCents <= 0) {
    await stampSub(a, paymentIntentId, { subscription_status: 'none', monthly_cents: monthlyCents })
    return { ok: true, status: 'none' }
  }

  const clientId = String(row.client_id ?? '')
  const customerId = String(row.stripe_customer_id ?? '')
  if (!customerId) {
    await failAndNotify(a, paymentIntentId, clientId, campaignId, monthlyCents, 'no Stripe customer on the payment row')
    return { ok: false, status: 'failed', error: 'no customer' }
  }

  // The shared monthly product (recurring price_data needs a product id). Reuses the same seeded
  // 'retainer' product the admin retainer flow uses. Missing → fail honestly (never a phantom sub).
  let productId = ''
  try {
    const { data: prod } = await a.from('products').select('stripe_product_id').eq('category', 'retainer').eq('active', true).maybeSingle()
    productId = String((prod as { stripe_product_id?: string } | null)?.stripe_product_id ?? '')
  } catch { /* handled below */ }
  if (!productId) {
    await failAndNotify(a, paymentIntentId, clientId, campaignId, monthlyCents, 'no monthly product seeded (run the Stripe products sync)')
    return { ok: false, status: 'failed', error: 'no product' }
  }

  // The card used at checkout (setup_future_usage saved it) → the subscription's default PM.
  let pmId: string | undefined
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id
  } catch { /* fall back to the customer's default PM */ }

  try {
    const sub = await startCampaignSubscription({
      customerId,
      clientId,
      campaignId,
      amountCents: monthlyCents,
      productId,
      defaultPaymentMethodId: pmId,
      planName: draft.name,
      idempotencyKey: `campsub_${campaignId}`,
    })
    await stampSub(a, paymentIntentId, { stripe_subscription_id: sub.id, subscription_status: 'active', monthly_cents: monthlyCents })
    return { ok: true, status: 'active', subscriptionId: sub.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'subscription create failed'
    await failAndNotify(a, paymentIntentId, clientId, campaignId, monthlyCents, msg)
    return { ok: false, status: 'failed', error: msg }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stampSub(a: any, paymentIntentId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await a.from('campaign_payments').update(patch).eq('stripe_payment_intent_id', paymentIntentId)
  } catch { /* pre-221 columns absent — the subscription itself is the source of truth */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function failAndNotify(a: any, paymentIntentId: string, clientId: string, campaignId: string, monthlyCents: number, reason: string): Promise<void> {
  await stampSub(a, paymentIntentId, { subscription_status: 'failed', monthly_cents: monthlyCents })
  // Never silently drop recurring revenue: page staff to set it up by hand. The one-time order stands.
  await notifyStaffForClient(clientId, ['strategist'], {
    kind: 'payment',
    title: 'Monthly subscription failed to start',
    body: `A paid campaign's $${Math.round(monthlyCents / 100)}/mo services didn't start automatically (${reason}). Start it manually; the one-time order is fine.`,
    link: `/admin/campaign-orders?focus=${campaignId}`,
  }).catch(() => ({ notified: 0 }))
}
