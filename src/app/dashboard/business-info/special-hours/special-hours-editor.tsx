'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { saveBusinessInfo, type SaveResult } from '../actions'
import { EditorHeader, SaveBar, SuccessScreen } from '../editor-shell'
import type { SpecialHours } from '@/lib/gbp-listing'

export default function SpecialHoursEditor({ initial, gbpConnected }: { initial: SpecialHours; gbpConnected: boolean }) {
  const [items, setItems] = useState<SpecialHours>(initial)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const add = () => setItems(p => [...p, { date: new Date().toISOString().slice(0, 10), closed: true }])
  const update = (i: number, patch: Partial<SpecialHours[number]>) => setItems(p => p.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const remove = (i: number) => setItems(p => p.filter((_, idx) => idx !== i))

  const onSave = () => { setSaving(true); saveBusinessInfo({ specialHours: items }).then(setResult).finally(() => setSaving(false)) }

  if (result?.synced.saved) return <SuccessScreen result={result} onEditAgain={() => setResult(null)} />

  return (
    <div className="max-w-lg mx-auto pb-tabbar lg:pb-8 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      <EditorHeader title="Special hours" subtitle="Holidays and one-off closures" />
      <div className="px-4 py-5 space-y-2.5">
        {!gbpConnected && (
          <p className="text-[12px] text-ink-3 mb-1">Connect Google Business Profile to publish special hours.</p>
        )}
        {items.map((s, i) => (
          <div key={i} className="bg-white border border-ink-6 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <input type="date" value={s.date} onChange={e => update(i, { date: e.target.value })} className="flex-1 bg-bg-2 border border-ink-6 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
              <button onClick={() => remove(i)} className="w-8 h-8 rounded-full bg-ink-7 text-ink-3 flex items-center justify-center active:bg-ink-6" aria-label="Remove"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => update(i, { closed: !s.closed })}
                className={['relative w-11 h-6 rounded-full transition-colors flex-shrink-0', !s.closed ? 'bg-brand' : 'bg-ink-6'].join(' ')}
                aria-pressed={!s.closed} aria-label={s.closed ? 'Closed' : 'Open'}
              >
                <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', !s.closed ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
              </button>
              {s.closed ? (
                <span className="flex-1 text-[13px] text-ink-4">Closed all day</span>
              ) : (
                <div className="flex items-center gap-1.5 flex-1 justify-end">
                  <input type="time" value={s.open ?? '09:00'} onChange={e => update(i, { open: e.target.value })} className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
                  <span className="text-ink-4 text-[12px]">to</span>
                  <input type="time" value={s.close ?? '17:00'} onChange={e => update(i, { close: e.target.value })} className="bg-bg-2 border border-ink-6 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-brand" />
                </div>
              )}
            </div>
          </div>
        ))}
        <button onClick={add} className="w-full inline-flex items-center justify-center gap-1.5 bg-white border border-dashed border-ink-5 rounded-2xl py-3 text-[13px] font-semibold text-ink-2 active:bg-ink-7">
          <Plus className="w-4 h-4" /> Add a special date
        </button>
      </div>
      <SaveBar saving={saving} onSave={onSave} />
    </div>
  )
}
