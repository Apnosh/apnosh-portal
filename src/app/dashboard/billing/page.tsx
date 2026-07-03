'use client'

/**
 * Owner Billing — apnosh-mvp mobile surface. Reached from More -> Plan & billing.
 *
 * A pure read-and-handoff money screen: it shows the active plan, the payment
 * method on file, and invoice history, but NEVER collects card or bank details.
 * Every payment action hands off to a Stripe-hosted page:
 *   - Pay an open/failed invoice -> its Stripe hosted invoice URL
 *   - Update payment method      -> Stripe Customer Portal (/api/billing/portal)
 *   - Upgrade a plan             -> Stripe Checkout (/api/billing/checkout), auto
 *                                   launched when arriving with ?upgrade=<tier>
 *
 * Reads from billing v2 schema via the client_users bridge (auth user -> client).
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Calendar, CreditCard, ExternalLink, Download, Loader2, ChevronRight, ReceiptText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpRow, MvpPill, C, DISPLAY, type PillTone } from '@/components/mvp/mvp-detail'
import { buildReceipt } from '@/lib/campaigns/receipt'
import { money } from '@/components/campaigns/ui'
import type { SavedCampaign } from '@/lib/campaigns/view'

interface BillingCustomerRow {
  stripe_customer_id: string
  payment_method_brand: string | null
  payment_method_last4: string | null
}

interface SubscriptionRow {
  id: string
  plan_name: string
  amount_cents: number
  interval: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

interface InvoiceRow {
  id: string
  invoice_number: string
  type: string
  status: string
  total_cents: number
  issued_at: string | null
  due_at: string | null
  paid_at: string | null
  hosted_invoice_url: string | null
  invoice_pdf_url: string | null
}

function invoiceStatus(status: string): { label: string; tone: PillTone } {
  switch (status) {
    case 'paid': return { label: 'Paid', tone: 'good' }
    case 'open': return { label: 'Unpaid', tone: 'warn' }
    case 'failed': return { label: 'Payment failed', tone: 'bad' }
    case 'void': return { label: 'Canceled', tone: 'neutral' }
    case 'uncollectible': return { label: 'Written off', tone: 'bad' }
    default: return { label: 'Draft', tone: 'neutral' }
  }
}

function subStatus(status: string): { label: string; tone: PillTone } {
  switch (status) {
    case 'active': return { label: 'Active', tone: 'good' }
    case 'trialing': return { label: 'Trial', tone: 'good' }
    case 'past_due': return { label: 'Past due', tone: 'bad' }
    case 'paused': return { label: 'Paused', tone: 'warn' }
    default: return { label: status.charAt(0).toUpperCase() + status.slice(1), tone: 'warn' }
  }
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BillingPage() {
  const [billingCustomer, setBillingCustomer] = useState<BillingCustomerRow | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [orders, setOrders] = useState<SavedCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [upgradeStarting, setUpgradeStarting] = useState<string | null>(null)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Resolve this auth user's client_id via client_users bridge.
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    const clientId = cu?.client_id
    if (!clientId) { setLoading(false); return }

    const [bcRes, subRes, invRes] = await Promise.all([
      supabase.from('billing_customers').select('stripe_customer_id, payment_method_brand, payment_method_last4').eq('client_id', clientId).maybeSingle(),
      supabase.from('subscriptions').select('id, plan_name, amount_cents, interval, status, current_period_end, cancel_at_period_end').eq('client_id', clientId).in('status', ['active', 'trialing', 'past_due', 'paused']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('invoices').select('id, invoice_number, type, status, total_cents, issued_at, due_at, paid_at, hosted_invoice_url, invoice_pdf_url').eq('client_id', clientId).order('created_at', { ascending: false }).limit(24),
    ])

    setBillingCustomer(bcRes.data as BillingCustomerRow | null)
    setSubscription(subRes.data as SubscriptionRow | null)
    setInvoices((invRes.data ?? []) as InvoiceRow[])

    // Campaign orders (receipts) — independent of Stripe billing setup; shows what the owner has ordered.
    const campRes = await fetch(`/api/campaigns?clientId=${clientId}`).then((r) => (r.ok ? r.json() : { campaigns: [] })).catch(() => ({ campaigns: [] }))
    setOrders(((campRes.campaigns ?? []) as SavedCampaign[]).filter((c) => c.status === 'shipped'))

    setLoading(false)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      window.history.replaceState({}, '', '/dashboard/billing')
    }
    // If we landed here from /dashboard/upgrade with ?upgrade=<tier>, kick off
    // Stripe Checkout immediately. One fewer click; payment happens on Stripe.
    const tier = params.get('upgrade')
    if (tier && ['basic', 'standard', 'pro'].includes(tier.toLowerCase())) {
      setUpgradeStarting(tier)
      // Strip the param so a refresh doesn't re-trigger the redirect.
      window.history.replaceState({}, '', '/dashboard/billing')
      fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tier.toLowerCase() }),
      })
        .then(r => r.json())
        .then(json => {
          if (json.url) {
            window.location.href = json.url
          } else {
            setUpgradeError(json.error || 'Could not start checkout')
            setUpgradeStarting(null)
          }
        })
        .catch(err => {
          setUpgradeError(err instanceof Error ? err.message : 'Unknown error')
          setUpgradeStarting(null)
        })
    }
    load()
  }, [load])

  async function handleManageBilling() {
    setPortalLoading(true)
    setPortalError(null)
    try {
      // Server route returns a Stripe Customer Portal URL; redirect to it.
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (json.url) {
        window.location.href = json.url
      } else {
        setPortalError(json.error || 'Could not open billing portal')
        setPortalLoading(false)
      }
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Unknown error')
      setPortalLoading(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Billing" subtitle="Your plan and invoices" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>

        {/* Banners */}
        {portalError && <Banner tone="bad">{portalError}</Banner>}
        {upgradeStarting && !upgradeError && (
          <Banner tone="good"><Loader2 size={15} className="mvp-spin" /> Starting your {upgradeStarting} upgrade. Taking you to Stripe.</Banner>
        )}
        {upgradeError && <Banner tone="bad">Could not start upgrade: {upgradeError}</Banner>}

        {loading ? (
          <Skeleton />
        ) : (
          <>
            {/* Orders — campaign receipts, rebuilt from each shipped campaign. Independent of Stripe setup. */}
            {orders.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 6px 7px' }}>Orders</div>
                <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                  {orders.map((o, i) => {
                    const r = buildReceipt(o, today)
                    return (
                      <Link key={o.draft.id} href={`/dashboard/billing/orders/${o.draft.id}`} style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
                        {i > 0 && <div style={{ height: '0.5px', background: C.line }} />}
                        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                            <span style={{ width: 30, height: 30, borderRadius: 8, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ReceiptText size={15} color={C.greenDk} /></span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.draft.name}</div>
                              <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{money(r.bill.oneTimeOnDelivery)}{r.bill.perMonth > 0 ? ` + ${money(r.bill.perMonth)}/mo` : ''}{o.shippedAt ? ` · ${formatDate(o.shippedAt)}` : ''}</div>
                            </div>
                          </div>
                          <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {!billingCustomer ? (
          <div style={{ background: '#fff', border: `1px dashed ${C.green}`, borderRadius: 16, padding: '30px 22px', textAlign: 'center', marginTop: 4 }}>
            <CreditCard size={26} color={C.greenDk} style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Billing not set up yet</div>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 5, lineHeight: 1.45 }}>Your Apnosh team manages billing. Once your first invoice is sent, it shows up here.</div>
          </div>
        ) : (
          <>
            {/* Plan */}
            {subscription && (() => {
              const s = subStatus(subscription.status)
              return (
                <MvpGroup title="Plan">
                  <div style={{ padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 16.5, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, lineHeight: 1.2 }}>{subscription.plan_name}</span>
                      <MvpPill tone={s.tone} label={s.label} />
                    </div>
                    <div style={{ fontSize: 14, color: C.mute, marginTop: 5 }}>
                      <span style={{ fontWeight: 700, color: C.ink }}>{formatCents(subscription.amount_cents)}</span>/{subscription.interval === 'year' ? 'year' : 'month'}
                    </div>
                    {subscription.current_period_end && (
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Calendar size={12} />
                        {subscription.cancel_at_period_end
                          ? `Cancels on ${formatDate(subscription.current_period_end)}`
                          : `Next invoice ${formatDate(subscription.current_period_end)}`}
                      </div>
                    )}
                  </div>
                </MvpGroup>
              )
            })()}

            {/* Payment method */}
            <MvpGroup title="Payment method">
              <MvpRow
                icon={<CreditCard size={18} />}
                label={billingCustomer.payment_method_brand && billingCustomer.payment_method_last4
                  ? `${billingCustomer.payment_method_brand.toUpperCase()} ending in ${billingCustomer.payment_method_last4}`
                  : 'No card on file'}
                sub={billingCustomer.payment_method_brand && billingCustomer.payment_method_last4 ? 'On file' : 'Add one to pay invoices'}
              />
              <MvpRow
                icon={<ExternalLink size={18} />}
                label="Update payment method"
                sub="Opens the Stripe secure portal"
                onClick={portalLoading ? undefined : handleManageBilling}
                right={portalLoading ? <Loader2 size={16} className="mvp-spin" color={C.faint} /> : undefined}
              />
            </MvpGroup>

            {/* Invoices */}
            {invoices.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 6px 7px' }}>Invoices</div>
                <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                  {invoices.map((inv, i) => {
                    const st = invoiceStatus(inv.status)
                    const canPay = (inv.status === 'open' || inv.status === 'failed') && !!inv.hosted_invoice_url
                    const canView = inv.status === 'paid' && !!inv.hosted_invoice_url
                    return (
                      <div key={inv.id}>
                        {i > 0 && <div style={{ height: '0.5px', background: C.line }} />}
                        <div style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{inv.invoice_number}</span>
                                {inv.type === 'subscription' && <span style={{ fontSize: 11, color: C.faint }}>retainer</span>}
                              </div>
                              <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
                                {formatCents(inv.total_cents)} · {formatDate(inv.issued_at ?? inv.due_at)}{inv.paid_at && ` · paid ${formatDate(inv.paid_at)}`}
                              </div>
                            </div>
                            <MvpPill tone={st.tone} label={st.label} />
                          </div>
                          {(canPay || canView || inv.invoice_pdf_url) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
                              {canPay && (
                                <a href={inv.hosted_invoice_url!} target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.green, color: '#fff', borderRadius: 10, padding: '7px 13px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                                  <ExternalLink size={13} /> Pay now
                                </a>
                              )}
                              {canView && (
                                <a href={inv.hosted_invoice_url!} target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${C.line}`, color: C.ink, borderRadius: 10, padding: '7px 13px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                                  <ExternalLink size={13} /> View
                                </a>
                              )}
                              {inv.invoice_pdf_url && (
                                <a href={inv.invoice_pdf_url} target="_blank" rel="noopener noreferrer" title="Download PDF"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${C.line}`, color: C.mute, borderRadius: 10, padding: '7px 11px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                                  <Download size={13} /> PDF
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
          </>
        )}
      </div>
    </MvpShell>
  )
}

function Banner({ tone, children }: { tone: 'good' | 'bad'; children: React.ReactNode }) {
  const bg = tone === 'bad' ? C.coralSoft : C.greenSoft
  const fg = tone === 'bad' ? C.coral : C.greenDk
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: bg, color: fg, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '11px 13px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
      {children}
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ marginTop: 4 }}>
      {[64, 96, 140].map((h, i) => (
        <div key={i} style={{ height: h, background: '#ececef', borderRadius: 16, marginBottom: 14, animation: 'mvpPulse 1.2s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes mvpPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
    </div>
  )
}
