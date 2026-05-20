'use client'

import { useState } from 'react'
import { saveBusinessInfo, type SaveResult } from '../actions'
import { EditorHeader, SaveBar, SuccessScreen } from '../editor-shell'
import type { WeeklyHours, DayKey } from '@/lib/gbp-listing'

const DAYS: { key: DayKey; short: string; label: string }[] = [
  { key: 'mon', short: 'Mon', label: 'Monday' },
  { key: 'tue', short: 'Tue', label: 'Tuesday' },
  { key: 'wed', short: 'Wed', label: 'Wednesday' },
  { key: 'thu', short: 'Thu', label: 'Thursday' },
  { key: 'fri', short: 'Fri', label: 'Friday' },
  { key: 'sat', short: 'Sat', label: 'Saturday' },
  { key: 'sun', short: 'Sun', label: 'Sunday' },
]
const EMPTY: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }

export default function HoursEditor({ initialHours }: { initialHours: WeeklyHours | null }) {
  const [hours, setHours] = useState<WeeklyHours>(initialHours ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const isOpen = (d: DayKey) => (hours[d]?.length ?? 0) > 0
  const open = (d: DayKey) => hours[d]?.[0]?.open ?? '09:00'
  const close = (d: DayKey) => hours[d]?.[0]?.close ?? '17:00'
  const toggle = (d: DayKey) => setHours(p => ({ ...p, [d]: isOpen(d) ? [] : [{ open: '09:00', close: '17:00' }] }))
  const setTime = (d: DayKey, f: 'open' | 'close', v: string) =>
    setHours(p => { const e = p[d]?.[0] ?? { open: '09:00', close: '17:00' }; return { ...p, [d]: [{ ...e, [f]: v }] } })
  const copyMon = () => {
    const m = hours.mon?.[0]; if (!m) return
    setHours(p => ({ ...p, tue: [{ ...m }], wed: [{ ...m }], thu: [{ ...m }], fri: [{ ...m }] }))
  }

  const onSave = () => { setSaving(true); saveBusinessInfo({ hours }).then(setResult).finally(() => setSaving(false)) }

  if (result?.synced.saved) return <SuccessScreen result={result} onEditAgain={() => setResult(null)} />

  return (
    <div className="max-w-lg mx-auto pb-tabbar lg:pb-8 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      <EditorHeader title="Hours" subtitle="Your regular weekly hours" />
      <div className="px-4 py-5">
        <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
          {DAYS.map(d => {
            const on = isOpen(d.key)
            return (
              <div key={d.key} className="flex items-center gap-2 px-3.5 py-2.5 min-h-[52px]">
                <span className="w-9 text-[13px] font-semibold text-ink">{d.short}</span>
                <button
                  onClick={() => toggle(d.key)}
                  className={['relative w-11 h-6 rounded-full transition-colors flex-shrink-0', on ? 'bg-brand' : 'bg-ink-6'].join(' ')}
                  aria-pressed={on} aria-label={`${d.label} ${on ? 'open' : 'closed'}`}
                >
                  <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
                </button>
                {on ? (
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <input type="time" value={open(d.key)} onChange={e => setTime(d.key, 'open', e.target.value)} className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
                    <span className="text-ink-4 text-[12px]">to</span>
                    <input type="time" value={close(d.key)} onChange={e => setTime(d.key, 'close', e.target.value)} className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
                  </div>
                ) : <span className="flex-1 text-right text-[13px] text-ink-4">Closed</span>}
              </div>
            )
          })}
        </div>
        {isOpen('mon') && <button onClick={copyMon} className="text-[12px] font-semibold text-brand-dark active:text-brand mt-2">Copy Monday to all weekdays</button>}
      </div>
      <SaveBar saving={saving} onSave={onSave} />
    </div>
  )
}
