'use client'

import { type ReactNode } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { type OnboardingData, type MenuDraftItem } from '../data'
import { Question } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

const MAX = 40
const EMPTY: MenuDraftItem = { name: '', price: '', category: '' }

const fieldStyle: React.CSSProperties = {
  border: '1.5px solid #e6e6ea',
  color: '#1d1d1f',
  fontFamily: 'Inter, system-ui, sans-serif',
}

function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#4abd98'
  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(74,189,152,0.18)'
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#e6e6ea'
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
        subtitle="Optional."
        icon={<UtensilsCrossed size={26} strokeWidth={2} />}
      />
      <div className="flex flex-col gap-2 mt-5 mb-1">
        <div className="flex gap-2 px-1">
          <span className="flex-1 text-[11px] font-medium" style={{ color: '#aeaeb2' }}>Item</span>
          <span className="w-20 text-[11px] font-medium" style={{ color: '#aeaeb2' }}>Price</span>
          <span className="w-28 text-[11px] font-medium" style={{ color: '#aeaeb2' }}>Section</span>
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
                className="flex-1 text-[15px] rounded-[12px] px-3.5 py-2.5 outline-none transition-all"
                style={fieldStyle}
                onFocus={focusOn}
                onBlur={focusOff}
              />
              <input
                value={row.price}
                onChange={(e) => setField(idx, 'price', e.target.value)}
                placeholder="$12"
                className="w-20 text-[15px] rounded-[12px] px-3 py-2.5 outline-none transition-all"
                style={fieldStyle}
                onFocus={focusOn}
                onBlur={focusOff}
              />
              <input
                value={row.category}
                onChange={(e) => setField(idx, 'category', e.target.value)}
                placeholder="Tacos"
                className="w-28 text-[15px] rounded-[12px] px-3 py-2.5 outline-none transition-all"
                style={fieldStyle}
                onFocus={focusOn}
                onBlur={focusOff}
              />
              <button
                type="button"
                onClick={() => isReal && removeRow(idx)}
                className="w-6 text-lg leading-none transition-opacity"
                style={{ color: '#c7c7cc', opacity: isReal ? 1 : 0, cursor: isReal ? 'pointer' : 'default' }}
                aria-label="Remove item"
                tabIndex={isReal ? 0 : -1}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      {nav}
    </>
  )
}
