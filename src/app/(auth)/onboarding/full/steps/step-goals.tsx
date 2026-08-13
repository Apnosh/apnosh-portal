'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, GOAL_CHIPS } from '../data'
import { Question, ChipGroup } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 3

/**
 * ONE question: pick your top three.
 *
 * This screen used to ask four things — the #1 priority, how you would know it was working,
 * how fast you wanted results, and a monthly budget. On a phone that is a wall of chips at the
 * exact point someone is nearly done and least patient, and three of the four were shaping
 * almost nothing a plan could not infer later. The owner asked for the simple version
 * (2026-08-13), and simple is also more honest: we ask for what we actually steer on.
 *
 * The data contract downstream is unchanged. primary_goal is still the first pick (ten files
 * read it), and the runners-up ride along in goal_detail, which already feeds the planner's
 * prompt as free text. No migration, nothing to re-map.
 *
 * Budget still exists as a field and still guards the store; it is simply no longer ASKED here.
 * A client with no number set gets no ceiling until they set one, which the dashboard offers.
 */
export default function StepGoals({ data, update, nav }: Props) {
  const picked = data.top_goals.length ? data.top_goals : (data.primary_goal ? [data.primary_goal] : [])
  const full = picked.length >= MAX

  function toggle(val: string) {
    const next = picked.includes(val)
      ? picked.filter((g) => g !== val)
      : full ? picked            /* already at three: ignore rather than silently swap one out */
      : [...picked, val]
    update('top_goals', next)
    /* Keep the old contract alive: first pick is THE goal, the rest are context. */
    update('primary_goal', next[0] ?? '')
    update('goal_detail', next.slice(1).join(', '))
  }

  return (
    <>
      <Question
        title="What matters most right now?"
        subtitle="Pick up to three. We build your plan around them."
      />

      <div className="mt-4">
        <ChipGroup options={GOAL_CHIPS} selected={picked} onToggle={toggle} />
      </div>

      <div className="mt-3 text-[12px]" style={{ color: '#9aa1ab' }}>
        {picked.length === 0
          ? 'Not sure? Skip it. We will suggest a starting point.'
          : full
            ? 'Three is the limit. Tap one to swap it out.'
            : `${picked.length} of ${MAX} picked. Add another, or keep going.`}
      </div>

      {nav}
    </>
  )
}
