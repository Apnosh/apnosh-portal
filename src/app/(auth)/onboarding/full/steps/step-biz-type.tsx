'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, BIZ_TYPES } from '../data'
import { Question, OptionCard, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepBizType({ data, update, nav }: Props) {
  return (
    <>
      <Question title="What kind of business is it?" subtitle="Pick the closest match" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 mt-4 mb-2">
        {BIZ_TYPES.map((b) => (
          <OptionCard
            key={b}
            selected={data.biz_type === b}
            onClick={() => update('biz_type', b)}
          >
            <div
              className="text-[13px] font-medium"
              style={{ color: data.biz_type === b ? '#0f6e56' : '#111' }}
            >
              {b}
            </div>
          </OptionCard>
        ))}
      </div>
      {data.biz_type === 'Other' && (
        <div className="mt-3">
          <Input
            value={data.biz_other}
            onChange={(v) => update('biz_other', v)}
            placeholder="Tell us what kind"
          />
        </div>
      )}
      {nav}
    </>
  )
}
