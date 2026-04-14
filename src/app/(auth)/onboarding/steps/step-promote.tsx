'use client'

import { type ReactNode } from 'react'
import { type OnboardingData } from '../data'
import { Question, TextArea, FieldLabel, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepPromote({ data, update, nav }: Props) {
  return (
    <>
      <Question title="What should we highlight most?" subtitle="The stuff you want people to know about or order" />
      <div className="mt-4 space-y-4">
        <TextArea
          value={data.main_offerings}
          onChange={(v) => update('main_offerings', v)}
          placeholder="e.g. Our AYCE experience, signature cocktails, weekend brunch special, group dining packages..."
        />
        <div>
          <FieldLabel>Anything coming up soon?</FieldLabel>
          <Input
            value={data.upcoming}
            onChange={(v) => update('upcoming', v)}
            placeholder="Grand opening, seasonal promo, new product, event..."
          />
        </div>
      </div>
      {nav}
    </>
  )
}
