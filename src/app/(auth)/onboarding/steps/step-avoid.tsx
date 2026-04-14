'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, AVOID_CHIPS } from '../data'
import { Question, ChipGroup } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepAvoid({ data, update, nav }: Props) {
  function toggle(val: string) {
    const arr = [...data.avoid_list]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('avoid_list', arr)
  }

  return (
    <>
      <Question title="Anything to stay away from?" subtitle="Pick anything that doesn't fit your brand" />
      <div className="mt-4">
        <ChipGroup options={AVOID_CHIPS} selected={data.avoid_list} onToggle={toggle} />
      </div>
      {nav}
    </>
  )
}
