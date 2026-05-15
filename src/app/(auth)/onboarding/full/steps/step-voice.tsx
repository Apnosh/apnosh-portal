'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, TONE_CHIPS } from '../data'
import { Question, ChipGroup, FieldLabel, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepVoice({ data, update, nav }: Props) {
  function toggle(val: string) {
    const arr = [...data.tones]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('tones', arr)
  }

  return (
    <>
      <Question title="How should your brand sound?" subtitle="Pick up to 3, or describe your own" />
      <div className="mt-4">
        <ChipGroup options={TONE_CHIPS} selected={data.tones} onToggle={toggle} max={3} />
        <div className="mt-4">
          <FieldLabel>Or describe it in your own words</FieldLabel>
          <Input
            value={data.custom_tone}
            onChange={(v) => update('custom_tone', v)}
            placeholder="e.g. Witty but never sarcastic, like talking to a cool neighbor"
          />
        </div>
      </div>
      {nav}
    </>
  )
}
