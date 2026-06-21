'use client'

/**
 * Service & amenities — Google attributes (dine-in / takeout / delivery, plus
 * amenities, offerings, payments) as plain toggles, in the Business info hub.
 * Reuses the existing attributes API:
 *   GET   /api/dashboard/listing/attributes  -> { values, catalog }
 *   PATCH /api/dashboard/listing/attributes  -> { values }
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpSaveBar, C } from '@/components/mvp/mvp-detail'
import { MvpToggle } from '../editor-shell'

type CatalogItem = { id: string; label: string; group: string }
type Values = Record<string, boolean>

function keyOf(catalog: CatalogItem[], vals: Values): string {
  return JSON.stringify(catalog.map(c => (vals[c.id] ? 1 : 0)))
}
function orderedGroups(catalog: CatalogItem[]): string[] {
  const seen: string[] = []
  for (const c of catalog) if (!seen.includes(c.group)) seen.push(c.group)
  return seen
}

export default function ServiceOptionsEditor() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [values, setValues] = useState<Values>({})
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [originalKey, setOriginalKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/listing/attributes')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { values?: Values; catalog?: CatalogItem[] }) => {
        const vals = data.values ?? {}
        const cat = data.catalog ?? []
        setValues(vals)
        setCatalog(cat)
        setOriginalKey(keyOf(cat, vals))
      })
      .catch(() => setLoadError("Couldn't load this. Make sure Google is connected."))
      .finally(() => setLoading(false))
  }, [])

  const dirty = !loading && keyOf(catalog, values) !== originalKey

  function toggle(id: string) {
    setSaved(false)
    setValues(v => ({ ...v, [id]: !v[id] }))
  }

  async function onSave() {
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch('/api/dashboard/listing/attributes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setSaveError(b.error || `Could not update Google (HTTP ${res.status})`)
        return
      }
      setOriginalKey(keyOf(catalog, values))
      setSaved(true)
      router.refresh()
    } catch {
      setSaveError('Could not save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const groups = orderedGroups(catalog)

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Service & amenities" subtitle="Dine-in, takeout, delivery and more. Updates Google." backHref="/dashboard/business-info" backLabel="Business info" />}>
      <div style={{ background: C.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ flex: 1, padding: '16px 14px 14px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 14, padding: '40px 0' }}>Loading...</div>
          ) : loadError ? (
            <div style={{ background: '#fdeeee', border: '0.5px solid #f1c7c3', borderRadius: 14, padding: '14px', fontSize: 13, color: '#8a2f28', lineHeight: 1.5 }}>{loadError}</div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.mute, fontSize: 13.5, padding: '30px 16px', lineHeight: 1.5 }}>No options are available for your listing right now.</div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, margin: '0 6px 16px' }}>
                Turn on what you offer. Customers filter by these, so missing &ldquo;takeout&rdquo; loses every to-go searcher.
              </p>
              {groups.map(g => (
                <div key={g} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 6px 7px' }}>{g}</div>
                  <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                    {catalog.filter(c => c.group === g).map((c, i) => (
                      <div key={c.id}>
                        {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 14 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', minHeight: 52 }}>
                          <span style={{ flex: 1, fontSize: 15, color: C.ink }}>{c.label}</span>
                          <MvpToggle on={!!values[c.id]} onClick={() => toggle(c.id)} label={c.label} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {saveError && <p style={{ fontSize: 13, color: C.coral, margin: '4px 4px 0' }}>{saveError}</p>}
            </>
          )}
        </div>
        {!loading && !loadError && groups.length > 0 && (
          <MvpSaveBar onClick={onSave} label="Save & update Google" disabled={!dirty} saving={saving} hint={saved && !dirty ? 'Saved' : undefined} />
        )}
      </div>
    </MvpShell>
  )
}
