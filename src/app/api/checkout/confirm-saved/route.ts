import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { stripe } from '@/lib/stripe'
import { getSavedCard, paymentsTable } from '@/lib/campaigns/checkout-server'

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

/**
 * POST /api/checkout/confirm-saved — charge the prepared PaymentIntent against the customer's
 * card on file (off-session), so a returning owner can pay in one tap without re-entering a card.
 * Returns the resulting status; on 'requires_action' hands back the client secret so the browser
 * can run 3-D Secure and retry. Never trusts a client amount — it confirms the existing PI as-is.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const paymentIntentId = body.paymentIntentId as string | undefined
  if (!paymentIntentId) return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 })

  const { data: row } = await paymentsTable()
    .select('client_id, status, stripe_customer_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })

  const access = await checkClientAccess(row.client_id as string)
  if (!access.authorized) return denied(access.reason)
  if (row.status !== 'pending') return NextResponse.json({ error: 'This checkout is already complete.' }, { status: 409 })

  const card = await getSavedCard(row.stripe_customer_id as string)
  if (!card) return NextResponse.json({ error: 'No card on file. Enter a card instead.' }, { status: 400 })

  // Monthly-only checkout (SetupIntent — no charge today): confirm the card on file so the
  // subscription can start from it after ship. Same requires_action handling as a charge.
  if (paymentIntentId.startsWith('seti_')) {
    try {
      const si = await stripe.setupIntents.confirm(paymentIntentId, { payment_method: card.id })
      if (si.status === 'succeeded') return NextResponse.json({ status: 'succeeded' })
      if (si.status === 'requires_action') {
        return NextResponse.json({ status: 'requires_action', clientSecret: si.client_secret })
      }
      return NextResponse.json({ status: si.status, error: 'That card could not be set up. Try another card.' }, { status: 402 })
    } catch (e) {
      const err = e as { code?: string; raw?: { setup_intent?: { client_secret?: string } }; message?: string }
      const secret = err?.raw?.setup_intent?.client_secret
      if (err?.code === 'authentication_required' && secret) {
        return NextResponse.json({ status: 'requires_action', clientSecret: secret })
      }
      return NextResponse.json({ status: 'failed', error: err?.message || 'That card was declined. Try another card.' }, { status: 402 })
    }
  }

  try {
    // On-session: the customer IS present at checkout (they tapped Place order). Confirming
    // off_session would conflict with the PaymentIntent's setup_future_usage (card-saving), and
    // Stripe rejects that combination. On-session also lets us run 3-D Secure via the browser
    // (requires_action → handleNextAction) instead of failing.
    const pi = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: card.id,
    })
    if (pi.status === 'succeeded') return NextResponse.json({ status: 'succeeded' })
    if (pi.status === 'requires_action') {
      return NextResponse.json({ status: 'requires_action', clientSecret: pi.client_secret })
    }
    return NextResponse.json({ status: pi.status, error: 'That card could not be charged. Try another card.' }, { status: 402 })
  } catch (e) {
    // A card that needs authentication surfaces as an error carrying the PaymentIntent + its secret.
    const err = e as { code?: string; raw?: { payment_intent?: { client_secret?: string } }; message?: string }
    const secret = err?.raw?.payment_intent?.client_secret
    if (err?.code === 'authentication_required' && secret) {
      return NextResponse.json({ status: 'requires_action', clientSecret: secret })
    }
    return NextResponse.json({ status: 'failed', error: err?.message || 'That card was declined. Try another card.' }, { status: 402 })
  }
}
