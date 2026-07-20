/**
 * GET /api/dashboard/stripe-mode — which Stripe mode is this environment wired to?
 *
 * Vercel marks the Stripe keys "Sensitive", which makes them write-only: once saved,
 * nobody (including us) can read the value back to confirm whether Production is on
 * TEST or LIVE keys. That left a real question unanswerable from the outside — and
 * "probably test" is not good enough when the answer decides whether real cards get
 * charged. This route asks the one process that actually holds the key.
 *
 * It NEVER returns a key, or any part of one — only the mode implied by the standard
 * `sk_test_` / `sk_live_` / `pk_test_` / `pk_live_` prefixes, and whether the secret
 * and publishable keys AGREE. A mismatch matters: Stripe rejects mixed-mode pairs, so
 * checkout would be broken rather than merely running in test.
 *
 * Signed-in users only. Deliberately not admin-gated: the mode is not a secret, and the
 * owner needs to be able to confirm it from their normal session before taking payments.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Mode = 'test' | 'live' | 'missing' | 'unrecognized'

/** Prefix → mode. Never returns or logs any part of the key itself. */
function modeOf(key: string | undefined, kind: 'sk' | 'pk'): Mode {
  const k = (key ?? '').trim()
  if (!k) return 'missing'
  if (k.startsWith(`${kind}_test_`)) return 'test'
  if (k.startsWith(`${kind}_live_`)) return 'live'
  return 'unrecognized'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  const secret = modeOf(process.env.STRIPE_SECRET_KEY, 'sk')
  const publishable = modeOf(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 'pk')
  const bothPresent = secret !== 'missing' && publishable !== 'missing'
  const match = bothPresent && secret === publishable

  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV ?? 'unknown',
    secretKeyMode: secret,
    publishableKeyMode: publishable,
    webhookSecretPresent: !!(process.env.STRIPE_WEBHOOK_SECRET ?? '').trim(),
    match,
    // The plain-language answer, so nobody has to interpret the fields.
    verdict: !bothPresent
      ? 'Stripe keys are not fully configured here, so checkout cannot run.'
      : !match
        ? `MISMATCH: the secret key is ${secret} but the publishable key is ${publishable}. Stripe rejects mixed pairs, so checkout is broken until they match.`
        : secret === 'live'
          ? 'LIVE mode. Real cards will be charged.'
          : secret === 'test'
            ? 'TEST mode. No real money can move; only test cards work.'
            : 'The keys are set but not in a recognized Stripe format.',
  })
}
