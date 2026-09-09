'use client'

import { type ReactNode } from 'react'
import { ShoppingBag } from 'lucide-react'
import { type OnboardingData, RESERVATIONS, DELIVERY, POS_LABELS } from '../data'
import { Question, SingleChipGroup, ChipGroup, FieldLabel } from '../ui'

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
        subtitle="Optional."
        icon={<ShoppingBag size={26} strokeWidth={2} />}
      />
      <div className="mt-5">
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
      <div className="mt-5">
        {/* Full service is the primary target and Toast owns that segment, but
            Toast only appeared under delivery, so a restaurant running it as its
            register had no way to tell us. The answer decides whether the Orders
            stage offers a Connect action or says plainly that we cannot read this
            register yet, and it is the demand number behind the Toast decision. */}
        <FieldLabel>What you ring sales up on</FieldLabel>
        <SingleChipGroup
          options={POS_LABELS}
          selected={data.pos_system}
          onSelect={(val) => update('pos_system', val === data.pos_system ? '' : val)}
        />
        <p className="mt-1 text-[12px] leading-snug text-neutral-500">
          Square and Clover connect today. The rest we cannot read yet, and we will say so rather than ask you to connect something that will not work.
        </p>
      </div>
      {nav}
    </>
  )
}
