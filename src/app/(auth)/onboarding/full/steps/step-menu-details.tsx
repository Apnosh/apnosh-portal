'use client'

import { type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { type OnboardingData, DIETARY_CHIPS } from '../data'
import { Question, Input, ChipGroup, FieldLabel } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 5

// Combined menu-details screen: signature dishes (required) + dietary options.
export default function StepMenuDetails({ data, update, nav }: Props) {
  // Always render one empty row at the end (up to MAX) so there's somewhere to type.
  const items = data.signature_items.length ? data.signature_items : ['']
  const rows = items.length < MAX ? [...items, ''] : items

  function setItem(idx: number, value: string) {
    const next = [...items]
    next[idx] = value
    while (next.length > 1 && next[next.length - 1].trim() === '') next.pop()
    update('signature_items', next)
  }

  function toggleDietary(val: string) {
    const arr = [...data.dietary_options]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('dietary_options', arr)
  }

  return (
    <>
      <Question title="What are you known for?" icon={<Star size={26} strokeWidth={2} />} />

      <div className="mt-5">
        <FieldLabel>Signature dishes (3 to 5)</FieldLabel>
        <div className="flex flex-col gap-2">
          {rows.slice(0, MAX).map((val, idx) => (
            <Input
              key={idx}
              value={val}
              onChange={(v) => setItem(idx, v)}
              placeholder={idx === 0 ? 'Birria tacos' : 'Add another'}
              autoFocus={idx === 0 && !val}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <FieldLabel>Dietary options you offer (optional)</FieldLabel>
        <ChipGroup options={DIETARY_CHIPS} selected={data.dietary_options} onToggle={toggleDietary} />
      </div>
      {nav}
    </>
  )
}
