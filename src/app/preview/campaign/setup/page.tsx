/**
 * /preview/campaign/setup — screens 1 and 3, on the real MonthlyPlanFlow.
 *
 * Identical to /dashboard/campaigns/monthly-plan except for where `inputs` comes from: there it is
 * getPlanInputs() reading the database, here it is a hand-written constant. Everything the owner
 * sees is produced by the same component, so anything wrong here is wrong in production too.
 *
 * ONE THING GENUINELY DIFFERS. The final button calls startMonthlyPlan, a server action that needs a
 * session, so it will fail at the end of the flow. That is the correct failure — a preview must not
 * be able to write campaigns — and the banner below says so rather than letting it look like a bug.
 */

import Link from 'next/link'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import MonthlyPlanFlow from '@/components/campaigns/monthly/monthly-plan-flow'
import { PREVIEW_INPUTS } from '@/lib/campaigns/data/preview-fixture'

export const metadata = { title: 'Setup, preview' }

export default function PreviewSetupPage() {
  return (
    <MvpShell
      active="campaigns"
      header={
        <MvpDetailHeader
          title="New campaign"
          subtitle="Preview · Yellowbee Market & Cafe"
          backHref="/preview/campaign"
          backLabel="All screens"
        />
      }
    >
      <div style={{ padding: '10px 14px 0' }}>
        <div style={{ background: '#fbf0da', borderRadius: 13, padding: '10px 12px', fontSize: 12, color: '#8a5a0c', lineHeight: 1.45 }}>
          Preview on made-up data. The last button will not work here, because starting a real
          campaign needs a real account. <Link href="/preview/campaign" style={{ color: '#8a5a0c', fontWeight: 640 }}>All screens</Link>
        </div>
      </div>
      <MonthlyPlanFlow inputs={PREVIEW_INPUTS} />
    </MvpShell>
  )
}
