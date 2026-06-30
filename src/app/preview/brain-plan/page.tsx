/**
 * DEV-ONLY preview of the owner-facing brain plan (BrainPlanView). Builds a realistic view model
 * from the REAL brain functions (resolveOutcome, brainRankedMix, playsForGoalAtoms) with mock
 * signals, so the presentation can be reviewed without an authenticated builder session. Not prod.
 */
import { notFound } from 'next/navigation'
import { resolveOutcome } from '@/lib/campaigns/brain/objective'
import { brainRankedMix } from '@/lib/campaigns/brain/rank'
import { suggestTier } from '@/lib/campaigns/brain/suggest-tier'
import { emptySignals } from '@/lib/campaigns/brain/signals'
import { reading } from '@/lib/campaigns/brain/readiness'
import { playsForGoalAtoms } from '@/lib/campaigns/data/atom-plays'
import { SYSTEM_STAGES } from '@/lib/campaigns/builder/compose-plan'
import { BrainPlanView, type PlanLine, type BrainPlanVM } from './brain-plan-view'

export const dynamic = 'force-dynamic'

const TIER_RANK = { lean: 0, standard: 1, aggressive: 2 } as const

export default async function BrainPlanPreview() {
  if (process.env.NODE_ENV === 'production') notFound()

  const goal = 'nights' as const
  const tier = 'standard' as const

  // A realistic mid-data taqueria: a 3.7 rating, a real email list, email/social/Google connected
  // but NOT texting, and one play that has worked before.
  const signals = emptySignals()
  signals.rating = reading(3.7)
  signals.ratingCount = reading(45)
  signals.hasList = reading(true)
  signals.listSize = reading(320)
  signals.connectedChannels = reading(['email', 'social', 'gbp'])
  const all = playsForGoalAtoms(goal)
  const workingId = all.find((p) => !p.crucial)?.serviceId
  if (workingId) signals.workingServiceIds = reading([workingId])

  const outcome = resolveOutcome(goal, signals)
  const suggested = suggestTier({ priceRange: '$$', primaryGoal: 'fill slow nights', hasList: true })
  const { mix } = brainRankedMix(goal, tier, signals)

  const byId = new Map(all.map((p) => [p.serviceId, p]))
  const stageTitle = (stage: string) => SYSTEM_STAGES[goal].find((s) => s.stage === stage)?.title ?? stage
  const connected = new Set(['email', 'social', 'gbp'])
  const gatedChannel = (ch: string) => ch === 'sms' || ch === 'ads'

  const live: PlanLine[] = []
  const unlock: PlanLine[] = []
  mix.forEach((id, i) => {
    const p = byId.get(id)!
    const needsChannel = gatedChannel(p.track.channel) && !connected.has(p.track.channel)
    const reason =
      id === workingId ? "You've run this before and it worked."
      : i === 0 ? `Leads your plan: the biggest expected lift on ${outcome.metric}.`
      : undefined
    const line: PlanLine = { serviceId: id, title: p.role, stageTitle: stageTitle(p.stage), status: needsChannel ? 'connect' : 'ready', reason }
    ;(needsChannel ? unlock : live).push(line)
  })

  // Higher-tier plays show as budget unlocks.
  const seen = new Set([...live, ...unlock].map((l) => l.serviceId))
  for (const p of all) {
    if (TIER_RANK[p.minTier] > TIER_RANK[tier] && !seen.has(p.serviceId)) {
      unlock.push({ serviceId: p.serviceId, title: p.role, stageTitle: stageTitle(p.stage), status: 'budget' })
      seen.add(p.serviceId)
    }
  }
  // One coming-soon, to show the honest "we don't service it yet" tag.
  unlock.push({ serviceId: 'demo-whatsapp', title: 'WhatsApp broadcast to your list', stageTitle: 'Activate your people', status: 'soon' })

  const vm: BrainPlanVM = {
    outcomeLabel: outcome.label,
    tierLabel: suggested.tier.charAt(0).toUpperCase() + suggested.tier.slice(1),
    tierReason: suggested.reason,
    live,
    unlock,
  }

  return (
    <div className="min-h-screen bg-bg-2">
      <BrainPlanView vm={vm} defaultOpen />
    </div>
  )
}
