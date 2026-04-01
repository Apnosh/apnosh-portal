'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getOrCreateStripeCustomer,
  createBillingPortalSession,
  stripe,
} from '@/lib/stripe'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean
  error?: string
}

interface CheckoutResult {
  success: boolean
  url?: string
  error?: string
}

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// ---------------------------------------------------------------------------
// updateBusinessProfile
// ---------------------------------------------------------------------------

export async function updateBusinessProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const name = formData.get('name') as string
  const industry = formData.get('industry') as string
  const description = formData.get('description') as string
  const website_url = formData.get('website_url') as string
  const phone = formData.get('phone') as string

  const { error } = await supabase
    .from('businesses')
    .update({ name, industry, description, website_url, phone })
    .eq('owner_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/profile')
  return { success: true }
}

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------

export interface CreateOrderData {
  service_id: string
  service_name: string
  type: 'subscription' | 'one_time' | 'a_la_carte'
  quantity: number
  unit_price: number
  total_price: number
  special_instructions?: string
  deadline?: string
}

export async function createOrder(orderData: CreateOrderData): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!business) return { success: false, error: 'No business found' }

  const { error } = await supabase.from('orders').insert({
    business_id: business.id,
    ...orderData,
    status: 'pending',
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/orders')
  return { success: true }
}

// ---------------------------------------------------------------------------
// createStripeCheckout — creates a Stripe Checkout Session and returns URL
// ---------------------------------------------------------------------------

export interface CheckoutItem {
  id: string
  name: string
  price: number
  quantity: number
  priceUnit: 'per_month' | 'per_item' | 'per_hour' | 'one_time'
  isSubscription: boolean
  instructions?: string
  deadline?: string
}

export async function createStripeCheckout(
  items: CheckoutItem[]
): Promise<CheckoutResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, stripe_customer_id')
    .eq('owner_id', user.id)
    .single()

  if (!business) return { success: false, error: 'No business found' }

  // Get or create Stripe customer
  const customerId = await getOrCreateStripeCustomer(
    business.id,
    user.email!,
    business.name
  )

  // Check if we have subscription items
  const hasSubscription = items.some((i) => i.isSubscription)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Build Stripe line items
  const lineItems = items.map((item) => {
    const lineItem: {
      price_data: {
        currency: string
        product_data: { name: string; metadata: Record<string, string> }
        unit_amount: number
        recurring?: { interval: 'month' }
      }
      quantity: number
    } = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          metadata: { service_id: item.id },
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }

    if (item.isSubscription) {
      lineItem.price_data.recurring = { interval: 'month' }
    }

    return lineItem
  })

  // Create pending orders in Supabase
  const sessionId = `cs_${Date.now()}`
  for (const item of items) {
    await supabase.from('orders').insert({
      business_id: business.id,
      type: item.isSubscription ? 'subscription' : 'one_time',
      service_id: item.id,
      service_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
      status: 'pending',
      special_instructions: item.instructions || null,
      deadline: item.deadline || null,
      stripe_checkout_session_id: sessionId,
    })
  }

  try {
    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      line_items: lineItems,
      mode: hasSubscription ? 'subscription' : 'payment',
      success_url: `${appUrl}/dashboard/billing?success=true`,
      cancel_url: `${appUrl}/dashboard/orders/checkout`,
      metadata: {
        business_id: business.id,
      },
      ...(hasSubscription
        ? { subscription_data: { metadata: { business_id: business.id } } }
        : { payment_intent_data: { metadata: { business_id: business.id } } }),
    })

    // Update orders with real session ID
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('stripe_checkout_session_id', sessionId)

    return { success: true, url: session.url! }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// openBillingPortal — redirects client to Stripe Customer Portal
// ---------------------------------------------------------------------------

export async function openBillingPortal(): Promise<CheckoutResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: business } = await supabase
    .from('businesses')
    .select('stripe_customer_id')
    .eq('owner_id', user.id)
    .single()

  if (!business?.stripe_customer_id) {
    return { success: false, error: 'No billing account found. Place an order first.' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = await createBillingPortalSession(
    business.stripe_customer_id,
    `${appUrl}/dashboard/billing`
  )

  return { success: true, url }
}

// ---------------------------------------------------------------------------
// approveDeliverable
// ---------------------------------------------------------------------------

export async function approveDeliverable(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('deliverables')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/approvals')
  return { success: true }
}

// ---------------------------------------------------------------------------
// requestRevision
// ---------------------------------------------------------------------------

export async function requestRevision(id: string, feedback: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('deliverables')
    .update({
      status: 'revision_requested',
      client_feedback: feedback,
    })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/approvals')
  return { success: true }
}

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

export async function sendMessage(threadId: string, content: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  if (!profile) return { success: false, error: 'Profile not found' }

  const { data: thread } = await supabase
    .from('message_threads')
    .select('business_id')
    .eq('id', threadId)
    .single()

  if (!thread) return { success: false, error: 'Thread not found' }

  const { error } = await supabase.from('messages').insert({
    business_id: thread.business_id,
    thread_id: threadId,
    sender_id: user.id,
    sender_name: profile.full_name,
    sender_role: profile.role,
    content,
    attachments: [],
  })

  if (error) return { success: false, error: error.message }

  await supabase
    .from('message_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', threadId)

  revalidatePath('/dashboard/messages')
  return { success: true }
}

// ---------------------------------------------------------------------------
// markNotificationRead
// ---------------------------------------------------------------------------

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Admin Actions
// ---------------------------------------------------------------------------

export async function adminCreateSubscription(
  businessId: string,
  serviceIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { success: false, error: 'Not authorized' }

  // Get business and Stripe customer
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, owner_id, stripe_customer_id')
    .eq('id', businessId)
    .single()

  if (!business) return { success: false, error: 'Business not found' }

  // Get owner email for Stripe
  const { data: owner } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', business.owner_id)
    .single()

  const customerId = await getOrCreateStripeCustomer(
    business.id,
    owner?.email || '',
    business.name
  )

  // Look up Stripe price IDs for each service
  const { data: services } = await supabase
    .from('service_catalog')
    .select('id, name, price, stripe_price_id')
    .in('id', serviceIds)

  if (!services?.length) return { success: false, error: 'No services found' }

  // Filter services that have Stripe prices
  const priceIds = services
    .filter((s) => s.stripe_price_id)
    .map((s) => s.stripe_price_id!)

  if (priceIds.length === 0) {
    return { success: false, error: 'Services not synced to Stripe yet. Run the sync script.' }
  }

  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: priceIds.map((priceId) => ({ price: priceId })),
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card', 'us_bank_account'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: { business_id: business.id },
    })

    // Create subscription records in Supabase
    for (const service of services) {
      await supabase.from('subscriptions').insert({
        business_id: business.id,
        plan_id: service.id,
        plan_name: service.name,
        plan_price: service.price,
        billing_interval: 'monthly',
        status: 'active',
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
      })
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create subscription'
    return { success: false, error: message }
  }
}

export async function adminCreateInvoice(
  businessId: string,
  amount: number,
  description: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { success: false, error: 'Not authorized' }

  const { data: business } = await supabase
    .from('businesses')
    .select('stripe_customer_id')
    .eq('id', businessId)
    .single()

  if (!business?.stripe_customer_id) {
    return { success: false, error: 'Client has no Stripe account' }
  }

  try {
    await stripe.invoiceItems.create({
      customer: business.stripe_customer_id,
      amount: Math.round(amount * 100),
      currency: 'usd',
      description,
    })

    const invoice = await stripe.invoices.create({
      customer: business.stripe_customer_id,
      auto_advance: true,
      collection_method: 'send_invoice',
      days_until_due: 7,
    })

    await stripe.invoices.finalizeInvoice(invoice.id)

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create invoice'
    return { success: false, error: message }
  }
}
