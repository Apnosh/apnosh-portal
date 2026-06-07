'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, CUISINES, SERVICE_STYLES, PRICE_TIERS } from '../data'
import { Question, OptionCard, Input, ChipGroup, FieldLabel } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

// Combined "what you serve" screen: cuisine + service style + price point.
// The lookup often fills cuisine and price already, so for many owners this
// reads as a quick confirm rather than three separate questions.
export default function StepServe({ data, update, nav }: Props) {
  function toggleStyle(val: string) {
    const arr = [...data.service_styles]
    const idx = arr.indexOf(val)
    if (idx > -1) arr.splice(idx, 1)
    else arr.push(val)
    update('service_styles', arr)
  }

  return (
    <>
      <Question title="What you serve" subtitle="Cuisine, style, and price point" />

      {/* Cuisine */}
      <div className="mt-4">
        <FieldLabel>Primary cuisine</FieldLabel>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
          {CUISINES.map((c) => (
            <OptionCard key={c} selected={data.cuisine === c} onClick={() => update('cuisine', c)}>
              <div className="text-[13px] font-medium" style={{ color: data.cuisine === c ? '#0f6e56' : '#111' }}>
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
      </div>

      {/* Service style */}
      <div className="mt-6">
        <FieldLabel>Service style (pick all that apply)</FieldLabel>
        <ChipGroup options={SERVICE_STYLES} selected={data.service_styles} onToggle={toggleStyle} />
      </div>

      {/* Price point */}
      <div className="mt-6">
        <FieldLabel>Price point</FieldLabel>
        <div className="flex flex-col gap-2">
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
      </div>
      {nav}
    </>
  )
}
