'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, RESERVATIONS, DELIVERY } from '../data'
import { Question, SingleChipGroup, ChipGroup, FieldLabel, Hint } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepOrdering({ data, update, nav }: Props) {
  function toggleDelivery(val: string) {
    const arr = [...data.delivery_platforms]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('delivery_platforms', arr)
  }

  return (
    <>
      <Question
        title="How do people book and order?"
        subtitle="Optional. Helps us point diners the right way."
      />
      <div className="mt-4">
        <FieldLabel>Reservations</FieldLabel>
        <SingleChipGroup
          options={RESERVATIONS}
          selected={data.reservations_platform}
          onSelect={(val) => update('reservations_platform', val)}
        />
      </div>
      <div className="mt-5">
        <FieldLabel>Delivery & online ordering</FieldLabel>
        <ChipGroup
          options={DELIVERY}
          selected={data.delivery_platforms}
          onToggle={toggleDelivery}
        />
      </div>
      <Hint>We&apos;ll add the right links to posts so orders and bookings are one tap away.</Hint>
      {nav}
    </>
  )
}
