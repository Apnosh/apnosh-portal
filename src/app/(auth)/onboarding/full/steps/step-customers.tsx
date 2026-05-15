'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, CUSTOMER_TYPES } from '../data'
import { Question, ChipGroup } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepCustomers({ data, update, nav }: Props) {
  function toggle(val: string) {
    const arr = [...data.customer_types]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('customer_types', arr)
  }

  return (
    <>
      <Question title="Who are your ideal customers?" subtitle="Pick the types you want more of" />
      <div className="mt-4">
        <ChipGroup options={CUSTOMER_TYPES} selected={data.customer_types} onToggle={toggle} />
      </div>
      {nav}
    </>
  )
}
