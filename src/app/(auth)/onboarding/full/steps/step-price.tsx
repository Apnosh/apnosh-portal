'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, PRICE_TIERS } from '../data'
import { Question, OptionCard } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepPrice({ data, update, nav }: Props) {
  return (
    <>
      <Question title="What's your price point?" subtitle="Helps us match the tone and the deals we suggest" />
      <div className="flex flex-col gap-2 mt-4 mb-2">
        {PRICE_TIERS.map((p) => {
          const selected = data.price_range === p.id
          return (
            <OptionCard key={p.id} selected={selected} onClick={() => update('price_range', p.id)}>
              <div className="flex items-center gap-3">
                <span
                  className="text-lg font-semibold w-12 shrink-0"
                  style={{ fontFamily: 'DM Sans, sans-serif', color: selected ? '#0f6e56' : '#111' }}
                >
                  {p.title}
                </span>
                <span className="text-[13px]" style={{ color: '#777' }}>{p.desc}</span>
              </div>
            </OptionCard>
          )
        })}
      </div>
      {nav}
    </>
  )
}
