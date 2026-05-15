'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, WHY_CHIPS } from '../data'
import { Question, ChipGroup } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepWhyYou({ data, update, nav }: Props) {
  function toggle(val: string) {
    const arr = [...data.why_choose]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('why_choose', arr)
  }

  return (
    <>
      <Question title="Why do people choose you?" subtitle="Pick your top reasons — up to 5" />
      <div className="mt-4">
        <ChipGroup options={WHY_CHIPS} selected={data.why_choose} onToggle={toggle} max={5} />
      </div>
      {nav}
    </>
  )
}
