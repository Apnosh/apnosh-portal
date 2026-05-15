'use client'

import { type ReactNode } from 'react'
import { type OnboardingData } from '../data'
import { Question, TextArea, FieldLabel, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepStory({ data, update, nav }: Props) {
  return (
    <>
      <Question title="Tell us about your business" subtitle="A couple sentences — like you'd explain it to a friend" />
      <div className="mt-4 space-y-5">
        <TextArea
          value={data.biz_desc}
          onChange={(v) => update('biz_desc', v)}
          placeholder="e.g. We're a family-owned Korean BBQ spot where groups grill at the table. Known for our AYCE experience and lively atmosphere."
        />
        <div>
          <FieldLabel>What makes you stand out?</FieldLabel>
          <TextArea
            value={data.unique}
            onChange={(v) => update('unique', v)}
            placeholder="Your secret sauce — quality, story, approach... The more we know, the better your content will be."
            rows={3}
          />
        </div>
        <div>
          <FieldLabel>Biggest competitors?</FieldLabel>
          <Input
            value={data.competitors}
            onChange={(v) => update('competitors', v)}
            placeholder="Names of businesses you compete with locally"
          />
        </div>
      </div>
      {nav}
    </>
  )
}
