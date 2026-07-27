/**
 * /preview/campaign/plan — screens 4 through 8, on the real MechanismPlan.
 *
 * The offer picker, the cap, the two stages it implies and the three-number split are one scrolling
 * screen, so they share a route. Query params exist because the interesting question is not whether
 * it renders but whether it says something different, and something true, as the inputs change:
 *
 *   ?footfall=300     partial: some reach for free, a gap left to buy
 *   ?footfall=2200    enough: it should tell them not to buy reach at all
 *   ?footfall=0       we were never told, and it should admit that rather than guess
 *   ?goal=quiet       a different situation, so a different set of rules
 *
 * Defaults come from the fixture, so the plain URL is always the Yellowbee worked example.
 */

import Link from 'next/link'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import MechanismPlan from '@/components/campaigns/monthly/mechanism-plan'
import { SITUATIONS, type CampaignShape } from '@/lib/campaigns/data/plan-goals'
import { PREVIEW_DAILY_FOOTFALL } from '@/lib/campaigns/data/preview-fixture'

export const metadata = { title: 'The plan, preview' }

export default async function PreviewPlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const q = await searchParams
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]) as string | undefined

  const goal = one('goal') ?? 'opening'
  // The situation table owns which shape a goal implies, so a bad pairing is not reachable from a URL.
  const shape = (one('shape') as CampaignShape | undefined) ?? SITUATIONS.find((s) => s.goal === goal)?.shape ?? 'date'

  /* An explicit ?footfall=0 means "pretend we never asked", which is a real state worth looking at.
   * Anything absent falls back to the fixture rather than to undefined, so the default URL is the
   * worked example rather than the empty one. */
  const raw = one('footfall')
  const n = raw === undefined ? PREVIEW_DAILY_FOOTFALL : Number(raw)
  const footfall = Number.isFinite(n) && n > 0 ? n : undefined

  return (
    <MvpShell
      active="campaigns"
      header={
        <MvpDetailHeader
          title="The plan"
          subtitle={footfall ? `Preview · ${footfall.toLocaleString('en-US')} people a day past your places` : 'Preview · footfall not given'}
          backHref="/preview/campaign"
          backLabel="All screens"
        />
      }
    >
      <div style={{ padding: '10px 14px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          ['Not asked', '?footfall=0'],
          ['300 a day', '?footfall=300'],
          ['2,200 a day', '?footfall=2200'],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={`/preview/campaign/plan${href}`}
            style={{
              fontSize: 12, fontWeight: 620, color: '#2e9a78', background: '#eaf7f3',
              padding: '5px 10px', borderRadius: 8, textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </div>
      <MechanismPlan goals={[goal]} shape={shape} dailyFootfall={footfall} />
    </MvpShell>
  )
}
