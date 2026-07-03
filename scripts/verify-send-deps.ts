/* Verify send infrastructure (offline, pure, no DB): composes every goal x tier plan and reports
 * each SEND that ships without the infrastructure it needs (SEND_DEPS in build-from-atoms.ts —
 * an sms-program with no sms-found/10DLC setup cannot legally or technically run).
 *
 * REPORT-ONLY for now: the known violations are a catalog-tagging gap (the infra services are not
 * in those goals' goalPlays, and adding them adds priced lines) — an owner pricing decision. Once
 * the retag lands, flip EXIT_ON_VIOLATION to true so a new violation can never ship silently.
 *
 * Run: npx tsx scripts/verify-send-deps.ts */
import { composePlanForGoal } from '../src/lib/campaigns/builder/compose-plan'
import { SEND_DEPS } from '../src/lib/campaigns/builder/build-from-atoms'

// Enforcing since 2026-07-02: the send-infra plays are in the catalog (SEND_INFRA_ADD /
// SEND_INFRA_RETIER in priced-catalog.ts), so any new violation is a regression, not a backlog item.
const EXIT_ON_VIOLATION = true

// Catalog itemIds. The three event goals compose content BEATS (no service moves), so SEND_DEPS
// has nothing to check there — they are listed so this stays complete as goals evolve.
const GOALS = ['firstvisit', 'nights', 'regulars', 'reviews', 'promoevent', 'launch', 'deal'] as const
const TIERS = ['a lean start', 'the full plan', 'an all-in push'] as const

let violations = 0
let checked = 0
for (const goal of GOALS) {
  for (const tier of TIERS) {
    const plan = composePlanForGoal(goal, { budget: tier })
    const ids = new Set((plan.moves ?? []).map((m) => m.serviceId))
    if (!ids.size) continue
    checked++
    for (const id of ids) {
      const deps = SEND_DEPS[id]
      if (!deps) continue
      const missing = deps.filter((d) => !ids.has(d))
      if (missing.length) {
        violations++
        console.log(`VIOLATION  ${goal} / ${tier}: ${id} ships without ${missing.join(' + ')}`)
      }
    }
  }
}

console.log(`\nChecked ${checked} composed plans with service moves.`)
if (violations === 0) console.log('OK: every composed plan carries the infrastructure its sends need.')
else console.log(`${violations} send(s) composed without their infrastructure. Retag goalPlays (owner decision: adds priced lines), then set EXIT_ON_VIOLATION = true.`)
if (EXIT_ON_VIOLATION && violations > 0) process.exit(1)
