import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { stripe } from '@/lib/stripe'
import { randomUUID } from 'crypto'
import { checkoutBill, applyFriendCredit } from '@/lib/campaigns/checkout-bill'
import { claimFriendCredit, releaseFriendCredit, stampCreditIntent } from '@/lib/referrals/server'
import { ensureCheckoutCustomer, computeTaxCents, estimateMonthlyTaxCents, getSavedCard, paymentsTable } from '@/lib/campaigns/checkout-server'
import { resolveGatesForDraft } from '@/lib/campaigns/gates/config-server'
import { draftSourceCatalogIds, unbuyableCatalogIds } from '@/lib/campaigns/data/catalog-availability'
import { getContentOverrides } from '@/lib/campaigns/content-overrides-server'
import { shapeFor } from '@/lib/campaigns/builder/compose-plan'
import type { CampaignDraft } from '@/lib/campaigns/types'
import { campaignCheckoutEnabled } from '@/lib/checkout-gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { deskBill } from '@/lib/requests/desk-bill'
import { COLLECTED_STATUSES } from '@/lib/campaigns/refund-math'

/** Plain owner-facing name for a catalog id (falls back to the id itself). */
function cardName(id: string): string {
  return shapeFor(id)?.title ?? id
}

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

/**
 * POST /api/checkout/prepare — start a charge-at-checkout for a composed cart draft.
 * Recomputes the bill server-side (never trusts the client), computes tax from any stored
 * address, creates a PaymentIntent (card saved for reuse), and records a pending payment row
 * with the draft snapshot. Returns the client secret + itemized breakdown for the pay page.
 *
 * A $0 one-time bill (all owner-run/free lanes) skips Stripe entirely — the caller ships directly.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = body.clientId as string | undefined
  const requestId = typeof body.requestId === 'string' ? body.requestId : undefined
  const draft = body.draft as CampaignDraft | undefined
  // A DESK order pays here too. It has no draft — the order is one priced row in
  // creative_requests — so it takes its own lane through the same Stripe machinery, the same fee,
  // the same tax and the same kill switch. Everything below this line is the cart's lane.
  if (requestId) {
    if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    const access = await checkClientAccess(clientId)
    if (!access.authorized) return denied(access.reason)
    return prepareDeskOrder(clientId, requestId)
  }
  if (!clientId || !draft || !Array.isArray(draft.items)) {
    return NextResponse.json({ error: 'clientId and draft required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)

  // Availability guard — BEFORE any money moves (and before the free path ships). Every source
  // catalog id in the cart must be live: a coming-soon item can never ride behind a live first
  // item into a charge. Same override map + resolver the store and POST /api/campaigns use.
  const sourceIds = draftSourceCatalogIds(draft)
  if (sourceIds.length) {
    const overrides = await getContentOverrides().catch(() => ({}))
    const blocked = unbuyableCatalogIds(sourceIds, overrides)
    if (blocked.length) {
      const names = blocked.map((id) => `"${cardName(id)}"`).join(' and ')
      return NextResponse.json({
        error: `${names} ${blocked.length === 1 ? "isn't" : "aren't"} available to buy yet, so we didn't charge you. Remove ${blocked.length === 1 ? 'it' : 'them'} from your plan and try again.`,
      }, { status: 409 })
    }
  }

  const bill = checkoutBill(draft)
  // Law 5, the read: what this client has already given us, so checkout's "what we will need
  // from you" ticks the held items instead of re-promising to collect them. Best-effort — an
  // unreadable vault omits the key and the surface renders the all-unheld honest default.
  const vault = await (async () => {
    try {
      const { heldRequirementsUnion } = await import('@/lib/campaigns/setup/vault-bridge')
      const held = await heldRequirementsUnion(clientId)
      return { held: held.map((h) => h.requirement), hollow: held.filter((h) => h.hollow).map((h) => h.requirement) }
    } catch { return undefined }
  })()
  // Pre-checkout gates (Phase 4a): resolve the shoot booking gate (admin can turn it off/required/
  // optional per campaign) + any admin agreement/input gates. Never throws.
  const gates = await resolveGatesForDraft(draft, { clientId }).catch(() => ({ booking: null, custom: [] }))

  // Free order (owner-run/DIY lanes): nothing to charge NOW and nothing monthly. The client ships
  // via the normal rail. A monthly-only cart is NOT free — it must take a card + consent below so
  // the subscription really starts (previously it rode this path and never billed).
  if (bill.preTaxCents <= 0 && bill.perMonthCents <= 0) {
    return NextResponse.json({
      free: true,
      breakdown: { subtotalCents: 0, serviceFeeCents: 0, taxCents: 0, totalCents: 0 },
      monthlyCents: 0,
      monthlyTaxCents: null,
      gates,
      ...(vault ? { vault } : {}),
    })
  }

  // Server-side kill switch, positioned HERE rather than at the top of the route.
  //
  // It used to be the first statement, which read as the safest place for a money
  // guard and was wrong: this route also serves the FREE lanes, which return above
  // without ever touching Stripe. A $0 owner-run plan was being refused with "your
  // team will send an invoice for this", an invoice for nothing, by a switch whose
  // only job is to stop card charges.
  //
  // Everything above this line is free or read-only: bill math, availability, gates.
  // Everything below takes a card. So the guard sits on the boundary it actually
  // guards, still on the server, still before any Stripe call, and still fail-closed.
  if (!campaignCheckoutEnabled()) {
    // THE INVOICE LANE. Card checkout is shut, so nothing here may take a card. The order is still
    // an order: the client places it on invoice, the ship route (which re-checks this same switch)
    // ships it, delivered work accrues as invoiceable charges, and the admins are paged to bill.
    // This replaces a 503 whose message claimed the plan was saved while nothing was.
    return NextResponse.json({
      invoice: true,
      checkoutClosed: true,
      breakdown: { subtotalCents: bill.subtotalCents, serviceFeeCents: bill.serviceFeeCents, taxCents: 0, totalCents: bill.preTaxCents },
      monthlyCents: bill.perMonthCents,
      monthlyTaxCents: null,          // the invoice does its own tax; we do not quote it here
      gates,
      ...(vault ? { vault } : {}),
    })
  }

  const cust = await ensureCheckoutCustomer(clientId)
  if ('error' in cust) return NextResponse.json({ error: cust.error }, { status: 500 })

  // Monthly-only cart ($0 one-time, $X/mo): collect the card with a SetupIntent (no charge today);
  // the subscription starts from that saved card right after ship, exactly like a paid order.
  if (bill.preTaxCents <= 0) {
    try {
      const si = await stripe.setupIntents.create({
        customer: cust.customerId,
        usage: 'off_session',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `Apnosh — ${draft.name || 'campaign'} (monthly services)`,
        metadata: { clientId, kind: 'campaign_checkout_setup' },
      })
      const { error: insErr } = await paymentsTable().insert({
        client_id: clientId,
        stripe_payment_intent_id: si.id,
        stripe_customer_id: cust.customerId,
        subtotal_cents: 0,
        service_fee_cents: 0,
        tax_cents: 0,
        total_cents: 0,
        status: 'pending',
        draft,
      })
      if (insErr) {
        await stripe.setupIntents.cancel(si.id).catch(() => {})
        return NextResponse.json({ error: 'Checkout is not set up yet (payments table missing). Apply migration 215 and try again.' }, { status: 500 })
      }
      // THE MONTHLY HALF IS TAXED TOO. The subscription runs automatic_tax, so a screen that says
      // "$X/mo" and nothing else is short by the tax. Estimate it the same way the one-time half
      // does; null when the customer has no tax location, and the screen says "plus tax".
      const monthlyTaxCents = await estimateMonthlyTaxCents({ perMonthCents: bill.perMonthCents, customerId: cust.customerId })
      const savedCard = await getSavedCard(cust.customerId)
      return NextResponse.json({
        setupOnly: true,
        paymentIntentId: si.id,
        clientSecret: si.client_secret,
        publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
        breakdown: { subtotalCents: 0, serviceFeeCents: 0, taxCents: 0, totalCents: 0 },
        monthlyCents: bill.perMonthCents,
        monthlyTaxCents,
        savedCard,
        gates,
        ...(vault ? { vault } : {}),
      })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start checkout.' }, { status: 500 })
    }
  }

  // MOVE 8 — THE FRIEND CREDIT, and the only place in the cart it touches the money.
  //
  // It is claimed HERE, on the far side of the kill switch and just before the PaymentIntent, for
  // two reasons: the intent's amount has to already have the credit in it (or the card is charged
  // the wrong number), and nothing above this line takes a card, so a free or invoiced order never
  // spends a credit. claimFriendCredit returns null whenever REFERRALS_ENABLED is off or migration
  // 261 has not run, and applyFriendCredit is a no-op on null — so with the switch off every line
  // below is byte-for-byte the order this route has always placed.
  const claim = await claimFriendCredit(clientId, `hold:${randomUUID()}`, bill.subtotalCents)
  const billed = claim ? applyFriendCredit(bill, claim.cents) : bill

  try {
    const tax = await computeTaxCents({ preTaxCents: billed.preTaxCents, customerId: cust.customerId })
    const totalCents = billed.preTaxCents + tax.taxCents
    // Same calculation, run on the monthly line, because the subscription is taxed too (stripe.ts
    // sets automatic_tax on it). Estimate only — never committed, never charged from here.
    const monthlyTaxCents = await estimateMonthlyTaxCents({ perMonthCents: bill.perMonthCents, customerId: cust.customerId })

    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: cust.customerId,
      // Save the card on the customer so the next checkout can reuse it.
      setup_future_usage: 'off_session',
      // Card-focused checkout: no redirect-based methods. This keeps a server-side saved-card
      // confirm from requiring a return_url, and lets us reuse the card on file cleanly. Card
      // 3-D Secure still works (it's an in-page step, not a redirect method).
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: `Apnosh — ${draft.name || 'campaign'}`,
      metadata: { clientId, kind: 'campaign_checkout' },
      // Stripe emails the receipt; before this the confirmation screen was the only trace of a charge.
      ...('email' in cust && cust.email ? { receipt_email: cust.email } : {}),
    })

    // The credit now belongs to a real checkout. Before this stamp it is held against nothing,
    // which is what lets an abandoned attempt hand the money back.
    if (claim) await stampCreditIntent(claim.creditId, pi.id)

    const { error: insErr } = await paymentsTable().insert({
      client_id: clientId,
      stripe_payment_intent_id: pi.id,
      stripe_customer_id: cust.customerId,
      // The FULL items subtotal, not the discounted one: it is what delivered work is measured
      // against if this order is ever stopped (refund-math.ts).
      subtotal_cents: billed.subtotalCents,
      service_fee_cents: billed.serviceFeeCents,
      tax_cents: tax.taxCents,
      total_cents: totalCents,
      status: 'pending',
      stripe_tax_calculation_id: tax.calculationId,
      draft,
      // Only written when there IS a credit, so a database without migration 261 is never sent a
      // column it does not have.
      ...(claim ? { friend_credit_cents: claim.cents, client_credit_id: claim.creditId } : {}),
    })
    // If we can't record the payment (e.g. migration 215 not applied), don't leave a chargeable
    // PaymentIntent with no matching row — cancel it and surface a clear error.
    if (insErr) {
      await stripe.paymentIntents.cancel(pi.id).catch(() => {})
      if (claim) await releaseFriendCredit(claim.creditId)
      return NextResponse.json({ error: 'Checkout is not set up yet (payments table missing). Apply migration 215 and try again.' }, { status: 500 })
    }

    // A card already on file → the pay page offers a one-tap "Pay with •••• last4".
    const savedCard = await getSavedCard(cust.customerId)

    return NextResponse.json({
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      ...(vault ? { vault } : {}),
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
      breakdown: {
        subtotalCents: billed.subtotalCents,
        serviceFeeCents: billed.serviceFeeCents,
        taxCents: tax.taxCents,
        totalCents,
        // Absent on every bill without one, so the pay screen's own lines are unchanged until
        // there is a credit to name.
        ...(billed.friendCreditCents ? { friendCreditCents: billed.friendCreditCents } : {}),
      },
      monthlyCents: billed.perMonthCents,
      monthlyTaxCents,
      savedCard,
      gates,
    })
  } catch (e) {
    // The charge never started, so the credit was never spent. Hand it back.
    if (claim) await releaseFriendCredit(claim.creditId)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start checkout.' }, { status: 500 })
  }
}

/* ── The desk lane ───────────────────────────────────────────────────────────
   A Request Desk order used to mint its work order the second it was placed, with no charge and
   with "Goes on your Apnosh bill" printed under a bill that did not exist. It now pays first,
   through this route, with the SAME fee (feeCentsOn, inside the stored quote), the SAME Stripe Tax,
   the SAME kill switch and the SAME PaymentIntent shape the cart uses. Nothing is minted here —
   the mint waits for /api/checkout/complete to verify the money. */
async function prepareDeskOrder(clientId: string, requestId: string) {
  const admin = createAdminClient()
  // select('*') so the paid_at / payment_id columns being absent (pre-258) cannot error the read.
  const { data: rowRaw, error: readErr } = await admin.from('creative_requests').select('*').eq('id', requestId).maybeSingle()
  if (readErr) return NextResponse.json({ error: 'Could not read this order. Try again.' }, { status: 500 })
  const row = rowRaw as Record<string, unknown> | null
  if (!row) return NextResponse.json({ error: 'That order does not exist.' }, { status: 404 })
  // Tenancy: the access check above proved the caller may act for THIS client; the order must be
  // this client's too, or an id from another account would be payable from here.
  if (String(row.client_id ?? '') !== clientId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Already paid: never a second charge, and never a second work order. The screen shows the
  // confirmation instead.
  //
  // creative_requests.paid_at is NOT enough on its own. It is stamped by finalizePaidDeskOrder,
  // which runs after the charge — so an owner whose tab closed between the card clearing and the
  // stamp comes back to a page that cheerfully makes them a SECOND PaymentIntent for an order
  // Stripe has already collected. The payment ledger is the truth about money; the order row is
  // only its echo. Either one saying paid is enough to stop.
  if (row.paid_at || (await hasCollectedPayment(requestId))) {
    return NextResponse.json({ alreadyPaid: true, requestId })
  }

  const cadence = row.cadence === 'monthly' ? 'monthly' as const : 'once' as const
  const bill = deskBill(row.quote_cents as number | null, cadence)
  // FAIL CLOSED on a price we do not have. A desk order with no number is not a free order — it is
  // an order we could not price, and charging $0 for work a person will do is the wrong mistake.
  if (bill.preTaxCents <= 0 && bill.perMonthCents <= 0) {
    return NextResponse.json({ error: 'We could not price this order. Your team will get in touch.' }, { status: 409 })
  }

  // The kill switch, same words the cart shows. Nothing is charged and — because the mint moved to
  // /complete — nothing is made either, which is the point: a closed till makes no work.
  if (!campaignCheckoutEnabled()) {
    return NextResponse.json({
      invoice: true,
      checkoutClosed: true,
      breakdown: { subtotalCents: bill.subtotalCents, serviceFeeCents: bill.serviceFeeCents, taxCents: 0, totalCents: bill.preTaxCents },
      monthlyCents: bill.perMonthCents,
      monthlyTaxCents: null,
      gates: { booking: null, custom: [] },
    })
  }

  const cust = await ensureCheckoutCustomer(clientId)
  if ('error' in cust) return NextResponse.json({ error: cust.error }, { status: 500 })
  const label = `Apnosh — ${String(row.type ?? 'creative')} order`

  try {
    // Monthly-only desk line (a social posting package): take the card with a SetupIntent and let
    // the subscription bill it. Nothing is charged today, so the screen must not say a number is.
    if (bill.preTaxCents <= 0) {
      const si = await stripe.setupIntents.create({
        customer: cust.customerId,
        usage: 'off_session',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `${label} (monthly)`,
        metadata: { clientId, requestId, kind: 'desk_checkout_setup' },
      })
      // No chargeable intent may outlive a failed row: cancel it rather than leave money reachable.
      const failed = await insertDeskPayment({ clientId, requestId, intentId: si.id, customerId: cust.customerId, bill, taxCents: 0, calculationId: null })
      if (failed) { await stripe.setupIntents.cancel(si.id).catch(() => {}); return failed }
      const monthlyTaxCents = await estimateMonthlyTaxCents({ perMonthCents: bill.perMonthCents, customerId: cust.customerId })
      return NextResponse.json({
        setupOnly: true,
        requestId,
        paymentIntentId: si.id,
        clientSecret: si.client_secret,
        publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
        breakdown: { subtotalCents: 0, serviceFeeCents: 0, taxCents: 0, totalCents: 0 },
        monthlyCents: bill.perMonthCents,
        monthlyTaxCents,
        savedCard: await getSavedCard(cust.customerId),
        gates: { booking: null, custom: [] },
      })
    }

    const tax = await computeTaxCents({ preTaxCents: bill.preTaxCents, customerId: cust.customerId })
    const totalCents = bill.preTaxCents + tax.taxCents
    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: cust.customerId,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: label,
      metadata: { clientId, requestId, kind: 'desk_checkout' },
      ...('email' in cust && cust.email ? { receipt_email: cust.email } : {}),
    })
    const failed = await insertDeskPayment({ clientId, requestId, intentId: pi.id, customerId: cust.customerId, bill, taxCents: tax.taxCents, calculationId: tax.calculationId })
    if (failed) { await stripe.paymentIntents.cancel(pi.id).catch(() => {}); return failed }
    return NextResponse.json({
      requestId,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
      breakdown: { subtotalCents: bill.subtotalCents, serviceFeeCents: bill.serviceFeeCents, taxCents: tax.taxCents, totalCents },
      monthlyCents: 0,
      monthlyTaxCents: null,
      savedCard: await getSavedCard(cust.customerId),
      gates: { booking: null, custom: [] },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start checkout.' }, { status: 500 })
  }
}

/**
 * Write the pending payment row for a desk order. Returns NULL on success, or the error response
 * the caller must return (after cancelling the intent it just created).
 *
 * FAILS CLOSED on a missing request_id column. Everywhere else in this app a missing column is
 * swallowed so the product keeps working, but a charge we cannot tie back to the order it paid for
 * is money with no receipt: nothing could mint the work, refund it, or say what it was. So a
 * pre-258 database refuses the charge and says which SQL to run, rather than taking it.
 */
async function insertDeskPayment(args: {
  clientId: string; requestId: string; intentId: string; customerId: string
  bill: { subtotalCents: number; serviceFeeCents: number; perMonthCents: number; preTaxCents: number }
  taxCents: number; calculationId: string | null
}): Promise<NextResponse | null> {
  const { error } = await paymentsTable().insert({
    client_id: args.clientId,
    request_id: args.requestId,
    stripe_payment_intent_id: args.intentId,
    stripe_customer_id: args.customerId,
    subtotal_cents: args.bill.subtotalCents,
    service_fee_cents: args.bill.serviceFeeCents,
    tax_cents: args.taxCents,
    total_cents: args.bill.preTaxCents + args.taxCents,
    status: 'pending',
    stripe_tax_calculation_id: args.calculationId,
  })
  if (!error) return null
  const missingColumn = (error as { code?: string }).code === '42703'
  return NextResponse.json({
    error: missingColumn
      ? 'Card checkout for the desk is not set up yet (apply migration 258). Nothing was charged.'
      : 'Could not start checkout. Nothing was charged.',
  }, { status: 500 })
}

/**
 * Has a card already been collected for this desk order?
 *
 * Reads the payment ledger, which is written the moment Stripe confirms, rather than the order row,
 * which is stamped a step later. COLLECTED_STATUSES, not 'paid' alone: a partly refunded or
 * disputed charge is still money that was taken, and offering a fresh PaymentIntent on top of it
 * would charge the same order twice.
 *
 * FALSE on an unreadable read (pre-258 there is no request_id column to filter on). That is the
 * honest degrade: pre-258 insertDeskPayment fails closed and no card is ever taken, so there is no
 * collected payment to miss.
 */
async function hasCollectedPayment(requestId: string): Promise<boolean> {
  try {
    const { data, error } = await paymentsTable()
      .select('status')
      .eq('request_id', requestId)
      .in('status', COLLECTED_STATUSES)
      .limit(1)
    if (error || !Array.isArray(data)) return false
    return data.length > 0
  } catch {
    return false
  }
}
