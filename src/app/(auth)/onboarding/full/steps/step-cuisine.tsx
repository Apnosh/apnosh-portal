'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, CUISINES } from '../data'
import { Question, OptionCard, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepCuisine({ data, update, nav }: Props) {
  return (
    <>
      <Question title="What cuisine do you serve?" subtitle="Pick your primary cuisine" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 mt-4 mb-2">
        {CUISINES.map((c) => (
          <OptionCard
            key={c}
            selected={data.cuisine === c}
            onClick={() => update('cuisine', c)}
          >
            <div
              className="text-[13px] font-medium"
              style={{ color: data.cuisine === c ? '#0f6e56' : '#111' }}
            >
              {c}
            </div>
          </OptionCard>
        ))}
      </div>
      {data.cuisine === 'Other' && (
        <div className="mt-3">
          <Input
            value={data.cuisine_other}
            onChange={(v) => update('cuisine_other', v)}
            placeholder="e.g. Hawaiian poke, Ethiopian"
          />
        </div>
      )}
      {nav}
    </>
  )
}
