'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, type SpecialDraft } from '../data'
import { Question, Hint } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 12
const EMPTY: SpecialDraft = { title: '', time_window: '', details: '' }

const fieldStyle: React.CSSProperties = {
  border: '1.5px solid #e0e0e0',
  color: '#111',
  fontFamily: 'DM Sans, sans-serif',
}

function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#4abd98'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,189,152,0.1)'
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#e0e0e0'
  e.currentTarget.style.boxShadow = 'none'
}

function isEmpty(s: SpecialDraft) {
  return s.title.trim() === '' && s.time_window.trim() === '' && s.details.trim() === ''
}

export default function StepSpecials({ data, update, nav }: Props) {
  const items = data.specials.length ? data.specials : []
  const showTrailing = items.length < MAX && (items.length === 0 || items[items.length - 1].title.trim() !== '')
  const rows = showTrailing ? [...items, { ...EMPTY }] : [...items]

  function setField(idx: number, field: keyof SpecialDraft, value: string) {
    const next = rows.map((r) => ({ ...r }))
    next[idx] = { ...next[idx], [field]: value }
    while (next.length > 0 && isEmpty(next[next.length - 1])) next.pop()
    update('specials', next)
  }

  function removeRow(idx: number) {
    const next = rows.filter((_, i) => i !== idx).filter((r) => !isEmpty(r))
    update('specials', next)
  }

  return (
    <>
      <Question
        title="Any recurring specials or deals?"
        subtitle="Optional — happy hours, taco Tuesdays, brunch combos"
      />
      <div className="flex flex-col gap-3 mt-4 mb-1">
        {rows.slice(0, MAX).map((row, idx) => {
          const real = !isEmpty(row)
          return (
            <div
              key={idx}
              className="rounded-[12px] p-3 flex flex-col gap-2"
              style={{ border: '1.5px solid #f0f0f0', background: real ? '#fbfdfc' : 'white' }}
            >
              <div className="flex gap-2 items-center">
                <input
                  value={row.title}
                  onChange={(e) => setField(idx, 'title', e.target.value)}
                  placeholder={idx === 0 ? 'e.g. Happy Hour' : 'Add a special'}
                  className="flex-1 text-[15px] font-medium rounded-[10px] px-3.5 py-2.5 outline-none transition-all"
                  style={fieldStyle}
                  onFocus={focusOn}
                  onBlur={focusOff}
                />
                <input
                  value={row.time_window}
                  onChange={(e) => setField(idx, 'time_window', e.target.value)}
                  placeholder="3–5pm daily"
                  className="w-32 text-[14px] rounded-[10px] px-3 py-2.5 outline-none transition-all"
                  style={fieldStyle}
                  onFocus={focusOn}
                  onBlur={focusOff}
                />
                <button
                  type="button"
                  onClick={() => real && removeRow(idx)}
                  className="w-6 text-lg leading-none transition-opacity"
                  style={{ color: '#ccc', opacity: real ? 1 : 0, cursor: real ? 'pointer' : 'default' }}
                  aria-label="Remove special"
                  tabIndex={real ? 0 : -1}
                >
                  ×
                </button>
              </div>
              {real && (
                <input
                  value={row.details}
                  onChange={(e) => setField(idx, 'details', e.target.value)}
                  placeholder="What's included or the hook (e.g. $2 off all tacos + $5 margaritas)"
                  className="w-full text-[14px] rounded-[10px] px-3.5 py-2.5 outline-none transition-all"
                  style={fieldStyle}
                  onFocus={focusOn}
                  onBlur={focusOff}
                />
              )}
            </div>
          )
        })}
      </div>
      <Hint>We&apos;ll turn these into recurring promo posts so your deals never get forgotten.</Hint>
      {nav}
    </>
  )
}
