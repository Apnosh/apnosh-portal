'use client'

/**
 * "Business type" — its own screen, first of the about-you questions, because
 * everything after it depends on the answer (a restaurant gets cuisine and
 * vibe; a salon does not). Tapping a type advances on its own; "Other" opens
 * a field and waits. Google often pre-picks this from the listing.
 */

import { type ReactNode } from 'react'
import { Store } from 'lucide-react'
import { type OnboardingData, BIZ_TYPES } from '../data'
import { Question, OptionCard, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
  /** Reports the single-choice answer so the wizard can advance after a short beat. */
  onAnswered?: () => void
}

export default function StepBizType({ data, update, nav, onAnswered }: Props) {
  return (
    <>
      <Question title="Business type" icon={<Store size={26} strokeWidth={2} />} />
      <div className="flex flex-col gap-2 mt-6 mb-2">
        {BIZ_TYPES.map((b) => (
          <OptionCard
            key={b}
            selected={data.biz_type === b}
            onClick={() => {
              update('biz_type', b)
              if (b !== 'Other') onAnswered?.()
            }}
            className="min-h-[52px]"
          >
            <div className="flex items-center">
              <div className="text-[15px] font-semibold" style={{ color: data.biz_type === b ? '#0f6e56' : '#1d1d1f' }}>
                {b}
              </div>
            </div>
          </OptionCard>
        ))}
      </div>
      {data.biz_type === 'Other' && (
        <div className="mt-3">
          <Input value={data.biz_other} onChange={(v) => update('biz_other', v)} placeholder="Tell us what kind" />
        </div>
      )}
      {nav}
    </>
  )
}
