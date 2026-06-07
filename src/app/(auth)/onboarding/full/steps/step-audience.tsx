'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, CUSTOMER_TYPES, AGE_RANGES, WHY_CHIPS } from '../data'
import { Question, ChipGroup, SingleChipGroup, FieldLabel } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

// Combined audience screen: who you want + their age + why they choose you.
export default function StepAudience({ data, update, nav }: Props) {
  function toggleType(val: string) {
    const arr = [...data.customer_types]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('customer_types', arr)
  }

  function toggleWhy(val: string) {
    const arr = [...data.why_choose]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('why_choose', arr)
  }

  return (
    <>
      <Question title="Who are you for?" subtitle="The customers you want and why they pick you" />

      <div className="mt-4">
        <FieldLabel>Ideal customers</FieldLabel>
        <ChipGroup options={CUSTOMER_TYPES} selected={data.customer_types} onToggle={toggleType} />
      </div>

      <div className="mt-5">
        <FieldLabel>Roughly how old are they? (optional)</FieldLabel>
        <SingleChipGroup
          options={AGE_RANGES}
          selected={data.customer_age_range}
          onSelect={(v) => update('customer_age_range', v === data.customer_age_range ? '' : v)}
        />
      </div>

      <div className="mt-5">
        <FieldLabel>Why do people choose you? (up to 5)</FieldLabel>
        <ChipGroup options={WHY_CHIPS} selected={data.why_choose} onToggle={toggleWhy} max={5} />
      </div>
      {nav}
    </>
  )
}
