'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, ROLES } from '../data'
import { Question, OptionCard, Badge } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepRole({ data, update, nav }: Props) {
  return (
    <>
      <Question title="Who are you?" subtitle="This helps us tailor your experience" />
      <div className="grid grid-cols-2 gap-2.5 mt-4 mb-2">
        {ROLES.map((r) => (
          <OptionCard
            key={r.id}
            selected={data.role === r.id}
            onClick={() => update('role', r.id)}
            disabled={!!r.disabled}
          >
            {!!r.disabled && <Badge>Soon</Badge>}
            <div className="text-xl mb-1.5">{r.emoji}</div>
            <div
              className="text-sm font-semibold mb-0.5"
              style={{ color: data.role === r.id ? '#0f6e56' : '#111' }}
            >
              {r.title}
            </div>
            <div className="text-xs leading-snug" style={{ color: '#999' }}>
              {r.desc}
            </div>
          </OptionCard>
        ))}
      </div>
      {nav}
    </>
  )
}
