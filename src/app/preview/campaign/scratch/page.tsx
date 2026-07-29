'use client'

/**
 * /preview/campaign/scratch — the REAL design-from-scratch flow (setup questions → the plan) on
 * fixture inputs, no login, for Strategist's Desk verification. The describe API needs a session,
 * so the read falls back to the local matcher — which is the flow's own honest degraded path.
 * Starting the plan needs a real account and fails honestly.
 */
import MonthlyPlanFlow from '@/components/campaigns/monthly/monthly-plan-flow'
import type { PlanInputs } from '@/lib/campaigns/data/plan-inputs'

const known = <T,>(value: T, label?: string) => ({ value, source: 'onboarding', label }) as never
const missing = { value: null, source: 'missing' } as never

const INPUTS = {
  goal: known('new-customers', 'More new people'),
  goalWords: known('More first-time guests'),
  budget: missing,
  knownFor: known(['Spicy Chicken Sandwich']),
  standsOut: missing,
  audience: known(['Families with kids']),
  slowDays: missing,
  channels: [],
  menu: [
    { id: 'm1', name: 'Spicy Chicken Sandwich', featured: true },
    { id: 'm2', name: 'Honey Butter Biscuit', featured: false },
    { id: 'm3', name: 'Market Bowl', featured: false },
  ],
} as unknown as PlanInputs

export default function PreviewScratchPage() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', overflowY: 'auto', background: '#F7F5F0' }}>
        <MonthlyPlanFlow inputs={INPUTS} />
      </div>
    </div>
  )
}
