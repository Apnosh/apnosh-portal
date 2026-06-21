'use client'

import { useMemo, useState } from 'react'
import { Plus, X, CalendarDays } from 'lucide-react'
import { saveBusinessInfo, type SaveResult } from '../actions'
import { MvpEditorShell, MvpToggle, MvpTimeInput } from '../editor-shell'
import { C } from '@/components/mvp/mvp-detail'
import type { SpecialHours } from '@/lib/gbp-listing'

export default function SpecialHoursEditor({ initial, gbpConnected }: { initial: SpecialHours; gbpConnected: boolean }) {
  const [items, setItems] = useState<SpecialHours>(initial)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const initialStr = useMemo(() => JSON.stringify(initial), [initial])
  const dirty = JSON.stringify(items) !== initialStr

  const add = () => setItems(p => [...p, { date: new Date().toISOString().slice(0, 10), closed: true }])
  const update = (i: number, patch: Partial<SpecialHours[number]>) => setItems(p => p.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const remove = (i: number) => setItems(p => p.filter((_, idx) => idx !== i))

  const onSave = () => { setSaving(true); saveBusinessInfo({ specialHours: items }).then(setResult).finally(() => setSaving(false)) }

  return (
    <MvpEditorShell
      title="Special hours"
      subtitle="Holidays and one-off closures. Updates Google and your website."
      saving={saving}
      dirty={dirty}
      onSave={onSave}
      result={result}
      onEditAgain={() => setResult(null)}
    >
      {!gbpConnected && (
        <div style={{ background: '#fbf3e4', border: '0.5px solid #eed9b3', borderRadius: 12, padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: '#8a5a0c', lineHeight: 1.45 }}>
          Connect Google Business Profile to publish special hours to Google.
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ background: '#fff', border: '0.5px dashed rgba(74,189,152,0.32)', borderRadius: 16, padding: '26px 20px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <CalendarDays size={20} color={C.green} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>No special dates yet</div>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>Add holidays or one-off closures so customers know before they show up.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((s, i) => (
            <div key={i} style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '12px 12px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <MvpTimeInput type="date" value={s.date} onChange={v => update(i, { date: v })} />
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => remove(i)} aria-label="Remove" style={{ width: 32, height: 32, borderRadius: '50%', background: '#f3f3f5', color: C.mute, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <X size={15} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MvpToggle on={!s.closed} onClick={() => update(i, { closed: !s.closed })} label={s.closed ? 'Closed' : 'Open'} />
                {s.closed ? (
                  <span style={{ flex: 1, fontSize: 14, color: C.faint }}>Closed all day</span>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                    <MvpTimeInput value={s.open ?? '09:00'} onChange={v => update(i, { open: v })} />
                    <span style={{ fontSize: 12.5, color: C.faint }}>to</span>
                    <MvpTimeInput value={s.close ?? '17:00'} onChange={v => update(i, { close: v })} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={add} style={{ width: '100%', marginTop: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#fff', border: `1px dashed ${C.faint}`, borderRadius: 14, padding: '13px', fontSize: 14, fontWeight: 600, color: C.greenDk, fontFamily: 'inherit', cursor: 'pointer' }}>
        <Plus size={17} /> Add a special date
      </button>
    </MvpEditorShell>
  )
}
