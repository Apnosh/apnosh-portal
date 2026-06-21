'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { saveBusinessInfo, type SaveResult } from '../actions'
import { MvpEditorShell, MvpToggle, MvpTimeInput } from '../editor-shell'
import { C } from '@/components/mvp/mvp-detail'
import type { WeeklyHours, DayKey } from '@/lib/gbp-listing'

type Period = { open: string; close: string }
const DEFAULT_PERIOD: Period = { open: '09:00', close: '17:00' }

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]
const EMPTY: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }

export default function HoursEditor({ initialHours }: { initialHours: WeeklyHours | null }) {
  const [hours, setHours] = useState<WeeklyHours>(initialHours ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const initialStr = useMemo(() => JSON.stringify(initialHours ?? EMPTY), [initialHours])
  const dirty = JSON.stringify(hours) !== initialStr

  const periodsOf = (d: DayKey): Period[] => hours[d] ?? []
  const isOpen = (d: DayKey) => periodsOf(d).length > 0
  const toggle = (d: DayKey) => setHours(p => ({ ...p, [d]: isOpen(d) ? [] : [{ ...DEFAULT_PERIOD }] }))
  const addPeriod = (d: DayKey) => setHours(p => ({ ...p, [d]: [...(p[d] ?? []), { ...DEFAULT_PERIOD }] }))
  const removePeriod = (d: DayKey, i: number) => setHours(p => ({ ...p, [d]: (p[d] ?? []).filter((_, idx) => idx !== i) }))
  const setTime = (d: DayKey, i: number, f: 'open' | 'close', v: string) =>
    setHours(p => ({ ...p, [d]: (p[d] ?? []).map((per, idx) => idx === i ? { ...per, [f]: v } : per) }))
  const copyMon = () => {
    const m = hours.mon ?? []
    if (!m.length) return
    const clone = () => m.map(x => ({ ...x }))
    setHours(p => ({ ...p, tue: clone(), wed: clone(), thu: clone(), fri: clone() }))
  }

  const onSave = () => { setSaving(true); saveBusinessInfo({ hours }).then(setResult).finally(() => setSaving(false)) }

  return (
    <MvpEditorShell
      title="Weekly hours"
      subtitle="Your regular hours. Add a second range for a mid-day break. Updates Google and your website."
      saving={saving}
      dirty={dirty}
      onSave={onSave}
      result={result}
      onEditAgain={() => setResult(null)}
    >
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        {DAYS.map((d, i) => {
          const on = isOpen(d.key)
          const periods = periodsOf(d.key)
          return (
            <div key={d.key}>
              {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 14 }} />}
              <div style={{ padding: '11px 14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: C.ink }}>{d.label}</span>
                  {!on && <span style={{ fontSize: 13.5, color: C.faint }}>Closed</span>}
                  <MvpToggle on={on} onClick={() => toggle(d.key)} label={`${d.label} ${on ? 'open' : 'closed'}`} />
                </div>
                {on && (
                  <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {periods.map((per, pi) => (
                      <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MvpTimeInput value={per.open} onChange={v => setTime(d.key, pi, 'open', v)} />
                        <span style={{ fontSize: 12.5, color: C.faint }}>to</span>
                        <MvpTimeInput value={per.close} onChange={v => setTime(d.key, pi, 'close', v)} />
                        {periods.length > 1 && (
                          <button type="button" onClick={() => removePeriod(d.key, pi)} aria-label="Remove time range" style={{ width: 30, height: 30, borderRadius: '50%', background: '#f3f3f5', color: C.mute, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginLeft: 'auto' }}>
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => addPeriod(d.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', background: 'none', border: 'none', color: C.greenDk, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '2px 0' }}>
                      <Plus size={14} /> Add hours
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {isOpen('mon') && (
        <button type="button" onClick={copyMon} style={{ marginTop: 12, marginLeft: 4, background: 'none', border: 'none', color: C.greenDk, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '4px 2px' }}>
          Copy Monday to all weekdays
        </button>
      )}
    </MvpEditorShell>
  )
}
