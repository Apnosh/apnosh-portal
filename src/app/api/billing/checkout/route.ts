/**
 * POST /api/billing/checkout
 *
 * Starts a Stripe Checkout session for an agent-tier upgrade.
 * Body: { tier: 'basic' | 'standard' | 'pro' }
 *
 * Flow:
 *   1. Auth -> resolve client_id via client_users bridge
 *   2. Look up the active Stripe Price for the requested tier
 *      (searches Products by metadata.tier_id, then the Product's
 *      single active monthly Price -- created by scripts/sync-agent-tiers.ts)
 *   3. Get-or-create a Stripe customer for the client
 *   4. Create a Checkout session in subscription mode
 *   5. Return the URL for the client to redirect to
 *
 * Webhook handles the rest: customer.subscription.created arrives and
 * writes clients.tier from price metadata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe, getOrCreateStripeCustomerForClient } from '@/lib/stripe'
import { TIERS, type TierId } from '@/lib/agent/tiers'

export const runtime = 'nodejs'

const PURCHASEABLE_TIERS = ['basic', 'standard', 'pro'] as const
type PurchaseableTier = typeof PURCHASEABLE_TIERS[number]

function isPurchaseableTier(s: string): s is PurchaseableTier {
  return (PURCHASEABLE_TIERS as readonly string[]).includes(s)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { tier?: string } = {}
  try { body = await request.json() } catch { /* ignore */ }
  const tierId = (body.tier ?? '').toLowerCase()
  if (!isPurchaseableTier(tierId)) {
    return NextResponse.json(
      { error: `Invalid tier. Must be one of: ${PURCHASEABLE_TIERS.join(', ')}` },
      { status: 400 },
    )
  }
  const tier = TIERS[tierId as TierId]

  // Resolve client_id + basic client info we need for the Stripe customer.
  const { data: cu } = await supabase
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const clientId = cu?.client_id as string | undefined
  if (!clientId) {
    return NextResponse.json({ error: 'No client account found' }, { status: 404 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: client } = await admin
    .from('clients')
    .select('name, email')
    .eq('id', clientId)
    .maybeSingle() as { data: { name: string; email: string | null } | null }
  if (!client) {
    return NextResponse.json({ error: 'Client record missing' }, { status: 404 })
  }

  // Look up the active monthly price for this tier via metadata search.
  // The sync script tags both Product and Price with metadata.tier_id.
  let price
  try {
    const products = await stripe.products.search({
      query: `metadata['tier_id']:'${tierId}' AND active:'true'`,
      limit: 1,
    })
    const product = products.data[0]
    if (!product) {
      return NextResponse.json(
        { error: `No Stripe product for tier "${tierId}". Run scripts/sync-agent-tiers.ts first.` },
        { status: 500 },
      )
    }
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      type: 'recurring',
      limit: 5,
    })
    price = prices.data.find(p => p.recurring?.interval === 'month' && p.unit_amount === tier.priceCents)
      ?? prices.data[0]
    if (!price) {
      return NextResponse.json(
        { error: `No active monthly price on tier "${tierId}". Re-run scripts/sync-agent-tiers.ts.` },
        { status: 500 },
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stripe price lookup failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Get or create the Stripe customer for this client.
  const customerId = await getOrCreateStripeCustomerForClient({
    clientId,
    email: user.email ?? client.email ?? '',
    name: client.name,
  })

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      // Keep tier_id on the subscription so the webhook can rely on it
      // even if Stripe ever changes price.metadata semantics.
      subscription_data: {
        metadata: { tier_id: tierId, plan_name: `Apnosh ${tier.label}` },
      },
      success_url: `${origin}/dashboard/billing?success=true`,
      cancel_url: `${origin}/dashboard/upgrade?canceled=true`,
      allow_promotion_codes: true,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create checkout session'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
