'use client'

import { type ReactNode, useState } from 'react'
import { type OnboardingData, CONTENT_CHIPS } from '../data'
import { Question, ChipGroup, Input } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepContent({ data, update, nav }: Props) {
  const [showMore, setShowMore] = useState(!!data.ref_accounts)

  function toggle(val: string) {
    const arr = [...data.content_likes]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('content_likes', arr)
  }

  return (
    <>
      <Question title="What kind of content appeals to you?" subtitle="Pick all that sound right for your brand" />
      <div className="mt-4">
        <ChipGroup options={CONTENT_CHIPS} selected={data.content_likes} onToggle={toggle} />
        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className="text-[13px] font-medium mt-3 inline-block"
          style={{ color: '#4abd98' }}
        >
          + Any accounts you admire?
        </button>
        {showMore && (
          <div className="mt-4">
            <Input
              value={data.ref_accounts}
              onChange={(v) => update('ref_accounts', v)}
              placeholder="Instagram handles or business names"
            />
          </div>
        )}
      </div>
      {nav}
    </>
  )
}
