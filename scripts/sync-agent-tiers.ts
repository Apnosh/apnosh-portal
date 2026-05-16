/**
 * Sync the 4 agent tiers (Starter / Basic / Standard / Pro) to Stripe.
 *
 * Creates a Product per tier and a recurring monthly Price, tagged with
 * metadata.tier_id so the webhook can map a subscription back to a tier.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/sync-agent-tiers.ts
 *
 * The script is idempotent — it searches by `metadata['tier_id']` before
 * creating, and creates a new active Price (and archives the old one)
 * only if the unit amount changed.
 *
 * After running, paste the product/price IDs into your env if you want
 * the app code to reference them directly. (Not required — the webhook
 * reads tier_id from the price metadata, so env vars are optional.)
 */

import Stripe from 'stripe'
import { TIERS } from '../src/lib/agent/tiers'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_SECRET_KEY) {
  console.error('Set STRIPE_SECRET_KEY environment variable')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
})

async function syncTiers() {
  console.log('Syncing 4 agent tiers to Stripe...\n')

  for (const tier of Object.values(TIERS)) {
    if (tier.priceCents === 0) {
      console.log(`⏭  ${tier.label} — free trial, no Stripe product needed`)
      continue
    }

    // 1. Find or create the Product.
    let product: Stripe.Product
    const existing = await stripe.products.search({
      query: `metadata['tier_id']:'${tier.id}'`,
    })

    if (existing.data.length > 0) {
      product = existing.data[0]
      // Keep name/description in sync.
      product = await stripe.products.update(product.id, {
        name: `Apnosh ${tier.label}`,
        description: tier.pitch,
        metadata: { tier_id: tier.id, price_cents: String(tier.priceCents) },
      })
      console.log(`✓  Product: ${product.id} (${tier.label}) — updated`)
    } else {
      product = await stripe.products.create({
        name: `Apnosh ${tier.label}`,
        description: tier.pitch,
        metadata: { tier_id: tier.id, price_cents: String(tier.priceCents) },
      })
      console.log(`✓  Product: ${product.id} (${tier.label}) — created`)
    }

    // 2. Find or create the matching active monthly Price.
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 10,
    })

    const matching = prices.data.find(
      p => p.unit_amount === tier.priceCents
        && p.recurring?.interval === 'month'
        && p.currency === 'usd',
    )

    let price: Stripe.Price
    if (matching) {
      price = matching
      console.log(`   Price:   ${price.id} ($${(tier.priceCents / 100).toFixed(2)}/mo) — kept`)
    } else {
      // Archive any other active prices for this product so /checkout
      // only ever finds one current price per tier.
      for (const old of prices.data) {
        await stripe.prices.update(old.id, { active: false })
        console.log(`   Price:   ${old.id} — archived (amount changed)`)
      }
      price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: tier.priceCents,
        recurring: { interval: 'month' },
        metadata: { tier_id: tier.id },
      })
      console.log(`   Price:   ${price.id} ($${(tier.priceCents / 100).toFixed(2)}/mo) — created`)
    }
  }

  console.log('\nDone. The webhook reads tier_id from the price metadata to set clients.tier on subscription events.')
}

syncTiers().catch(err => {
  console.error(err)
  process.exit(1)
})
