'use client'

/**
 * The locations manager: cards for every spot, tap to edit. Empty override
 * fields show the business default as a placeholder and inherit it; typing
 * a value makes that spot different. Same look as the rest of business-info.
 */

import { useState } from 'react'
import { MapPin, Plus, Loader2 } from 'lucide-react'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import { EditorHeader } from '../editor-shell'

export interface BrandDefaults {
  phone: string
  website: string
}

export interface LocationRow {
  id: string
  location_name: string
  full_address: string
  is_primary: boolean
  phone: string
  website: string
  price_range: string
  biz_type: string
  cuisine: string
  menu_url: string
}

const T = { ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', green: '#2e9a78' }

function Field({
  label, value, onChange, placeholder, inheritHint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  inheritHint?: boolean
}) {
  return (
    <div>
      <div className="text-[12px] font-semibold mb-1" style={{ color: '#48484a' }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[14px] outline-none rounded-[10px] px-3 py-2.5"
        style={{ background: '#f1f1f4', border: '1px solid transparent', color: T.ink }}
      />
      {inheritHint && !value.trim() && (
        <div className="text-[11px] mt-0.5" style={{ color: T.faint }}>Empty means same as your business.</div>
      )}
    </div>
  )
}

export default function LocationsEditor({
  clientId, initial, brand, overridesReady,
}: {
  clientId: string
  initial: LocationRow[]
  brand: BrandDefaults
  overridesReady: boolean
}) {
  const [locations, setLocations] = useState<LocationRow[]>(initial)
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<LocationRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddr, setNewAddr] = useState('')
  const [note, setNote] = useState('')

  function openCard(l: LocationRow) {
    setOpen(l.id)
    setDraft({ ...l })
    setNote('')
  }

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    const res = await fetch('/api/dashboard/locations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, clientId, id: draft.id }),
    }).then((r) => r.json()).catch(() => ({ error: 'network' }))
    setSaving(false)
    if (res.error) { setNote('Could not save. Try again.'); return }
    setLocations((prev) => prev.map((l) => (l.id === draft.id ? { ...draft } : l)))
    setOpen(null)
    setDraft(null)
    if (res.overridesSkipped) setNote('Saved the basics. Per-spot details need a small database update first.')
  }

  async function addLocation() {
    const addr = newAddr.trim()
    if (!addr) return
    setSaving(true)
    const res = await fetch('/api/dashboard/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, location_name: newName.trim(), full_address: addr }),
    }).then((r) => r.json()).catch(() => ({ error: 'network' }))
    setSaving(false)
    if (res.error || !res.id) { setNote('Could not add. Try again.'); return }
    setLocations((prev) => [...prev, {
      id: res.id, location_name: newName.trim(), full_address: addr, is_primary: prev.length === 0,
      phone: '', website: '', price_range: '', biz_type: '', cuisine: '', menu_url: '',
    }])
    setAdding(false); setNewName(''); setNewAddr(''); setNote('')
  }

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Locations" subtitle="Each spot can have its own info" />}>
      <div style={{ background: '#f5f5f7', minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        <EditorHeader title="Locations" subtitle="Empty fields match your business. Fill one to make a spot different." />

        <div className="flex flex-col gap-2.5 mt-4">
          {note && (
            <div className="text-[12.5px] rounded-[10px] px-3 py-2" style={{ background: '#fdf6ec', color: '#8a5a12' }}>{note}</div>
          )}
          {locations.length === 0 && !adding && (
            <div className="flex flex-col items-center gap-1.5 rounded-[14px] px-4 py-7" style={{ border: '1.5px dashed #d8d8dc', background: 'rgba(255,255,255,0.6)' }}>
              <MapPin size={18} color={T.faint} />
              <div className="text-[13px]" style={{ color: '#8e8e93' }}>Your locations will show up here.</div>
            </div>
          )}
          {locations.map((l) => (
            <div key={l.id} className="rounded-[14px] bg-white" style={{ boxShadow: open === l.id ? 'inset 0 0 0 1.5px #4abd98, 0 8px 24px rgba(74,189,152,0.15)' : '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.05)' }}>
              <div
                role="button" tabIndex={0}
                onClick={() => (open === l.id ? setOpen(null) : openCard(l))}
                onKeyDown={(e) => { if (e.key === 'Enter') (open === l.id ? setOpen(null) : openCard(l)) }}
                className="flex items-center gap-2.5 px-3.5 py-3 cursor-pointer"
              >
                <MapPin size={16} color={T.mute} className="flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  {l.location_name ? (
                    <div className="text-[13.5px] font-semibold truncate" style={{ color: T.ink }}>
                      {l.location_name}
                    </div>
                  ) : null}
                  <div className="text-[12px] truncate" style={{ color: T.mute }}>{l.full_address}</div>
                </div>
              </div>
              {open === l.id && draft && (
                <div className="px-3.5 pb-4 flex flex-col gap-3">
                  <Field label="Location name" value={draft.location_name} onChange={(v) => setDraft({ ...draft, location_name: v })} placeholder="Like Downtown or Traxx" />
                  <Field label="Address" value={draft.full_address} onChange={(v) => setDraft({ ...draft, full_address: v })} placeholder="Street, city, state" />
                  <Field label="Phone" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} placeholder={brand.phone || '(555) 123-4567'} inheritHint />
                  {overridesReady && (
                    <>
                      <Field label="Website" value={draft.website} onChange={(v) => setDraft({ ...draft, website: v })} placeholder={brand.website || 'https://...'} inheritHint />
                      <Field label="Type" value={draft.biz_type} onChange={(v) => setDraft({ ...draft, biz_type: v })} placeholder="Cafe, market, food truck..." inheritHint />
                      <Field label="Cuisine" value={draft.cuisine} onChange={(v) => setDraft({ ...draft, cuisine: v })} placeholder="Korean BBQ, bakery..." inheritHint />
                      <Field label="Price range" value={draft.price_range} onChange={(v) => setDraft({ ...draft, price_range: v })} placeholder="$, $$, $$$" inheritHint />
                      <Field label="Menu link" value={draft.menu_url} onChange={(v) => setDraft({ ...draft, menu_url: v })} placeholder="This spot's own menu, if it has one" inheritHint />
                    </>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <button
                      type="button" onClick={saveDraft} disabled={saving}
                      className="text-[13px] font-bold text-white disabled:opacity-50"
                      style={{ minHeight: 40, padding: '0 20px', borderRadius: 20, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #4abd98, #2e9a78)', boxShadow: '0 6px 16px rgba(74,189,152,0.30)' }}
                    >
                      {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save'}
                    </button>
                    <button
                      type="button" onClick={() => { setOpen(null); setDraft(null) }}
                      className="text-[12.5px] font-semibold"
                      style={{ background: 'none', border: 'none', color: T.mute, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {adding ? (
            <div className="rounded-[14px] p-3 bg-white flex flex-col gap-2.5" style={{ boxShadow: 'inset 0 0 0 1.5px #4abd98, 0 8px 24px rgba(74,189,152,0.15)' }}>
              <Field label="Location name" value={newName} onChange={setNewName} placeholder="Like Downtown or Traxx" />
              <Field label="Address" value={newAddr} onChange={setNewAddr} placeholder="Street, city, state" />
              <div className="flex items-center gap-3">
                <button
                  type="button" onClick={addLocation} disabled={saving || !newAddr.trim()}
                  className="text-[13px] font-bold text-white disabled:opacity-40"
                  style={{ minHeight: 40, padding: '0 20px', borderRadius: 20, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #4abd98, #2e9a78)', boxShadow: '0 6px 16px rgba(74,189,152,0.30)' }}
                >
                  Add this location
                </button>
                <button
                  type="button" onClick={() => { setAdding(false); setNewName(''); setNewAddr('') }}
                  className="text-[12.5px] font-semibold"
                  style={{ background: 'none', border: 'none', color: T.mute, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button" onClick={() => setAdding(true)}
              className="self-center inline-flex items-center gap-1 text-[12.5px] font-semibold"
              style={{ background: 'none', border: 'none', color: '#0f6e56', cursor: 'pointer', padding: '4px 0' }}
            >
              <Plus size={13} /> Add a location
            </button>
          )}
        </div>
      </div>
    </MvpShell>
  )
}
