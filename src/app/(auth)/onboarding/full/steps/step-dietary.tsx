'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, DIETARY_CHIPS } from '../data'
import { Question, ChipGroup, Hint } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepDietary({ data, update, nav }: Props) {
  function toggle(val: string) {
    const arr = [...data.dietary_options]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('dietary_options', arr)
  }

  return (
    <>
      <Question
        title="Any dietary options you offer?"
        subtitle="Optional. Pick any that apply."
      />
      <div className="mt-4">
        <ChipGroup options={DIETARY_CHIPS} selected={data.dietary_options} onToggle={toggle} />
      </div>
      <Hint>We&apos;ll call these out when they fit, so the right diners notice you.</Hint>
      {nav}
    </>
  )
}
