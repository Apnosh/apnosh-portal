/**
 * /dashboard/campaigns/slow-nights — the one campaign being taken end to end.
 *
 * A static segment, so it wins over [id] in the router. It lives beside the existing builder rather
 * than inside it on purpose: apnosh-campaign.jsx is 442 KB of working store flow, and proving a new
 * shape does not justify editing it. If this shape is right it generalises to the other goals; until
 * then it changes nothing that already sells.
 *
 * /dashboard/campaigns is already in MVP_PREFIX, so the layout adds no chrome and MvpShell owns the
 * full screen. No layout.tsx edit needed.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import SlowNightsFlow from '@/components/campaigns/slow-nights/slow-nights-flow'

export const metadata = { title: 'Fill your slow nights' }

export default function SlowNightsPage() {
  return (
    <MvpShell
      active="campaigns"
      header={
        <MvpDetailHeader
          title="Fill your slow nights"
          subtitle="Tell us about the night"
          backHref="/dashboard/campaigns"
          backLabel="Campaigns"
        />
      }
    >
      <SlowNightsFlow />
    </MvpShell>
  )
}
