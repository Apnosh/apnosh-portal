'use client'

import { useState, useEffect, useMemo } from 'react'
import { Tag, Loader2, Check, AlertTriangle } from 'lucide-react'

interface CatalogItem { id: string; label: string; group: string }
type Values = Record<string, boolean>

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={on}
      className={'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ' + (on ? 'bg-brand' : 'bg-ink-5')}
    >
      <span className={'inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ' + (on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

export default function AmenitiesPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [original, setOriginal] = useState<Values>({})
  const [current, setCurrent] = useState<Values>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/listing/attributes')
      .then(async r => {
        const b = await r.json().catch(() => ({}))
        if (!r.ok) { setLoadError(b.error || `Couldn’t load (HTTP ${r.status})`); return }
        setCatalog(b.catalog ?? [])
        setOriginal(b.values ?? {})
        setCurrent(b.values ?? {})
      })
      .catch(e => setLoadError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const changed = useMemo(
    () => Object.keys({ ...original, ...current }).filter(id => !!original[id] !== !!current[id]),
    [original, current],
  )

  const groups = useMemo(() => {
    const out: Record<string, CatalogItem[]> = {}
    for (const item of catalog) (out[item.group] ??= []).push(item)
    return out
  }, [catalog])

  function toggle(id: string) {
    setCurrent(c => ({ ...c, [id]: !c[id] }))
    setSaveMsg(null)
  }

  async function save() {
    if (changed.length === 0) return
    setSaving(true); setSaveMsg(null)
    const delta: Values = {}
    for (const id of changed) delta[id] = !!current[id]
    try {
      const res = await fetch('/api/dashboard/listing/attributes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: delta }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveMsg({ ok: false, text: b.error || `Save failed (HTTP ${res.status})` }); return }
      setOriginal({ ...original, ...delta })
      setSaveMsg({ ok: true, text: 'Saved to your Google listing' })
    } catch (e) {
      setSaveMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 lg:px-6 pt-6 pb-28 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Local SEO</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Tag className="w-6 h-6 text-brand" />
          Amenities &amp; options
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Tell Google what you offer. These show on your listing and help you rank for the right searches.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-10 flex items-center justify-center text-ink-3">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-amber-900">Couldn&rsquo;t load your amenities</p>
            <p className="text-amber-900/85 mt-1">{loadError}. Make sure Google Business Profile is connected, then try again.</p>
          </div>
        </div>
      )}

      {!loading && !loadError && Object.entries(groups).map(([group, items]) => (
        <div key={group} className="rounded-2xl bg-white ring-1 ring-ink-6 overflow-hidden">
          <div className="px-5 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">{group}</div>
          <div className="divide-y divide-ink-6">
            {items.map(item => (
              <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{item.label}</span>
                <Toggle on={!!current[item.id]} onChange={() => toggle(item.id)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Sticky save bar */}
      {!loading && !loadError && (
        <div className="fixed bottom-0 inset-x-0 lg:left-[var(--sidebar-w,0)] bg-white/90 backdrop-blur border-t border-ink-6 px-4 py-3">
          <div className="max-w-[760px] mx-auto flex items-center justify-between gap-3">
            <span className="text-xs text-ink-4">
              {saveMsg ? (
                <span className={'flex items-center gap-1.5 ' + (saveMsg.ok ? 'text-green-600' : 'text-red-500')}>
                  {saveMsg.ok && <Check className="w-3.5 h-3.5" />}{saveMsg.text}
                </span>
              ) : changed.length > 0 ? `${changed.length} change${changed.length === 1 ? '' : 's'} to save` : 'Up to date'}
            </span>
            <button
              onClick={save}
              disabled={saving || changed.length === 0}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save to Google
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
