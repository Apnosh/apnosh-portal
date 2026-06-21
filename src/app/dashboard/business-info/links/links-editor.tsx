'use client'

import { useMemo, useState } from 'react'
import { Plus, X, ShoppingBag, CalendarCheck, Share2 } from 'lucide-react'
import { saveBusinessInfo, type SaveResult, type BusinessLinks, type LinkEntry } from '../actions'
import { MvpEditorShell, EditorField } from '../editor-shell'
import { C } from '@/components/mvp/mvp-detail'

const SOCIAL_FIELDS: Array<{ key: keyof BusinessLinks['social']; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
]

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 9,
  padding: '9px 11px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none',
}

export default function LinksEditor({ initial }: { initial: BusinessLinks }) {
  const [ordering, setOrdering] = useState<LinkEntry[]>(initial.ordering ?? [])
  const [reservations, setReservations] = useState<LinkEntry[]>(initial.reservations ?? [])
  const [social, setSocial] = useState<BusinessLinks['social']>(initial.social ?? {})
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const initialStr = useMemo(() => JSON.stringify({ ordering: initial.ordering ?? [], reservations: initial.reservations ?? [], social: initial.social ?? {} }), [initial])
  const dirty = JSON.stringify({ ordering, reservations, social }) !== initialStr

  const onSave = (sync: boolean) => {
    setSaving(true)
    const clean = (rows: LinkEntry[]) => rows.filter(r => r.url.trim())
    saveBusinessInfo({
      links: {
        ordering: clean(ordering),
        reservations: clean(reservations),
        social: Object.fromEntries(Object.entries(social).filter(([, v]) => v && v.trim())),
      },
    }, { sync }).then(setResult).finally(() => setSaving(false))
  }

  return (
    <MvpEditorShell
      title="Order, reserve & social"
      subtitle="Shown on your website"
      saving={saving}
      dirty={dirty}
      onSave={onSave}
      saveLabel="Save"
      syncTargets="your website"
      result={result}
      onEditAgain={() => setResult(null)}
    >
      <LinkSection icon={<ShoppingBag size={16} />} title="Online ordering" hint="DoorDash, Uber Eats, your own page" rows={ordering} setRows={setOrdering} labelPlaceholder="DoorDash" />
      <LinkSection icon={<CalendarCheck size={16} />} title="Reservations" hint="OpenTable, Resy, your booking page" rows={reservations} setRows={setReservations} labelPlaceholder="OpenTable" />

      <div style={{ marginBottom: 8 }}>
        <SectionHead icon={<Share2 size={16} />} title="Social profiles" hint="Your handles across platforms" />
        {SOCIAL_FIELDS.map(f => (
          <EditorField
            key={f.key}
            label={f.label}
            type="url"
            inputMode="url"
            value={social[f.key] ?? ''}
            onChange={v => setSocial(s => ({ ...s, [f.key]: v }))}
            placeholder={f.placeholder}
          />
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, margin: '4px 2px 0' }}>
        These show on your website. We&apos;ll add order and reserve buttons to your Google listing in a later update.
      </p>
    </MvpEditorShell>
  )
}

function SectionHead({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11, padding: '0 2px' }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1 }}>{hint}</div>
      </div>
    </div>
  )
}

function LinkSection({ icon, title, hint, rows, setRows, labelPlaceholder }: {
  icon: React.ReactNode
  title: string
  hint: string
  rows: LinkEntry[]
  setRows: React.Dispatch<React.SetStateAction<LinkEntry[]>>
  labelPlaceholder: string
}) {
  const add = () => setRows(p => [...p, { label: '', url: '' }])
  const update = (i: number, patch: Partial<LinkEntry>) => setRows(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const remove = (i: number) => setRows(p => p.filter((_, idx) => idx !== i))

  return (
    <div style={{ marginBottom: 22 }}>
      <SectionHead icon={icon} title={title} hint={hint} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 10px 11px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input className="mvp-input" value={r.label} onChange={e => update(i, { label: e.target.value })} placeholder={labelPlaceholder} style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={() => remove(i)} aria-label="Remove" style={{ width: 32, height: 32, borderRadius: '50%', background: '#f3f3f5', color: C.mute, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <X size={15} />
              </button>
            </div>
            <input className="mvp-input" type="url" inputMode="url" value={r.url} onChange={e => update(i, { url: e.target.value })} placeholder="https://..." style={{ ...inputStyle, width: '100%' }} />
          </div>
        ))}
        <button type="button" onClick={add} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', border: `1px dashed ${C.faint}`, borderRadius: 12, padding: '11px', fontSize: 13, fontWeight: 600, color: C.greenDk, fontFamily: 'inherit', cursor: 'pointer' }}>
          <Plus size={16} /> Add {title.toLowerCase()} link
        </button>
      </div>
    </div>
  )
}
