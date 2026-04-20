/**
 * Row types for the billing schema (migration 055).
 *
 * All monetary values are integer cents. The source of truth is the
 * billing_customers, subscriptions, invoices, invoice_line_items,
 * products, and stripe_events tables -- Stripe mirrors live here.
 */

export type Currency = 'usd'

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing'
  | 'unpaid'
  | 'paused'
  | 'incomplete'
  | 'incomplete_expired'

export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible'
  | 'failed'

export type InvoiceType = 'subscription' | 'one_time'

export type ServiceCategory =
  | 'retainer'
  | 'reel'
  | 'website'
  | 'gbp'
  | 'addon'
  | 'custom'

export type BillingType = 'recurring' | 'one_time' | 'variable'

export type BillingInterval = 'day' | 'week' | 'month' | 'year'

export type CollectionMethod = 'send_invoice' | 'charge_automatically'

export interface BillingCustomer {
  id: string
  client_id: string
  stripe_customer_id: string
  default_payment_method_id: string | null
  payment_method_brand: string | null
  payment_method_last4: string | null
  default_currency: Currency
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  client_id: string
  stripe_subscription_id: string
  stripe_customer_id: string
  stripe_price_id: string | null
  plan_name: string
  amount_cents: number
  currency: Currency
  interval: BillingInterval
  status: SubscriptionStatus
  collection_method: CollectionMethod
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  trial_end: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  client_id: string
  stripe_invoice_id: string | null
  stripe_subscription_id: string | null
  invoice_number: string
  type: InvoiceType
  status: InvoiceStatus
  amount_due_cents: number
  amount_paid_cents: number
  subtotal_cents: number
  tax_cents: number
  total_cents: number
  currency: Currency
  issued_at: string | null
  due_at: string | null
  paid_at: string | null
  voided_at: string | null
  period_start: string | null
  period_end: string | null
  hosted_invoice_url: string | null
  invoice_pdf_url: string | null
  description: string | null
  notes: string | null
  payment_method: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  stripe_line_item_id: string | null
  stripe_price_id: string | null
  product_id: string | null
  description: string
  quantity: number
  unit_amount_cents: number
  amount_cents: number
  service_category: ServiceCategory | null
  period_start: string | null
  period_end: string | null
  created_at: string
}

export interface Product {
  id: string
  stripe_product_id: string
  stripe_price_id: string | null
  name: string
  description: string | null
  category: ServiceCategory
  billing_type: BillingType
  amount_cents: number | null
  currency: Currency
  interval: BillingInterval | null
  active: boolean
  stripe_metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface StripeEventRow {
  id: string
  stripe_event_id: string
  event_type: string
  processed_at: string | null
  error_message: string | null
  payload: Record<string, unknown> | null
  created_at: string
}
