'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, SUCCESS_CHIPS, TIMELINE_CHIPS } from '../data'
import { Question, ChipGroup, SingleChipGroup, FieldLabel } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepSuccess({ data, update, nav }: Props) {
  function toggle(val: string) {
    const arr = [...data.success_signs]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('success_signs', arr)
  }

  return (
    <>
      <Question title="How will you know it's working?" subtitle="Pick everything that would feel like a win" />
      <div className="mt-4">
        <ChipGroup options={SUCCESS_CHIPS} selected={data.success_signs} onToggle={toggle} />
        <div className="mt-5">
          <FieldLabel>How fast do you want results?</FieldLabel>
          <SingleChipGroup
            options={TIMELINE_CHIPS}
            selected={data.timeline}
            onSelect={(v) => update('timeline', v)}
          />
        </div>
      </div>
      {nav}
    </>
  )
}
