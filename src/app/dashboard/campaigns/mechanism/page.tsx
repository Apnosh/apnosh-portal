/**
 * /dashboard/campaigns/mechanism — the offer-first plan screen, live so it can be judged by clicking
 * rather than by reading a screenshot.
 *
 * Query params drive it, because the interesting question is not "does it render" but "does it say
 * something different, and something true, as the inputs change":
 *
 *   ?goal=opening&shape=date              which rules are even offered
 *   &footfall=300                         partial: some reach for free, a gap left to cover
 *   &footfall=2200                        enough: it should tell them not to buy reach at all
 *   (no footfall)                         it should admit we have not asked
 *
 * Not linked from anywhere on purpose. It is a second opinion sitting beside the composed plan at
 * /dashboard/campaigns/monthly-plan, not a replacement, until that call is made deliberately.
 *
 * /dashboard/campaigns is already in MVP_PREFIX, so the layout adds no chrome.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import MechanismPlan from '@/components/campaigns/monthly/mechanism-plan'
import { SITUATIONS } from '@/lib/campaigns/data/plan-goals'
import type { CampaignShape } from '@/lib/campaigns/data/plan-goals'

export const metadata = { title: 'Plan, offer first' }

export default async function MechanismPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const q = await searchParams
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]) as string | undefined

  const goal = one('goal') ?? 'opening'
  // The situation table owns which shape a goal implies, so a bad combination is not reachable here.
  const shape = (one('shape') as CampaignShape | undefined) ?? SITUATIONS.find((x) => x.goal === goal)?.shape ?? 'date'
  const raw = Number(one('footfall'))
  const footfall = Number.isFinite(raw) && raw > 0 ? raw : undefined

  return (
    <MvpShell
      active="campaigns"
      header={
        <MvpDetailHeader
          title="Plan, offer first"
          subtitle={footfall ? `${footfall.toLocaleString('en-US')} people a day past your places` : 'Footfall not given'}
          backHref="/dashboard/campaigns"
          backLabel="Campaigns"
        />
      }
    >
      <MechanismPlan goals={[goal]} shape={shape} dailyFootfall={footfall} />
    </MvpShell>
  )
}
