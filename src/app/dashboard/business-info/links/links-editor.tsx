'use client'

import { useState } from 'react'
import { Plus, X, ShoppingBag, CalendarCheck, Share2, AtSign } from 'lucide-react'
import { saveBusinessInfo, type SaveResult, type BusinessLinks, type LinkEntry } from '../actions'
import { EditorHeader, SaveBar, SuccessScreen } from '../editor-shell'

const SOCIAL_FIELDS: Array<{ key: keyof BusinessLinks['social']; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
]

export default function LinksEditor({ initial }: { initial: BusinessLinks }) {
  const [ordering, setOrdering] = useState<LinkEntry[]>(initial.ordering ?? [])
  const [reservations, setReservations] = useState<LinkEntry[]>(initial.reservations ?? [])
  const [social, setSocial] = useState<BusinessLinks['social']>(initial.social ?? {})
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const onSave = () => {
    setSaving(true)
    /* Drop empty rows before saving. */
    const clean = (rows: LinkEntry[]) => rows.filter(r => r.url.trim())
    saveBusinessInfo({
      links: {
        ordering: clean(ordering),
        reservations: clean(reservations),
        social: Object.fromEntries(Object.entries(social).filter(([, v]) => v && v.trim())),
      },
    }).then(setResult).finally(() => setSaving(false))
  }

  if (result?.synced.saved) return <SuccessScreen result={result} onEditAgain={() => setResult(null)} />

  return (
    <div className="max-w-lg mx-auto pb-tabbar lg:pb-8 -mx-4 lg:mx-0 -mt-4 lg:mt-0 bg-bg-2 min-h-screen">
      <EditorHeader title="Order, reserve & social" subtitle="Links shown on your website" />
      <div className="px-4 py-5 space-y-6">
        {/* Ordering */}
        <LinkListSection
          icon={ShoppingBag}
          tint="bg-amber-50 text-amber-700"
          title="Online ordering"
          hint="DoorDash, Uber Eats, your own ordering page"
          rows={ordering}
          setRows={setOrdering}
          labelPlaceholder="DoorDash"
        />
        {/* Reservations */}
        <LinkListSection
          icon={CalendarCheck}
          tint="bg-rose-50 text-rose-700"
          title="Reservations"
          hint="OpenTable, Resy, your booking page"
          rows={reservations}
          setRows={setReservations}
          labelPlaceholder="OpenTable"
        />
        {/* Social */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-purple-50 text-purple-700">
              <Share2 className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink leading-tight">Social profiles</p>
              <p className="text-[11.5px] text-ink-3">Your handles across platforms</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {SOCIAL_FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-[12px] font-semibold text-ink-2 mb-1">{f.label}</label>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-ink-6 text-ink-3 flex-shrink-0">
                    <AtSign className="w-4 h-4" />
                  </span>
                  <input
                    type="url"
                    value={social[f.key] ?? ''}
                    onChange={e => setSocial(s => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="flex-1 bg-white border border-ink-6 rounded-xl px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-brand touch-input"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11.5px] text-ink-4 px-1">
          These appear on your website. Order &amp; reserve buttons and social icons update on your next publish.
        </p>
      </div>
      <SaveBar saving={saving} onSave={onSave} />
    </div>
  )
}

function LinkListSection({ icon: Icon, tint, title, hint, rows, setRows, labelPlaceholder }: {
  icon: React.ComponentType<{ className?: string }>
  tint: string
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
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl ${tint}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <p className="text-[14px] font-semibold text-ink leading-tight">{title}</p>
          <p className="text-[11.5px] text-ink-3">{hint}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={i} className="bg-white border border-ink-6 rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={r.label}
                onChange={e => update(i, { label: e.target.value })}
                placeholder={labelPlaceholder}
                className="flex-1 bg-bg-2 border border-ink-6 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-brand"
              />
              <button onClick={() => remove(i)} className="w-8 h-8 rounded-full bg-ink-7 text-ink-3 flex items-center justify-center active:bg-ink-6 flex-shrink-0" aria-label="Remove"><X className="w-3.5 h-3.5" /></button>
            </div>
            <input
              type="url"
              value={r.url}
              onChange={e => update(i, { url: e.target.value })}
              placeholder="https://..."
              className="w-full bg-bg-2 border border-ink-6 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-brand touch-input"
            />
          </div>
        ))}
        <button onClick={add} className="w-full inline-flex items-center justify-center gap-1.5 bg-white border border-dashed border-ink-5 rounded-2xl py-2.5 text-[12.5px] font-semibold text-ink-2 active:bg-ink-7">
          <Plus className="w-4 h-4" /> Add {title.toLowerCase()} link
        </button>
      </div>
    </div>
  )
}
