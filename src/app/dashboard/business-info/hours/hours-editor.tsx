'use client'

import { useMemo, useState } from 'react'
import { saveBusinessInfo, type SaveResult } from '../actions'
import { MvpEditorShell, MvpToggle, MvpTimeInput } from '../editor-shell'
import { C } from '@/components/mvp/mvp-detail'
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

  const initialStr = useMemo(() => JSON.stringify(initialHours ?? EMPTY), [initialHours])
  const dirty = JSON.stringify(hours) !== initialStr

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

  return (
    <MvpEditorShell
      title="Weekly hours"
      subtitle="Your regular open hours. Updates Google and your website."
      saving={saving}
      dirty={dirty}
      onSave={onSave}
      result={result}
      onEditAgain={() => setResult(null)}
    >
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        {DAYS.map((d, i) => {
          const on = isOpen(d.key)
          return (
            <div key={d.key}>
              {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 14 }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', minHeight: 56 }}>
                <span style={{ width: 38, fontSize: 14, fontWeight: 600, color: C.ink, flexShrink: 0 }}>{d.short}</span>
                <MvpToggle on={on} onClick={() => toggle(d.key)} label={`${d.label} ${on ? 'open' : 'closed'}`} />
                {on ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                    <MvpTimeInput value={open(d.key)} onChange={v => setTime(d.key, 'open', v)} />
                    <span style={{ fontSize: 12.5, color: C.faint }}>to</span>
                    <MvpTimeInput value={close(d.key)} onChange={v => setTime(d.key, 'close', v)} />
                  </div>
                ) : (
                  <span style={{ flex: 1, textAlign: 'right', fontSize: 14, color: C.faint }}>Closed</span>
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
