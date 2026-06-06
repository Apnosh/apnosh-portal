'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, TONE_CHIPS, EMOJI_LEVELS } from '../data'
import { Question, ChipGroup, FieldLabel, Input, OptionCard } from '../ui'

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

  function toggleAvoid(val: string) {
    const arr = [...data.avoid_tones]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('avoid_tones', arr)
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

        <div className="mt-5">
          <FieldLabel>Anything to steer away from? (optional)</FieldLabel>
          <ChipGroup options={TONE_CHIPS} selected={data.avoid_tones} onToggle={toggleAvoid} />
        </div>

        <div className="mt-5">
          <FieldLabel>How do you feel about emojis?</FieldLabel>
          <div className="flex flex-col gap-2">
            {EMOJI_LEVELS.map((e) => {
              const selected = data.emoji_usage === e.id
              return (
                <OptionCard key={e.id} selected={selected} onClick={() => update('emoji_usage', e.id)}>
                  <div className="text-[13px] font-medium" style={{ color: selected ? '#0f6e56' : '#111' }}>
                    {e.title}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#999' }}>{e.desc}</div>
                </OptionCard>
              )
            })}
          </div>
        </div>
      </div>
      {nav}
    </>
  )
}
