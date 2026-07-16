/**
 * Phase 2.5 verification — the hardened ship billing gate (owner decision B: ONE pay-first model).
 * Pure decision logic, no DB. Proves: a billable, non-legacy ship with no payment is REFUSED; a valid
 * PaymentIntent routes to verify; free/DIY and genuinely legacy pre-checkout campaigns still ship.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/ship-guard.ts
 */
import { config } from 'dotenv'
import { shipBillingGate, CHECKOUT_REQUIRED_SINCE } from '@/lib/campaigns/ship-guard'
import { Suite } from './lib'

config({ path: '.env.local' })

const cutoff = Date.parse(CHECKOUT_REQUIRED_SINCE)
const LEGACY = new Date(cutoff - 86_400_000).toISOString()   // one day before the cutoff
const MODERN = new Date(cutoff + 86_400_000).toISOString()   // one day after the cutoff

function main() {
  const s = new Suite()

  s.group('free / DIY orders always ship')
  s.eq('$0 bill, no PI, modern campaign → allow', shipBillingGate({ preTaxCents: 0, hasPaymentIntent: false, createdAtISO: MODERN }), 'allow')
  s.eq('$0 bill even with no createdAt → allow', shipBillingGate({ preTaxCents: 0, hasPaymentIntent: false, createdAtISO: null }), 'allow')

  s.group('billable + PaymentIntent → verify the charge')
  s.eq('billable, PI present → verify', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: true, createdAtISO: MODERN }), 'verify')
  s.eq('verify wins even for a legacy-dated campaign that DID pay', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: true, createdAtISO: LEGACY }), 'verify')

  s.group('billable + NO payment → refuse unless genuinely legacy')
  s.eq('modern campaign, billable, no PI → REFUSE', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: false, createdAtISO: MODERN }), 'refuse')
  s.eq('no createdAt, billable, no PI → REFUSE (safe default)', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: false, createdAtISO: null }), 'refuse')
  s.eq('malformed createdAt, billable, no PI → REFUSE', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: false, createdAtISO: 'not-a-date' }), 'refuse')
  s.eq('legacy pre-checkout campaign, billable, no PI → allow (carve-out)', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: false, createdAtISO: LEGACY }), 'allow')

  s.group('the carve-out is a precise timestamp boundary')
  s.eq('exactly AT the cutoff → refuse (not before it)', shipBillingGate({ preTaxCents: 100, hasPaymentIntent: false, createdAtISO: new Date(cutoff).toISOString() }), 'refuse')
  s.eq('1ms before the cutoff → allow (legacy)', shipBillingGate({ preTaxCents: 100, hasPaymentIntent: false, createdAtISO: new Date(cutoff - 1).toISOString() }), 'allow')

  const ok = s.report('Phase 2.5 — hardened ship billing gate')
  process.exit(ok ? 0 : 1)
}

main()
