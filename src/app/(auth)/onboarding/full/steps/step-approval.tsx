'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, APPROVAL_TYPES, FILM_CHIPS } from '../data'
import { Question, ChipGroup, FieldLabel, Chip } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepApproval({ data, update, nav }: Props) {
  function toggleFilm(val: string) {
    const arr = [...data.can_film]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('can_film', arr)
  }

  return (
    <>
      <Question title="How hands-on do you want to be?" subtitle="You can always change this later" />
      <div className="mt-4 space-y-2 mb-4">
        {APPROVAL_TYPES.map((a) => {
          const sel = data.approval_type === a.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => update('approval_type', a.id)}
              className="w-full text-left rounded-[10px] px-4 py-4 transition-all select-none"
              style={{
                border: sel ? '2px solid #4abd98' : '1.5px solid #e0e0e0',
                background: sel ? '#f0faf6' : 'white',
              }}
            >
              <div className="text-sm font-semibold mb-0.5" style={{ color: sel ? '#0f6e56' : '#111' }}>
                {a.title}
              </div>
              <div className="text-xs leading-snug" style={{ color: '#999' }}>
                {a.desc}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <FieldLabel>Who can appear on camera?</FieldLabel>
        <ChipGroup options={FILM_CHIPS} selected={data.can_film} onToggle={toggleFilm} />
      </div>

      <div className="flex items-center gap-3 mt-3 mb-2">
        <span className="text-sm" style={{ color: '#111' }}>Can we tag @apnosh?</span>
        <Chip label="Yes" selected={data.can_tag === 'yes'} onClick={() => update('can_tag', 'yes')} />
        <Chip label="No" selected={data.can_tag === 'no'} onClick={() => update('can_tag', 'no')} />
      </div>

      {nav}
    </>
  )
}
