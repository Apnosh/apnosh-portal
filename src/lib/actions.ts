'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getOrCreateStripeCustomer,
  createBillingPortalSession,
  stripe,
} from '@/lib/stripe'
import {
  notifyAgreementSent,
  notifyAgreementSigned,
  notifyInvoiceCreated,
  notifyNewMessage,
  notifyDeliverableApproved,
  notifyOrderCreated,
  getAdminUserIds,
} from '@/lib/notify'

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

  // Notify admins about new order
  const { data: biz } = await supabase.from('businesses').select('name').eq('id', business.id).single()
  const adminIds = await getAdminUserIds(supabase)
  await notifyOrderCreated(supabase, adminIds, biz?.name || 'Client', orderData.service_name)

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
    const { error: orderErr } = await supabase.from('orders').insert({
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
    if (orderErr) {
      console.error('Failed to create order:', orderErr.message, 'for item:', item.id)
    }
  }

  try {
    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      line_items: lineItems,
      mode: hasSubscription ? 'subscription' : 'payment',
      success_url: `${appUrl}/dashboard/orders/success?session_id={CHECKOUT_SESSION_ID}`,
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

  // Get deliverable info before updating
  const { data: deliverable } = await supabase
    .from('deliverables')
    .select('title, business_id')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('deliverables')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  // Notify admins
  if (deliverable) {
    const { data: biz } = await supabase.from('businesses').select('name').eq('id', deliverable.business_id).single()
    const adminIds = await getAdminUserIds(supabase)
    await notifyDeliverableApproved(supabase, adminIds, biz?.name || 'Client', deliverable.title)
  }

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

  // Notify the other side
  const { data: threadInfo } = await supabase
    .from('message_threads')
    .select('subject, business_id, businesses(owner_id)')
    .eq('id', threadId)
    .single()

  if (threadInfo) {
    if (profile.role === 'admin' || profile.role === 'team_member') {
      // Admin sent message → notify client
      const biz = Array.isArray(threadInfo.businesses) ? threadInfo.businesses[0] : threadInfo.businesses
      const ownerId = (biz as Record<string, unknown>)?.owner_id as string | undefined
      if (ownerId) {
        await notifyNewMessage(supabase, ownerId, profile.full_name, threadInfo.subject)
      }
    } else {
      // Client sent message → notify all admins
      const adminIds = await getAdminUserIds(supabase)
      for (const adminId of adminIds) {
        await notifyNewMessage(supabase, adminId, profile.full_name, threadInfo.subject)
      }
    }
  }

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

// ---------------------------------------------------------------------------
// Agreement & Contract Actions
// ---------------------------------------------------------------------------

export async function getAgreementTemplates(): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agreement_templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return { success: false, error: error.message }
  return { success: true, data: data || [] }
}

export async function saveAgreementTemplate(
  template: { id?: string; name: string; type: string; content: string; is_active: boolean }
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (template.id) {
    // Update: increment version
    const { data: existing } = await supabase
      .from('agreement_templates')
      .select('version')
      .eq('id', template.id)
      .single()

    const { error } = await supabase
      .from('agreement_templates')
      .update({
        name: template.name,
        type: template.type,
        content: template.content,
        is_active: template.is_active,
        version: (existing?.version || 0) + 1,
      })
      .eq('id', template.id)
    if (error) return { success: false, error: error.message }
  } else {
    // If setting as active, deactivate others of same type
    if (template.is_active) {
      await supabase
        .from('agreement_templates')
        .update({ is_active: false })
        .eq('type', template.type)
    }
    const { error } = await supabase
      .from('agreement_templates')
      .insert({ ...template, created_by: user.id })
    if (error) return { success: false, error: error.message }
  }

  revalidatePath('/admin/agreements')
  return { success: true }
}

export async function createAgreement(
  businessId: string,
  templateId: string,
  customFields: Record<string, string>
): Promise<{ success: boolean; agreementId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Get template
  const { data: template } = await supabase
    .from('agreement_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  if (!template) return { success: false, error: 'Template not found' }

  // Render content by replacing placeholders
  let rendered = template.content as string
  for (const [key, value] of Object.entries(customFields)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  const { data: agreement, error } = await supabase
    .from('agreements')
    .insert({
      business_id: businessId,
      agreement_type: template.type,
      template_id: templateId,
      version_number: template.version,
      custom_fields: customFields,
      rendered_content: rendered,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/clients/${businessId}`)
  return { success: true, agreementId: agreement.id }
}

export async function sendAgreement(agreementId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: agreement } = await supabase
    .from('agreements')
    .select('*, business:businesses(id, name, owner_id, client_status)')
    .eq('id', agreementId)
    .single()

  if (!agreement) return { success: false, error: 'Agreement not found' }

  // Update agreement status
  const { error } = await supabase
    .from('agreements')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', agreementId)
  if (error) return { success: false, error: error.message }

  // Update client status
  await supabase
    .from('businesses')
    .update({ client_status: 'agreement_sent' })
    .eq('id', agreement.business_id)

  // Log activity
  await supabase.from('client_activity_log').insert({
    business_id: agreement.business_id,
    action_type: 'agreement_sent',
    description: 'Service agreement sent for review and signature',
    performed_by: user.id,
  })

  // Notify client
  const biz = agreement.business as Record<string, unknown> | null
  if (biz?.owner_id) {
    await notifyAgreementSent(supabase, biz.owner_id as string, (biz.name as string) || 'your business')
  }

  revalidatePath(`/admin/clients/${agreement.business_id}`)
  return { success: true }
}

export async function signAgreement(
  agreementId: string,
  signerName: string,
  signerEmail: string,
  signerIp: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('agreements')
    .update({
      status: 'signed',
      signed_at: now,
      signed_by_name: signerName,
      signed_by_email: signerEmail,
      signed_by_ip: signerIp,
    })
    .eq('id', agreementId)

  if (error) return { success: false, error: error.message }

  // Get agreement to find business
  const { data: agreement } = await supabase
    .from('agreements')
    .select('business_id')
    .eq('id', agreementId)
    .single()

  if (agreement) {
    // Update client status
    await supabase
      .from('businesses')
      .update({ client_status: 'agreement_signed' })
      .eq('id', agreement.business_id)

    // Log activity
    await supabase.from('client_activity_log').insert({
      business_id: agreement.business_id,
      action_type: 'agreement_signed',
      description: `Agreement signed by ${signerName} (${signerEmail})`,
      metadata: { signer_ip: signerIp },
    })

    // Notify admins
    const { data: biz } = await supabase.from('businesses').select('name').eq('id', agreement.business_id).single()
    const adminIds = await getAdminUserIds(supabase)
    await notifyAgreementSigned(supabase, adminIds, biz?.name || 'Client', signerName)
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function addClientNote(
  businessId: string,
  content: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('client_notes').insert({
    business_id: businessId,
    author_id: user.id,
    author_name: profile?.full_name || 'Admin',
    content,
  })

  if (error) return { success: false, error: error.message }

  // Log activity
  await supabase.from('client_activity_log').insert({
    business_id: businessId,
    action_type: 'note_added',
    description: 'Internal note added',
    performed_by: user.id,
  })

  revalidatePath(`/admin/clients/${businessId}`)
  return { success: true }
}

export async function updateClientStatus(
  businessId: string,
  newStatus: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: business } = await supabase
    .from('businesses')
    .select('client_status')
    .eq('id', businessId)
    .single()

  const { error } = await supabase
    .from('businesses')
    .update({ client_status: newStatus })
    .eq('id', businessId)

  if (error) return { success: false, error: error.message }

  await supabase.from('client_activity_log').insert({
    business_id: businessId,
    action_type: 'status_change',
    description: `Status changed from ${business?.client_status || 'unknown'} to ${newStatus}`,
    performed_by: user.id,
    metadata: { old_status: business?.client_status, new_status: newStatus },
  })

  revalidatePath(`/admin/clients/${businessId}`)
  return { success: true }
}

export async function adminCreateManualInvoice(
  businessId: string,
  lineItems: { description: string; quantity: number; unit_price: number }[],
  dueDate: string,
  notes?: string,
  agreementId?: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const items = lineItems.map((li) => ({ ...li, total: li.quantity * li.unit_price }))
  const amount = items.reduce((sum, li) => sum + li.total, 0)

  const { data: invoice, error } = await supabase.from('invoices').insert({
    business_id: businessId,
    agreement_id: agreementId || null,
    amount,
    tax_amount: 0,
    total: amount,
    status: 'draft',
    description: items.map((li) => li.description).join(', '),
    due_date: dueDate,
    line_items: items,
    notes: notes || null,
  }).select('invoice_number').single()

  if (error) return { success: false, error: error.message }

  // Notify client
  const { data: biz } = await supabase.from('businesses').select('owner_id').eq('id', businessId).single()
  if (biz?.owner_id) {
    await notifyInvoiceCreated(supabase, biz.owner_id, amount, invoice?.invoice_number || undefined)
  }

  // Log activity
  await supabase.from('client_activity_log').insert({
    business_id: businessId,
    action_type: 'invoice_sent',
    description: `Invoice created for $${amount.toFixed(2)}`,
    performed_by: user.id,
  })

  revalidatePath(`/admin/clients/${businessId}`)
  return { success: true }
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
