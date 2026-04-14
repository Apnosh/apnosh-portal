'use client'

import { type ReactNode, useState } from 'react'
import { type OnboardingData, GOAL_CHIPS } from '../data'
import { Question, SingleChipGroup, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepGoal({ data, update, nav }: Props) {
  const [showMore, setShowMore] = useState(!!data.goal_detail)

  return (
    <>
      <Question title="What's your #1 priority right now?" subtitle="Pick one — this shapes your whole strategy" />
      <div className="mt-4">
        <SingleChipGroup
          options={GOAL_CHIPS}
          selected={data.primary_goal}
          onSelect={(v) => update('primary_goal', v)}
        />
        {!!data.primary_goal && (
          <>
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="text-[13px] font-medium mt-3 inline-block"
              style={{ color: '#4abd98' }}
            >
              + Want to be more specific?
            </button>
            {showMore && (
              <div className="mt-4">
                <Input
                  value={data.goal_detail}
                  onChange={(v) => update('goal_detail', v)}
                  placeholder="e.g. Increase weekday lunch traffic"
                />
              </div>
            )}
          </>
        )}
      </div>
      {nav}
    </>
  )
}
