/**
 * Sync all services from services-data.ts to Stripe Products + Prices.
 *
 * Usage: npx tsx scripts/sync-stripe-products.ts
 *
 * This script is idempotent — it checks for existing products by metadata
 * before creating new ones.
 */

import Stripe from 'stripe'
import { services } from '../src/lib/services-data'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_SECRET_KEY) {
  console.error('Set STRIPE_SECRET_KEY environment variable')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-03-31.basil',
})

async function syncProducts() {
  console.log(`Syncing ${services.length} services to Stripe...\n`)

  let created = 0
  let skipped = 0

  for (const service of services) {
    // Check if product already exists
    const existing = await stripe.products.search({
      query: `metadata['service_id']:'${service.id}'`,
    })

    if (existing.data.length > 0) {
      console.log(`⏭  ${service.name} (already exists)`)
      skipped++
      continue
    }

    // Create product
    const product = await stripe.products.create({
      name: service.name,
      description: service.shortDescription,
      metadata: {
        service_id: service.id,
        category: service.category,
        price_unit: service.priceUnit,
      },
    })

    // Create price
    const priceParams: Stripe.PriceCreateParams = {
      product: product.id,
      currency: 'usd',
      metadata: { service_id: service.id },
    }

    if (service.isSubscription || service.priceUnit === 'per_month') {
      priceParams.unit_amount = Math.round(service.price * 100)
      priceParams.recurring = { interval: 'month' }
    } else {
      priceParams.unit_amount = Math.round(service.price * 100)
    }

    const price = await stripe.prices.create(priceParams)

    console.log(
      `✓  ${service.name} — $${service.price}/${service.priceUnit} ` +
        `(product: ${product.id}, price: ${price.id})`
    )
    created++
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`)
  console.log('\nNext: Run the Supabase seed to store stripe_product_id and stripe_price_id in the service_catalog table.')
}

syncProducts().catch(console.error)
