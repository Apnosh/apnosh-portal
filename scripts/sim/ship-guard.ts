/**
 * The ship billing gate (owner decision B: ONE pay-first model), pure decision logic, no DB.
 *
 * Proves: a billable ship with no payment is REFUSED, whatever the draft's age; a valid
 * PaymentIntent routes to verify; free/DIY orders and the invoice lane still ship.
 *
 * The legacy carve-out (money move 1) is gone, and these checks are what stop it coming back: an
 * old, never-shipped draft used to ship billable work with no payment at all, onto an accrual rail
 * whose invoice has never once been raised. That was not a second way to get paid; it was a way to
 * do the work for free, and it never expired.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/ship-guard.ts
 */
import { config } from 'dotenv'
import { shipBillingGate } from '@/lib/campaigns/ship-guard'
import { Suite } from './lib'

config({ path: '.env.local' })

const OLD = '2020-01-01T00:00:00Z'      // a draft older than the checkout itself
const NEW = '2026-09-01T00:00:00Z'

function main() {
  const s = new Suite()

  s.group('free / DIY orders always ship')
  s.eq('$0 bill, no PI → allow', shipBillingGate({ preTaxCents: 0, hasPaymentIntent: false }), 'allow')
  s.eq('$0 one-time and $0 monthly → allow', shipBillingGate({ preTaxCents: 0, perMonthCents: 0, hasPaymentIntent: false }), 'allow')

  s.group('billable + PaymentIntent → verify the charge')
  s.eq('billable, PI present → verify', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: true }), 'verify')
  s.eq('monthly-only, PI present → verify', shipBillingGate({ preTaxCents: 0, perMonthCents: 9900, hasPaymentIntent: true }), 'verify')

  s.group('billable + NO payment → refuse, however old the draft is')
  s.eq('billable, no PI → REFUSE', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: false }), 'refuse')
  s.eq('monthly-only, no PI → REFUSE', shipBillingGate({ preTaxCents: 0, perMonthCents: 9900, hasPaymentIntent: false }), 'refuse')
  s.eq('$1 is still billable → REFUSE', shipBillingGate({ preTaxCents: 100, hasPaymentIntent: false }), 'refuse')

  s.group('THE LEGACY CARVE-OUT IS GONE (this is the regression guard)')
  // createdAtISO is no longer a parameter at all. Passing one must change nothing — if someone
  // re-adds a dated carve-out, these two flip to 'allow' and the run fails.
  s.eq('a 2020 draft, billable, no PI → REFUSE', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: false, ...({ createdAtISO: OLD } as object) }), 'refuse')
  s.eq('a 2026 draft, billable, no PI → REFUSE', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: false, ...({ createdAtISO: NEW } as object) }), 'refuse')

  s.group('the invoice lane is the ONE way to ship billable work without a card')
  s.eq('invoice lane, billable, no PI → allow', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: false, invoiceLane: true }), 'allow')
  s.eq('a presented payment still wins over the lane', shipBillingGate({ preTaxCents: 11000, hasPaymentIntent: true, invoiceLane: true }), 'verify')

  const ok = s.report('Ship billing gate — pay first, no carve-out')
  process.exit(ok ? 0 : 1)
}

main()
