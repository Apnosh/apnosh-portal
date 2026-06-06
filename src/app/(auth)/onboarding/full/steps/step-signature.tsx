'use client'

import { type ReactNode } from 'react'
import { type OnboardingData } from '../data'
import { Question, Input, Hint } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 5

export default function StepSignature({ data, update, nav }: Props) {
  // Always render one empty row at the end (up to MAX) so there's somewhere to type.
  const items = data.signature_items.length ? data.signature_items : ['']
  const rows = items.length < MAX ? [...items, ''] : items

  function setItem(idx: number, value: string) {
    const next = [...items]
    next[idx] = value
    // Drop trailing empties so validation + storage stay clean
    while (next.length > 1 && next[next.length - 1].trim() === '') next.pop()
    update('signature_items', next)
  }

  return (
    <>
      <Question
        title="What are you known for?"
        subtitle="Your signature dishes — the things people come back for"
      />
      <div className="flex flex-col gap-2 mt-4 mb-1">
        {rows.slice(0, MAX).map((val, idx) => (
          <Input
            key={idx}
            value={val}
            onChange={(v) => setItem(idx, v)}
            placeholder={idx === 0 ? 'e.g. Birria tacos' : 'Add another'}
            autoFocus={idx === 0 && !val}
          />
        ))}
      </div>
      <Hint>Name 3–5. These shape every post we write, so the AI sounds like your kitchen.</Hint>
      {nav}
    </>
  )
}
