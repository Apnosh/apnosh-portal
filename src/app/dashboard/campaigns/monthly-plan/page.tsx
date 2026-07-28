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
import { getPlanInputs, getMonthlySignals } from '@/lib/dashboard/get-plan-inputs'

/* Named "New campaign", not "monthly marketing plan". The screen builds a grand opening, a concert
 * night, a run of a new dish — none of which are monthly and none of which are a plan in the sense
 * that phrase implies. The old title told the owner the answer before they had described the
 * question, and quietly ruled out most of what they actually come here to do. */
export const metadata = { title: 'New campaign' }

export default async function MonthlyPlanPage() {
  // The brain is consulted once, here; the flow recomposes client-side against this snapshot.
  // signals is undefined on thin data (the safe route) and the composer runs exactly as before.
  const [inputs, signals] = await Promise.all([getPlanInputs(), getMonthlySignals()])

  return (
    <MvpShell
      active="campaigns"
      header={
        <MvpDetailHeader
          title="New campaign"
          subtitle={inputs ? 'Built from what we already know' : 'Setup needed'}
          backHref="/dashboard/campaigns"
          backLabel="Campaigns"
        />
      }
    >
      {inputs ? (
        <MonthlyPlanFlow inputs={inputs} signals={signals} />
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
