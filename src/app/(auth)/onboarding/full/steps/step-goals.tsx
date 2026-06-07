'use client'

import { type ReactNode, useState } from 'react'
import { type OnboardingData, GOAL_CHIPS, SUCCESS_CHIPS, TIMELINE_CHIPS } from '../data'
import { Question, SingleChipGroup, ChipGroup, Input, FieldLabel } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

// Combined goals screen: top priority (required) + optional detail + what
// success looks like + how fast they want it.
export default function StepGoals({ data, update, nav }: Props) {
  const [showMore, setShowMore] = useState(!!data.goal_detail)

  function toggleSuccess(val: string) {
    const arr = [...data.success_signs]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('success_signs', arr)
  }

  return (
    <>
      <Question title="What's your #1 priority right now?" subtitle="This shapes your whole strategy" />

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

      <div className="mt-6">
        <FieldLabel>How will you know it&apos;s working?</FieldLabel>
        <ChipGroup options={SUCCESS_CHIPS} selected={data.success_signs} onToggle={toggleSuccess} />
      </div>

      <div className="mt-5">
        <FieldLabel>How fast do you want results?</FieldLabel>
        <SingleChipGroup
          options={TIMELINE_CHIPS}
          selected={data.timeline}
          onSelect={(v) => update('timeline', v)}
        />
      </div>
      {nav}
    </>
  )
}
