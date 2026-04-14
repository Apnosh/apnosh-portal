'use client'

import { type ReactNode } from 'react'
import { type OnboardingData } from '../data'
import { Question, Input, FieldLabel } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepBizName({ data, update, nav }: Props) {
  return (
    <>
      <Question title="What's your business called?" subtitle="The official name" />
      <div className="mt-4 space-y-4">
        <Input
          value={data.biz_name}
          onChange={(v) => update('biz_name', v)}
          placeholder="e.g. The Golden Spoon"
          autoFocus
        />
        <div>
          <FieldLabel>Website URL</FieldLabel>
          <Input
            value={data.website}
            onChange={(v) => update('website', v)}
            placeholder="https://yourbusiness.com"
            type="url"
          />
        </div>
        <div>
          <FieldLabel>Phone number</FieldLabel>
          <Input
            value={data.phone}
            onChange={(v) => update('phone', v)}
            placeholder="(555) 123-4567"
            type="tel"
          />
        </div>
      </div>
      {nav}
    </>
  )
}
