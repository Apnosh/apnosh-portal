'use client'

/**
 * Google Profile tab — the client's LIVE Google Business Profile, editable from the admin side.
 * This is the servicing surface the owner asked for: the same profile the client sees in their
 * portal, populated from Google, where we make the adjustments ourselves. It rides the exact same
 * API routes as the client's own editor (/api/dashboard/listing/*) with the admin ?clientId= param
 * (the resolver honors it only for admins), so both sides always read and write the same truth,
 * and every save lands in the same gbp_listing_audit trail with the admin's identity on it.
 *
 * Save sends ONLY the fields that changed (the PATCH route masks per-field), so an admin edit can
 * never clobber something they did not touch.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, Save, Phone, Globe, Clock, Tag, Plus, X, Search,
  CheckCircle2, AlertTriangle, ExternalLink, Link2, History,
} from 'lucide-react'
import type { ListingFields, WeeklyHours, DayKey, ListingCategory, AttributeValues } from '@/lib/gbp-listing'
import MobileListingPreview from '@/components/dashboard/mobile-listing-preview'

interface Props { clientId: string }

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' }, { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' }, { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

function emptyHours(): WeeklyHours {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
}

interface CatalogItem { id: string; label: string; group: string }
interface AuditEntry { id: string; actor_email: string | null; action: string; fields: { changedFields?: string[] } | null; error: string | null; created_at: string }

export default function GbpProfileTab({ clientId }: Props) {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // The loaded snapshot (for change detection) and the working copy.
  const [snapshot, setSnapshot] = useState<ListingFields | null>(null)
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [hours, setHours] = useState<WeeklyHours>(emptyHours())
  const [primaryCat, setPrimaryCat] = useState<ListingCategory | null>(null)
  const [additionalCats, setAdditionalCats] = useState<ListingCategory[]>([])
  const [attrValues, setAttrValues] = useState<AttributeValues>({})
  const [attrSnapshot, setAttrSnapshot] = useState<AttributeValues>({})
  const [attrCatalog, setAttrCatalog] = useState<CatalogItem[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [hoursLocked, setHoursLocked] = useState(false)
  const [reviewUrl, setReviewUrl] = useState<string | null>(null)

  // Category search
  const [catQuery, setCatQuery] = useState('')
  const [catResults, setCatResults] = useState<ListingCategory[]>([])
  const [catSearching, setCatSearching] = useState(false)
  const [catMode, setCatMode] = useState<'primary' | 'additional' | null>(null)

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const q = `?clientId=${encodeURIComponent(clientId)}`

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null)
    try {
      const statusRes = await fetch(`/api/dashboard/gbp/status${q}`)
      const status = await statusRes.json().catch(() => ({}))
      // A failed status call is an ERROR, never "not connected" — saying "the client has not
      // connected" on a 500 would send the operator chasing the wrong problem.
      if (!statusRes.ok) throw new Error(status?.error || 'Could not check the Google connection.')
      if (status?.tokenRevoked === true) throw new Error('Google access was revoked. The client needs to reconnect their Google profile in their portal.')
      const isConnected = status?.connected === true
      setConnected(isConnected)
      if (!isConnected) { setLoading(false); return }

      const [listingRes, attrsRes, auditRes, reviewRes] = await Promise.all([
        fetch(`/api/dashboard/listing${q}`),
        fetch(`/api/dashboard/listing/attributes${q}`),
        fetch(`/api/dashboard/listing/audit${q}`),
        fetch(`/api/dashboard/listing/review-link${q}`),
      ])
      if (!listingRes.ok) {
        const j = await listingRes.json().catch(() => ({}))
        throw new Error(j?.error || 'Could not load the live profile from Google.')
      }
      const listing = await listingRes.json()
      const f: ListingFields = listing.fields ?? {}
      setTitle(listing.title ?? null)
      setSnapshot(f)
      setDescription(f.description ?? '')
      setPhone(f.primaryPhone ?? '')
      setWebsite(f.websiteUri ?? '')
      const loadedHours = f.regularHours ?? emptyHours()
      setHours(loadedHours)
      // Overnight closes (e.g. 22:00 to 02:00) come back as '24:00' from the round-trip, which this
      // editor cannot re-save faithfully yet. Lock hours editing rather than silently truncate them.
      setHoursLocked(Object.values(loadedHours).some((day) => day.some((p) => p.close === '24:00' || p.open === '24:00')))
      setPrimaryCat(f.categories?.primary ?? null)
      setAdditionalCats(f.categories?.additional ?? [])
      if (attrsRes.ok) {
        const a = await attrsRes.json()
        setAttrValues(a.values ?? {})
        setAttrSnapshot(a.values ?? {})
        setAttrCatalog(a.catalog ?? [])
      }
      if (auditRes.ok) {
        const au = await auditRes.json()
        setAudit((au.entries ?? []).slice(0, 6))
      }
      if (reviewRes.ok) {
        const rv = await reviewRes.json()
        setReviewUrl(rv.reviewUrl ?? null)
      }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Could not load the profile.')
    } finally {
      setLoading(false)
    }
  }, [clientId, q])

  useEffect(() => { void load() }, [load])

  // Category search (debounced)
  useEffect(() => {
    if (!catMode || catQuery.trim().length < 2) { setCatResults([]); return }
    const t = setTimeout(async () => {
      setCatSearching(true)
      try {
        const res = await fetch(`/api/dashboard/listing/categories${q}&q=${encodeURIComponent(catQuery.trim())}`)
        const j = await res.json().catch(() => ({}))
        setCatResults(res.ok ? (j.categories ?? []) : [])
      } finally { setCatSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [catQuery, catMode, q])

  const hoursChanged = useMemo(() => JSON.stringify(hours) !== JSON.stringify(snapshot?.regularHours ?? emptyHours()), [hours, snapshot])
  const catsChanged = useMemo(() => {
    const before = JSON.stringify({ p: snapshot?.categories?.primary?.name ?? null, a: (snapshot?.categories?.additional ?? []).map((c) => c.name).sort() })
    const after = JSON.stringify({ p: primaryCat?.name ?? null, a: additionalCats.map((c) => c.name).sort() })
    return before !== after
  }, [primaryCat, additionalCats, snapshot])
  const attrsChangedIds = useMemo(() => Object.keys(attrValues).filter((id) => (attrValues[id] === true) !== (attrSnapshot[id] === true)), [attrValues, attrSnapshot])

  const dirty = !!snapshot && (
    description !== (snapshot.description ?? '') ||
    phone !== (snapshot.primaryPhone ?? '') ||
    website !== (snapshot.websiteUri ?? '') ||
    hoursChanged || catsChanged || attrsChangedIds.length > 0
  )

  async function save() {
    if (!snapshot) return
    setSaving(true); setSaveErr(null)
    try {
      // Only the changed fields travel; untouched fields are never sent, never clobbered.
      const patch: Record<string, unknown> = {}
      if (description !== (snapshot.description ?? '')) patch.description = description
      if (phone !== (snapshot.primaryPhone ?? '')) patch.primaryPhone = phone
      if (website !== (snapshot.websiteUri ?? '')) patch.websiteUri = website
      if (hoursChanged && !hoursLocked) patch.regularHours = hours
      if (catsChanged) patch.categories = { primary: primaryCat, additional: additionalCats }
      if (Object.keys(patch).length > 0) {
        const res = await fetch(`/api/dashboard/listing${q}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        })
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || 'Google did not accept the update.') }
        // Fold what just landed into the snapshot NOW, so if the attributes half fails below, the
        // dirty state (and any retry) covers only what is genuinely unsaved — never a double-send.
        setSnapshot((s) => (s ? { ...s, ...(patch as Partial<ListingFields>) } : s))
      }
      if (attrsChangedIds.length > 0) {
        const values: AttributeValues = {}
        for (const id of attrsChangedIds) values[id] = attrValues[id] === true
        const res = await fetch(`/api/dashboard/listing/attributes${q}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }),
        })
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || 'Google did not accept the attribute update. Your other changes did save.') }
        setAttrSnapshot((v) => ({ ...v, ...values }))
      }
      setSavedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
      await load() // re-read from Google so the form + preview show the confirmed live values
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  function setDay(day: DayKey, idx: number, part: 'open' | 'close', value: string) {
    setHours((h) => ({ ...h, [day]: h[day].map((p, i) => (i === idx ? { ...p, [part]: value } : p)) }))
  }
  function addRange(day: DayKey) {
    setHours((h) => ({ ...h, [day]: [...h[day], { open: '11:00', close: '21:00' }] }))
  }
  function removeRange(day: DayKey, idx: number) {
    setHours((h) => ({ ...h, [day]: h[day].filter((_, i) => i !== idx) }))
  }
  function pickCategory(c: ListingCategory) {
    if (catMode === 'primary') setPrimaryCat(c)
    else if (catMode === 'additional' && !additionalCats.some((x) => x.name === c.name) && additionalCats.length < 9) setAdditionalCats((a) => [...a, c])
    setCatMode(null); setCatQuery(''); setCatResults([])
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-ink-3 py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading the live Google profile…</div>
  }
  if (connected === false) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        This client has not connected their Google Business Profile yet. Once they connect it in their portal, their live profile shows up here and you can edit it for them.
      </div>
    )
  }
  if (loadErr) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {loadErr}
      </div>
    )
  }

  const attrGroups = [...new Set(attrCatalog.map((a) => a.group))]

  return (
    <div className="space-y-4">
      {/* Save bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">{title ?? 'Google Business Profile'}</h2>
          <p className="text-xs text-ink-3">The live profile, straight from Google. This is the same profile the client sees. Edits here publish to Google.</p>
        </div>
        <div className="flex items-center gap-2.5">
          {savedAt && !dirty && <span className="text-[11px] text-brand-dark inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Saved {savedAt}</span>}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save to Google
          </button>
        </div>
      </div>
      {saveErr && <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{saveErr}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Edit form */}
        <div className="lg:col-span-3 space-y-4">

          <section className="rounded-xl border border-ink-6 bg-white p-4">
            <h3 className="text-sm font-semibold text-ink mb-1">Description</h3>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-ink-4">What the business is, in Google&apos;s About section.</p>
              <span className={`text-[10px] tabular-nums ${description.length > 750 ? 'text-red-600 font-semibold' : 'text-ink-4'}`}>{description.length}/750</span>
            </div>
            <textarea value={description} maxLength={750} onChange={(e) => setDescription(e.target.value)} rows={5} className="w-full rounded-lg border border-ink-6 bg-white px-3 py-2 text-[13px] text-ink resize-none focus:outline-none focus:ring-2 focus:ring-brand/40" />
          </section>

          <section className="rounded-xl border border-ink-6 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-ink-4" /> Phone</h3>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-ink-6 bg-white px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/40" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-ink-4" /> Website</h3>
              <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full rounded-lg border border-ink-6 bg-white px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/40" />
            </div>
          </section>

          <section className="rounded-xl border border-ink-6 bg-white p-4">
            <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-ink-4" /> Categories</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-ink-4 uppercase tracking-wide font-medium w-20">Primary</span>
                {primaryCat ? <span className="rounded-full bg-brand-tint text-brand-dark text-[12px] font-medium px-2.5 py-0.5">{primaryCat.displayName}</span> : <span className="text-[12px] text-ink-4">Not set</span>}
                <button type="button" onClick={() => { setCatMode('primary'); setCatQuery('') }} className="text-[11px] text-brand-dark hover:underline">Change</button>
              </div>
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-[11px] text-ink-4 uppercase tracking-wide font-medium w-20 mt-1">More</span>
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {additionalCats.map((c) => (
                    <span key={c.name} className="inline-flex items-center gap-1 rounded-full bg-bg-2 text-ink-2 text-[12px] px-2.5 py-0.5">
                      {c.displayName}
                      <button type="button" onClick={() => setAdditionalCats((a) => a.filter((x) => x.name !== c.name))}><X className="w-3 h-3 text-ink-4 hover:text-ink" /></button>
                    </span>
                  ))}
                  <button type="button" onClick={() => { setCatMode('additional'); setCatQuery('') }} className="inline-flex items-center gap-0.5 text-[11px] text-brand-dark hover:underline"><Plus className="w-3 h-3" /> Add</button>
                </div>
              </div>
              {catMode && (
                <div className="rounded-lg border border-ink-6 bg-bg-2/50 p-2.5">
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-ink-4" />
                    <input autoFocus value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder={catMode === 'primary' ? 'Search for the primary category' : 'Search for a category to add'} className="flex-1 bg-transparent text-[13px] text-ink focus:outline-none" />
                    {catSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-4" />}
                    <button type="button" onClick={() => { setCatMode(null); setCatQuery('') }}><X className="w-3.5 h-3.5 text-ink-4" /></button>
                  </div>
                  {catResults.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
                      {catResults.map((c) => (
                        <button key={c.name} type="button" onClick={() => pickCategory(c)} className="block w-full text-left rounded px-2 py-1 text-[12px] text-ink-2 hover:bg-white">{c.displayName}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-ink-6 bg-white p-4">
            <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-ink-4" /> Hours</h3>
            {hoursLocked && (
              <div className="mb-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] text-amber-800">
                This listing has overnight hours (past midnight), which this editor cannot save safely yet. Edit hours in the Google dashboard for now; everything else here saves fine.
              </div>
            )}
            <div className="space-y-1.5">
              {DAYS.map(({ key, label }) => (
                <div key={key} className="flex items-start gap-3">
                  <span className="text-[12px] text-ink-3 w-24 pt-1.5">{label}</span>
                  <div className="flex-1 space-y-1">
                    {hours[key].length === 0 && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[12px] text-ink-4">Closed</span>
                        <button type="button" onClick={() => addRange(key)} className="text-[11px] text-brand-dark hover:underline">Set hours</button>
                      </div>
                    )}
                    {hours[key].map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="time" value={p.open} disabled={hoursLocked} onChange={(e) => setDay(key, i, 'open', e.target.value)} className="rounded border border-ink-6 px-2 py-1 text-[12px] text-ink disabled:opacity-50" />
                        <span className="text-[11px] text-ink-4">to</span>
                        <input type="time" value={p.close} disabled={hoursLocked} onChange={(e) => setDay(key, i, 'close', e.target.value)} className="rounded border border-ink-6 px-2 py-1 text-[12px] text-ink disabled:opacity-50" />
                        <button type="button" onClick={() => removeRange(key, i)}><X className="w-3.5 h-3.5 text-ink-4 hover:text-ink" /></button>
                        {i === hours[key].length - 1 && <button type="button" onClick={() => addRange(key)} className="text-[11px] text-brand-dark hover:underline">+ range</button>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {attrCatalog.length > 0 && (
            <section className="rounded-xl border border-ink-6 bg-white p-4">
              <h3 className="text-sm font-semibold text-ink mb-2">Attributes</h3>
              <div className="space-y-3">
                {attrGroups.map((group) => (
                  <div key={group}>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide font-medium mb-1.5">{group}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {attrCatalog.filter((a) => a.group === group).map((a) => {
                        const on = attrValues[a.id] === true
                        return (
                          <button key={a.id} type="button" onClick={() => setAttrValues((v) => ({ ...v, [a.id]: !on }))} className={`rounded-full px-2.5 py-1 text-[12px] border transition-colors ${on ? 'border-brand bg-brand-tint text-brand-dark font-medium' : 'border-ink-6 bg-white text-ink-3 hover:bg-bg-2'}`}>
                            {a.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Preview rail: what the customer sees, straight from the same data */}
        <div className="lg:col-span-2 space-y-4">
          <MobileListingPreview clientId={clientId} />
          {reviewUrl && (
            <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-ink-6 bg-white px-4 py-3 text-sm text-ink-2 hover:bg-bg-2 transition-colors">
              <Link2 className="w-4 h-4 text-ink-4" /> Review request link <ExternalLink className="w-3.5 h-3.5 text-ink-4 ml-auto" />
            </a>
          )}
          {audit.length > 0 && (
            <div className="rounded-xl border border-ink-6 bg-white p-4">
              <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-ink-4" /> Recent changes</h3>
              <div className="space-y-2">
                {audit.map((e) => (
                  <div key={e.id} className="text-[11px]">
                    <span className={e.error ? 'text-red-600' : 'text-ink-2'}>
                      {(e.fields?.changedFields ?? []).join(', ') || e.action}{e.error ? ' (failed)' : ''}
                    </span>
                    <span className="text-ink-4"> · {e.actor_email ?? 'unknown'} · {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
