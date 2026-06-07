'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, type MenuDraftItem } from '../data'
import { Question, Hint } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 40
const EMPTY: MenuDraftItem = { name: '', price: '', category: '' }

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

export default function StepMenu({ data, update, nav }: Props) {
  const items = data.menu_items.length ? data.menu_items : []
  // Always show one empty row to type into (until MAX).
  const showTrailing = items.length < MAX && (items.length === 0 || items[items.length - 1].name.trim() !== '')
  const rows = showTrailing ? [...items, { ...EMPTY }] : [...items]

  function setField(idx: number, field: keyof MenuDraftItem, value: string) {
    const next = rows.map((r) => ({ ...r }))
    next[idx] = { ...next[idx], [field]: value }
    // Drop trailing rows that have no name so storage stays clean.
    while (next.length > 0 && next[next.length - 1].name.trim() === '' &&
           next[next.length - 1].price.trim() === '' && next[next.length - 1].category.trim() === '') {
      next.pop()
    }
    update('menu_items', next)
  }

  function removeRow(idx: number) {
    const next = rows.filter((_, i) => i !== idx).filter((r) => r.name.trim() !== '' || r.price.trim() !== '' || r.category.trim() !== '')
    update('menu_items', next)
  }

  return (
    <>
      <Question
        title="What's on your menu?"
        subtitle="Optional, but powerful. Real dishes make every post specific."
      />
      <div className="flex flex-col gap-2 mt-4 mb-1">
        <div className="flex gap-2 px-1">
          <span className="flex-1 text-[11px] font-medium" style={{ color: '#aaa' }}>Item</span>
          <span className="w-20 text-[11px] font-medium" style={{ color: '#aaa' }}>Price</span>
          <span className="w-28 text-[11px] font-medium" style={{ color: '#aaa' }}>Section</span>
          <span className="w-6" />
        </div>
        {rows.slice(0, MAX).map((row, idx) => {
          const isReal = row.name.trim() !== '' || row.price.trim() !== '' || row.category.trim() !== ''
          return (
            <div key={idx} className="flex gap-2 items-center">
              <input
                value={row.name}
                onChange={(e) => setField(idx, 'name', e.target.value)}
                placeholder={idx === 0 ? 'e.g. Birria tacos' : 'Add item'}
                className="flex-1 text-[15px] rounded-[10px] px-3.5 py-2.5 outline-none transition-all"
                style={fieldStyle}
                onFocus={focusOn}
                onBlur={focusOff}
              />
              <input
                value={row.price}
                onChange={(e) => setField(idx, 'price', e.target.value)}
                placeholder="$12"
                className="w-20 text-[15px] rounded-[10px] px-3 py-2.5 outline-none transition-all"
                style={fieldStyle}
                onFocus={focusOn}
                onBlur={focusOff}
              />
              <input
                value={row.category}
                onChange={(e) => setField(idx, 'category', e.target.value)}
                placeholder="Tacos"
                className="w-28 text-[15px] rounded-[10px] px-3 py-2.5 outline-none transition-all"
                style={fieldStyle}
                onFocus={focusOn}
                onBlur={focusOff}
              />
              <button
                type="button"
                onClick={() => isReal && removeRow(idx)}
                className="w-6 text-lg leading-none transition-opacity"
                style={{ color: '#ccc', opacity: isReal ? 1 : 0, cursor: isReal ? 'pointer' : 'default' }}
                aria-label="Remove item"
                tabIndex={isReal ? 0 : -1}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <Hint>Even 5–10 items helps. The AI names real dishes instead of guessing &quot;your food.&quot;</Hint>
      {nav}
    </>
  )
}
