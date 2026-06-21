'use client'

/**
 * Cuisine & category — the single biggest local-ranking lever, pulled into the
 * Business info hub in the mvp design. Reuses the existing listing APIs:
 *   GET  /api/dashboard/listing                 -> current categories
 *   GET  /api/dashboard/listing/categories?q=   -> Google category search
 *   PATCH /api/dashboard/listing { categories } -> push to Google
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Star, Loader2 } from 'lucide-react'
import type { ListingCategory } from '@/lib/gbp-listing'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpSaveBar, C, DISPLAY } from '@/components/mvp/mvp-detail'

export default function CategoryEditor() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [primary, setPrimary] = useState<ListingCategory | null>(null)
  const [additional, setAdditional] = useState<ListingCategory[]>([])
  const [originalKey, setOriginalKey] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ListingCategory[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/listing')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { fields?: { categories?: { primary: ListingCategory | null; additional: ListingCategory[] } } }) => {
        const cats = data.fields?.categories ?? { primary: null, additional: [] }
        setPrimary(cats.primary)
        setAdditional(cats.additional ?? [])
        setOriginalKey(keyOf(cats.primary, cats.additional ?? []))
      })
      .catch(() => setLoadError("Couldn't load your categories. Make sure Google is connected."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/dashboard/listing/categories?q=${encodeURIComponent(query.trim())}`)
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (!cancelled && json) setResults(json.categories ?? []) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  const dirty = !loading && keyOf(primary, additional) !== originalKey

  function add(cat: ListingCategory) {
    setSaved(false)
    const all = [primary, ...additional].filter(Boolean) as ListingCategory[]
    if (all.some(c => c.name === cat.name)) { setQuery(''); setResults([]); return }
    if (!primary) setPrimary(cat)
    else if (additional.length < 9) setAdditional(a => [...a, cat])
    setQuery(''); setResults([])
  }

  function remove(cat: ListingCategory) {
    setSaved(false)
    if (primary?.name === cat.name) {
      const [next, ...rest] = additional
      setPrimary(next ?? null); setAdditional(rest)
    } else {
      setAdditional(a => a.filter(c => c.name !== cat.name))
    }
  }

  function makePrimary(cat: ListingCategory) {
    if (primary?.name === cat.name) return
    if (primary && !confirm(`Make "${cat.displayName}" your primary category instead of "${primary.displayName}"? This changes which Google searches show your listing and can take a few days to reflect.`)) return
    setSaved(false)
    const newAdditional = [...(primary ? [primary] : []), ...additional.filter(c => c.name !== cat.name)]
    setPrimary(cat); setAdditional(newAdditional)
  }

  async function onSave() {
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch('/api/dashboard/listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: { primary, additional } }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setSaveError(b.error || `Could not update Google (HTTP ${res.status})`)
        return
      }
      setOriginalKey(keyOf(primary, additional))
      setSaved(true)
      router.refresh()
    } catch {
      setSaveError('Could not save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const slotsLeft = 9 - additional.length

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Cuisine & category" subtitle="The main thing you're found for. Updates Google." backHref="/dashboard/business-info" backLabel="Business info" />}>
      <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flex: 1, padding: '16px 14px 14px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 14, padding: '40px 0' }}>Loading...</div>
          ) : loadError ? (
            <div style={{ background: '#fdeeee', border: '0.5px solid #f1c7c3', borderRadius: 14, padding: '14px', fontSize: 13, color: '#8a2f28', lineHeight: 1.5 }}>{loadError}</div>
          ) : (
            <>
              <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '15px 16px', marginBottom: 18 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 6 }}>You appear on Google as</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: primary ? C.ink : C.faint, fontFamily: DISPLAY, lineHeight: 1.2 }}>{primary?.displayName ?? 'No category set yet'}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 6, lineHeight: 1.45 }}>This decides which &ldquo;near me&rdquo; searches you show up in. Make it specific (e.g. &ldquo;Korean BBQ restaurant&rdquo;).</div>
              </div>

              {(primary || additional.length > 0) && (
                <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
                  {primary && <CatRow cat={primary} isPrimary onRemove={() => remove(primary)} />}
                  {additional.map((c, i) => (
                    <div key={c.name}>
                      {(primary || i > 0) && <div style={{ height: '0.5px', background: C.line, marginLeft: 14 }} />}
                      <CatRow cat={c} isPrimary={false} onRemove={() => remove(c)} onMakePrimary={() => makePrimary(c)} />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ position: 'relative', marginBottom: 6 }}>
                <Search size={16} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  className="mvp-input"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={primary ? `Add another category (${slotsLeft} left)` : 'Search your category, e.g. Korean restaurant'}
                  style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px 12px 36px', fontSize: 16, color: C.ink, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              {searching && <div style={{ fontSize: 12, color: C.faint, padding: '4px 6px' }}>Searching...</div>}
              {results.length > 0 && (
                <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginTop: 6 }}>
                  {results.map((r, i) => (
                    <div key={r.name}>
                      {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 14 }} />}
                      <button type="button" onClick={() => add(r)} className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 14.5, color: C.ink, fontFamily: 'inherit' }}>
                        {r.displayName}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <div style={{ fontSize: 12.5, color: C.faint, padding: '8px 6px' }}>No matches. Try a different word.</div>
              )}

              {saveError && <p style={{ fontSize: 13, color: C.coral, margin: '12px 4px 0' }}>{saveError}</p>}
            </>
          )}
        </div>

        {!loading && !loadError && (
          <MvpSaveBar onClick={onSave} label="Save & update Google" disabled={!dirty || !primary} saving={saving} hint={!primary ? 'Pick your main category first' : saved && !dirty ? 'Saved' : undefined} />
        )}
      </div>
    </MvpShell>
  )
}

function keyOf(primary: ListingCategory | null, additional: ListingCategory[]): string {
  return JSON.stringify({ p: primary?.name ?? null, a: additional.map(c => c.name) })
}

function CatRow({ cat, isPrimary, onRemove, onMakePrimary }: { cat: ListingCategory; isPrimary: boolean; onRemove: () => void; onMakePrimary?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 14px' }}>
      {isPrimary && <Star size={16} color={C.greenDk} fill={C.greenDk} style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: isPrimary ? 600 : 500, color: C.ink }}>
        {cat.displayName}
        {isPrimary && <span style={{ fontSize: 11, fontWeight: 700, color: C.greenDk, marginLeft: 8, letterSpacing: '.04em' }}>PRIMARY</span>}
      </span>
      {onMakePrimary && (
        <button type="button" onClick={onMakePrimary} style={{ flexShrink: 0, background: 'none', border: 'none', color: C.greenDk, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '4px 6px' }}>Make primary</button>
      )}
      <button type="button" onClick={onRemove} aria-label="Remove" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: '#f3f3f5', color: C.mute, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <X size={14} />
      </button>
    </div>
  )
}
