/**
 * /dashboard/campaigns/monthly-plan — the first campaign an owner runs.
 *
 * Server component on purpose: everything the form should already know (onboarding answers, live
 * connections, the real menu) is read here and handed down, so the client never has to ask for what
 * we can look up. A static segment, so it wins over [id] in the router.
 *
 * /dashboard/campaigns is already in MVP_PREFIX, so the layout adds no chrome and MvpShell owns the
 * full screen.
 */

import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpEmpty } from '@/components/mvp/mvp-detail'
import MonthlyPlanFlow from '@/components/campaigns/monthly/monthly-plan-flow'
import { getPlanInputs } from '@/lib/dashboard/get-plan-inputs'

export const metadata = { title: 'Create a monthly marketing plan' }

export default async function MonthlyPlanPage() {
  const inputs = await getPlanInputs()

  return (
    <MvpShell
      active="campaigns"
      header={
        <MvpDetailHeader
          title="Your monthly marketing plan"
          subtitle={inputs ? 'Built from what we already know' : 'Setup needed'}
          backHref="/dashboard/campaigns"
          backLabel="Campaigns"
        />
      }
    >
      {inputs ? (
        <MonthlyPlanFlow inputs={inputs} />
      ) : (
        <div style={{ padding: '24px 14px' }}>
          <MvpEmpty
            title="We need your business set up first"
            text="Finish your business setup and we can build a plan from what you tell us, instead of asking it all again here."
          />
        </div>
      )}
    </MvpShell>
  )
}
