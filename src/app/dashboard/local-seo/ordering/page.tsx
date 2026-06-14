'use client'

import { useState, useEffect } from 'react'
import { ShoppingBag, Loader2, Check, AlertTriangle, Lock } from 'lucide-react'

type PlaceActionType = 'FOOD_ORDERING' | 'FOOD_DELIVERY' | 'FOOD_TAKEOUT' | 'DINING_RESERVATION'
interface TypeMeta { value: PlaceActionType; label: string; hint: string }
interface Link { name: string; uri: string; placeActionType: string; providerType?: string; isEditable?: boolean }

export default function OrderingPage() {
  const [types, setTypes] = useState<TypeMeta[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [values, setValues] = useState<Partial<Record<PlaceActionType, string>>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/listing/place-actions')
      .then(async r => {
        const b = await r.json().catch(() => ({}))
        if (!r.ok) { setLoadError(b.error || `Couldn’t load (${r.status})`); return }
        setTypes(b.types ?? [])
        setLinks(b.links ?? [])
        const v: Partial<Record<PlaceActionType, string>> = {}
        for (const l of (b.links ?? []) as Link[]) {
          if (l.isEditable !== false && l.providerType !== 'AGGREGATOR_3P') v[l.placeActionType as PlaceActionType] = l.uri
        }
        setValues(v)
      })
      .catch(e => setLoadError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const aggregatorLinks = links.filter(l => l.providerType === 'AGGREGATOR_3P' || l.isEditable === false)

  async function save() {
    setSaving(true); setSaveMsg(null)
    try {
      const res = await fetch('/api/dashboard/listing/place-actions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links: values }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveMsg({ ok: false, text: b.error || `Save failed (${res.status})` }); return }
      setSaveMsg({ ok: true, text: 'Saved to your Google listing' })
    } catch (e) {
      setSaveMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[680px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Local SEO</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-brand" />
          Order &amp; reserve buttons
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          The action buttons customers tap on your Google listing. Add your own links so taps go where you want.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-10 flex items-center justify-center text-ink-3"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}

      {!loading && loadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-amber-900">Couldn&rsquo;t load your action buttons</p>
            <p className="text-amber-900/85 mt-1">{loadError}. Make sure Google Business Profile is connected, then try again.</p>
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-5 space-y-4">
            {types.map(t => (
              <div key={t.value}>
                <label className="text-sm font-medium text-ink">{t.label}</label>
                <p className="text-xs text-ink-4 mb-1.5">{t.hint}</p>
                <input
                  value={values[t.value] ?? ''}
                  onChange={e => { setValues(v => ({ ...v, [t.value]: e.target.value })); setSaveMsg(null) }}
                  placeholder="https://…"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            ))}
          </div>

          {aggregatorLinks.length > 0 && (
            <div className="rounded-2xl bg-bg-2 ring-1 ring-ink-6 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 mb-2">Added by partners (read-only)</p>
              <div className="space-y-1.5">
                {aggregatorLinks.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-ink-3">
                    <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{l.placeActionType.replace(/_/g, ' ').toLowerCase()} — {l.uri}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-4">
              {saveMsg ? (
                <span className={'flex items-center gap-1.5 ' + (saveMsg.ok ? 'text-green-600' : 'text-red-500')}>
                  {saveMsg.ok && <Check className="w-3.5 h-3.5" />}{saveMsg.text}
                </span>
              ) : 'Saves live to your Google listing.'}
            </span>
            <button
              onClick={save}
              disabled={saving}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save to Google
            </button>
          </div>
        </>
      )}
    </div>
  )
}
