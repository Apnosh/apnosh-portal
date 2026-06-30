'use client'

/**
 * DEV-ONLY harness for the campaign plan flow (the Walk). Renders CampaignPlanFlow directly with
 * sample data, so the screen can be reviewed without logging in or walking the builder. Not reachable
 * in production. Switch scenarios with ?s=weak | strong | lowrating.
 *   /preview/plan            weak Google listing → "Get found on Google" leads
 *   /preview/plan?s=strong   strong listing + list → no lead move, full funnel
 *   /preview/plan?s=lowrating low rating → "Turn on review requests" leads
 *
 * The cold-start brain runs for real here: each scenario's signals are turned into BrainSignals,
 * ranked by signalFit (the live within-stage order) and explained by signalFitLead (the "Why this
 * order" headline on the cover) — exactly what the authenticated builder shows.
 */
import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import CampaignPlanFlow from '@/components/campaigns/plan-flow/campaign-plan-flow'
import { emptySignals } from '@/lib/campaigns/brain/signals'
import { reading } from '@/lib/campaigns/brain/readiness'
import { brainRankedMix } from '@/lib/campaigns/brain/rank'
import { planLeadHeadline } from '@/lib/campaigns/builder/compose-plan'
import type { PlanGoal } from '@/lib/campaigns/data/atom-plays'
import type { Tier } from '@/lib/campaigns/data/priced-catalog'

const SCENARIOS: Record<string, Record<string, unknown>> = {
  weak: { who: 'new locals nearby', offer: 'free side with any entree', dish: 'Birria Tacos', neighborhood: 'the Mission', presence: 50, ratingCount: 5 },
  strong: { who: 'new locals nearby', offer: 'free side with any entree', dish: 'Birria Tacos', neighborhood: 'the Mission', list: 'email list', presence: 92, rating: 4.6, ratingCount: 240 },
  lowrating: { who: 'new locals nearby', offer: 'free side with any entree', dish: 'Birria Tacos', neighborhood: 'the Mission', rating: 3.4, ratingCount: 60, presence: 85 },
}
const MENU = [{ l: 'Birria Tacos' }, { l: 'Quesabirria' }, { l: 'Carne Asada Fries' }, { l: 'Elote' }, { l: 'Horchata' }]

const SYSTEM_GOALS = new Set(['firstvisit', 'nights', 'regulars', 'reviews'])

export default function PlanPreviewHarness() {
  if (process.env.NODE_ENV === 'production') notFound()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  const q = new URLSearchParams(window.location.search)
  const key = q.get('s') || 'weak'
  const budget = q.get('b') // lean | standard | aggressive
  const item = q.get('item') || 'firstvisit' // firstvisit | nights | regulars
  const mix = q.get('mix') // comma-joined serviceIds → simulate an AI-chosen mix (spec.aiMix)
  const sc = SCENARIOS[key] ?? SCENARIOS.weak

  // Turn the scenario into the brain's signal set, then run the SAME cold-start ranking + headline
  // the live plan-mix route runs. Only for system goals; other items keep the harness default.
  const tier = ((budget as Tier) || 'standard') as Tier
  const sig = emptySignals()
  if (typeof sc.rating === 'number') sig.rating = reading(sc.rating)
  if (typeof sc.ratingCount === 'number') sig.ratingCount = reading(sc.ratingCount)
  if (typeof sc.presence === 'number') sig.listingCompleteness = reading((sc.presence as number) / 100)
  sig.hasList = reading(sc.list ? true : false)

  let mixArr: string[] = []
  if (SYSTEM_GOALS.has(item)) {
    try { mixArr = brainRankedMix(item as PlanGoal, tier, sig).mix } catch { mixArr = [] }
  }
  const computedMix = mixArr.join(',')
  const lead = q.get('lead') ?? (mixArr.length ? planLeadHeadline(item as PlanGoal, mixArr, sig) : null)
  // nights anchor demo: ?night=Tuesday,Wednesday picks the night; ?night=none shows the pick-your-night gate.
  const nightParam = q.get('night')
  const nightsDays = item === 'nights' ? (nightParam === 'none' ? undefined : nightParam ? nightParam.split(',') : ['Tuesday', 'Wednesday']) : undefined
  const vals = { ...sc, ...(budget ? { budget } : {}), ...(nightsDays ? { days: nightsDays } : {}), ...((mix || computedMix) ? { aiMix: mix || computedMix } : {}) }

  return (
    <CampaignPlanFlow
      itemId={item}
      vals={vals}
      restaurant="La Taqueria"
      menu={MENU}
      monthlyCap={0}
      lead={lead}
      onConfirm={() => window.alert('Confirmed (harness — no save)')}
      onBack={() => window.location.reload()}
    />
  )
}
