'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, SERVICE_STYLES } from '../data'
import { Question, ChipGroup } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepServiceStyle({ data, update, nav }: Props) {
  function toggle(val: string) {
    const arr = [...data.service_styles]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('service_styles', arr)
  }

  return (
    <>
      <Question title="What's your service style?" subtitle="Pick all that apply" />
      <div className="mt-4">
        <ChipGroup options={SERVICE_STYLES} selected={data.service_styles} onToggle={toggle} />
      </div>
      {nav}
    </>
  )
}
