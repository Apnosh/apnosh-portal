/**
 * POST /api/billing/portal
 *
 * Returns a Stripe Customer Portal URL for the currently signed-in client.
 * Client-facing entry point; admins use createCustomerPortalLink from
 * billing-actions.ts (which takes a clientId param and requires admin role).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Map auth user -> client_id via client_users bridge.
  const { data: cu } = await supabase
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!cu?.client_id) {
    return NextResponse.json({ error: 'No client account found' }, { status: 404 })
  }

  // Look up the Stripe customer on billing_customers.
  const { data: bc } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', cu.client_id)
    .maybeSingle()

  if (!bc?.stripe_customer_id) {
    return NextResponse.json({ error: 'Billing not set up yet. Contact your Apnosh team.' }, { status: 404 })
  }

  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.apnosh.com'
    const session = await stripe.billingPortal.sessions.create({
      customer: bc.stripe_customer_id,
      return_url: `${origin}/dashboard/billing`,
    }) as Stripe.BillingPortal.Session
    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create portal session'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
