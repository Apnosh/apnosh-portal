'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2, MapPin, AlertTriangle, CheckCircle2, Plus, X } from 'lucide-react'
import type { ListingFields, WeeklyHours, DayKey, SpecialHours, AttributeValues } from '@/lib/gbp-listing'

interface AttributeCatalogItem {
  id: string
  label: string
  group: string
}

interface LoadedListing {
  title: string | null
  fields: Required<ListingFields>
}

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

function emptyHours(): WeeklyHours {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
}

export default function ListingEditor() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [verified, setVerified] = useState(true)
  const [verifiedChecked, setVerifiedChecked] = useState(false)

  /* Form state — kept separate from the original so we know what
     changed. On save we only PATCH the diff. */
  const [description, setDescription] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [websiteUri, setWebsiteUri] = useState('')
  const [hours, setHours] = useState<WeeklyHours>(emptyHours())
  const [specialHours, setSpecialHours] = useState<SpecialHours>([])
  const [attributes, setAttributes] = useState<AttributeValues>({})
  const [attributeCatalog, setAttributeCatalog] = useState<AttributeCatalogItem[]>([])
  const [originalAttributes, setOriginalAttributes] = useState<AttributeValues>({})

  const [original, setOriginal] = useState<Required<ListingFields> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [listingRes, attrRes, statusRes] = await Promise.all([
          fetch('/api/dashboard/listing'),
          fetch('/api/dashboard/listing/attributes'),
          fetch('/api/dashboard/gbp/status'),
        ])
        if (statusRes.ok) {
          const status = await statusRes.json() as { verified?: boolean }
          setVerified(status.verified !== false)
          setVerifiedChecked(true)
        }
        const listingBody = await listingRes.json()
        if (!listingRes.ok) {
          setLoadError(listingBody.error || `HTTP ${listingRes.status}`)
          return
        }
        const data = listingBody as { ok: true; title: string | null; fields: Required<ListingFields> }
        setTitle(data.title)
        setDescription(data.fields.description ?? '')
        setPrimaryPhone(data.fields.primaryPhone ?? '')
        setWebsiteUri(data.fields.websiteUri ?? '')
        setHours(data.fields.regularHours ?? emptyHours())
        setSpecialHours(data.fields.specialHours ?? [])
        setOriginal(data.fields)

        /* Attributes are a separate API call — render them if they
           loaded, but don't block the page if the call fails (some
           accounts return 404 here). */
        if (attrRes.ok) {
          const attrBody = await attrRes.json() as { values?: AttributeValues; catalog?: AttributeCatalogItem[] }
          const values = attrBody.values ?? {}
          setAttributes(values)
          setOriginalAttributes(values)
          setAttributeCatalog(attrBody.catalog ?? [])
        }
      } catch (err) {
        setLoadError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function diffFields(): ListingFields {
    if (!original) return {}
    const out: ListingFields = {}
    if ((original.description ?? '') !== description) out.description = description
    if ((original.primaryPhone ?? '') !== primaryPhone) out.primaryPhone = primaryPhone
    if ((original.websiteUri ?? '') !== websiteUri) out.websiteUri = websiteUri
    if (JSON.stringify(original.regularHours ?? emptyHours()) !== JSON.stringify(hours)) {
      out.regularHours = hours
    }
    if (JSON.stringify(original.specialHours ?? []) !== JSON.stringify(specialHours)) {
      out.specialHours = specialHours
    }
    return out
  }

  const attributesChanged = JSON.stringify(originalAttributes) !== JSON.stringify(attributes)

  async function save() {
    const patch = diffFields()
    if (Object.keys(patch).length === 0 && !attributesChanged) return

    /* Destructive guard: if the owner is about to clear an existing
       description, double-check. Cleared descriptions are easy to do
       by accident (select-all + delete) and they wipe what customers
       see on Google. */
    if (patch.description !== undefined
        && (patch.description ?? '').trim() === ''
        && (original?.description ?? '').trim() !== ''
        && !confirm('Clear your business description? Customers won\'t see any description on your Google listing until you add a new one.')) {
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const calls: Promise<Response>[] = []
      if (Object.keys(patch).length > 0) {
        calls.push(fetch('/api/dashboard/listing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }))
      }
      if (attributesChanged) {
        calls.push(fetch('/api/dashboard/listing/attributes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: attributes }),
        }))
      }
      const results = await Promise.all(calls)
      for (const res of results) {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setSaveError(body.error || `HTTP ${res.status}`)
          return
        }
      }
      setSavedAt(Date.now())
      setOriginal({
        description, primaryPhone, websiteUri, regularHours: hours, specialHours,
      })
      setOriginalAttributes(attributes)
      /* Clear "Saved" toast after 4 seconds. */
      setTimeout(() => setSavedAt(s => (s && Date.now() - s >= 4000 ? null : s)), 4000)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = Object.keys(diffFields()).length > 0 || attributesChanged

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-ink-6 rounded" />
          <div className="h-32 bg-ink-6 rounded-xl" />
          <div className="h-12 bg-ink-6 rounded-xl" />
          <div className="h-12 bg-ink-6 rounded-xl" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/dashboard/local-seo" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Local SEO
        </Link>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Couldn&rsquo;t load your listing</p>
            <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">{loadError}</p>
            <p className="text-xs text-amber-900/70 mt-2">
              Most often this means the Google Business Profile connection needs a re-sync.
              Try clicking <strong>Sync now</strong> on the Connected Accounts page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div>
        <Link href="/dashboard/local-seo" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Local SEO
        </Link>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center ring-1 ring-emerald-100">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink">Your Google listing</h1>
            <p className="text-sm text-ink-3 mt-1">
              Changes here update what people see on <strong className="text-ink-2">{title ?? 'your listing'}</strong> in Google Search and Maps.
            </p>
          </div>
        </div>
      </div>

      {/* Verification banner: most write operations require a verified
         listing and Performance API metrics only flow for verified
         listings. We detect "not found" errors on the metrics sync as
         the proxy for unverified status. */}
      {verifiedChecked && !verified && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-amber-900">Listing not verified yet</p>
            <p className="text-amber-900/85 mt-1">
              Google reports this listing isn&rsquo;t verified or doesn&rsquo;t have a
              physical address. Edits below will save, but the Performance
              API won&rsquo;t return impression/call data and some changes may
              not show on public search until verification is complete.
              Verify your listing at{' '}
              <a
                href="https://business.google.com/locations"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline hover:text-amber-950"
              >
                business.google.com
              </a>.
            </p>
          </div>
        </div>
      )}

      {/* Description */}
      <Section
        label="Business description"
        hint="Up to 750 characters. Tell people what makes your restaurant worth visiting."
      >
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, 750))}
          rows={4}
          placeholder="e.g. Family-owned Korean BBQ in West Seattle, slow-cooked galbi, daily kimchi made in-house…"
          className="w-full text-sm p-3 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <div className="text-[11px] text-ink-4 mt-1.5 text-right">{description.length} / 750</div>
      </Section>

      {/* Phone + Website */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Section label="Primary phone" hint="Shown to customers who tap “Call.”">
          <input
            type="tel"
            value={primaryPhone}
            onChange={e => setPrimaryPhone(e.target.value)}
            placeholder="(206) 555-0100"
            className="w-full text-sm p-3 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </Section>
        <Section label="Website" hint="The URL where customers should land.">
          <input
            type="url"
            value={websiteUri}
            onChange={e => setWebsiteUri(e.target.value)}
            placeholder="https://your-restaurant.com"
            className="w-full text-sm p-3 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </Section>
      </div>

      {/* Hours */}
      <Section
        label="Regular hours"
        hint="Tap a day to add or change open hours. Empty days are closed."
      >
        <div className="space-y-1.5">
          {DAYS.map(({ key, label }) => (
            <DayRow
              key={key}
              label={label}
              ranges={hours[key]}
              onChange={ranges => setHours(prev => ({ ...prev, [key]: ranges }))}
            />
          ))}
        </div>
      </Section>

      {/* Special hours: holidays, one-off closures, limited holiday menus */}
      <Section
        label="Special hours"
        hint="Override regular hours for one-off dates: holidays, vacations, private events."
      >
        <SpecialHoursEditor value={specialHours} onChange={setSpecialHours} />
      </Section>

      {/* Attributes — service options, amenities, payments. */}
      {attributeCatalog.length > 0 && (
        <Section
          label="Service options & amenities"
          hint="What you offer. Each toggle here is a label customers see on your Google listing."
        >
          <AttributesEditor
            catalog={attributeCatalog}
            values={attributes}
            onChange={setAttributes}
          />
        </Section>
      )}

      {/* Sticky save */}
      <div className="sticky bottom-4 flex items-center justify-end gap-3">
        {saveError && (
          <span className="text-xs text-rose-700 bg-white px-3 py-1.5 rounded-full ring-1 ring-rose-200">
            {saveError}
          </span>
        )}
        {savedAt && !saveError && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-white px-3 py-1.5 rounded-full ring-1 ring-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Saved to Google
          </span>
        )}
        <button
          onClick={save}
          disabled={!hasChanges || saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed shadow"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[11.5px] text-ink-3 mt-0.5">{hint}</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  )
}

/* Group restaurant attributes by their `group` field and render
   each group as a row of toggle pills. Restaurant owners scan these
   fast — single-tap to flip, no save button per pill. */
function AttributesEditor({ catalog, values, onChange }: {
  catalog: AttributeCatalogItem[]
  values: AttributeValues
  onChange: (next: AttributeValues) => void
}) {
  const groups: Record<string, AttributeCatalogItem[]> = {}
  for (const item of catalog) {
    (groups[item.group] = groups[item.group] || []).push(item)
  }
  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 mb-2">{group}</div>
          <div className="flex flex-wrap gap-2">
            {items.map(item => {
              const on = !!values[item.id]
              return (
                <button
                  key={item.id}
                  onClick={() => onChange({ ...values, [item.id]: !on })}
                  className={`text-[12px] rounded-full px-3 py-1.5 border transition-colors ${
                    on
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-ink-2 border-ink-6 hover:border-ink-4'
                  }`}
                >
                  {on && <span className="mr-1">✓</span>}
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* Holiday / one-off closure editor. Each row is a single date with
   either a "Closed" toggle or open/close times. Restaurants typically
   only have a handful of these per year, so we keep the UI simple
   and additive (no date-range; pick one day, add another row if you
   need a multi-day stretch). */
function SpecialHoursEditor({ value, onChange }: {
  value: SpecialHours
  onChange: (next: SpecialHours) => void
}) {
  function addRow() {
    const today = new Date().toISOString().slice(0, 10)
    onChange([...value, { date: today, closed: true }])
  }
  function update(i: number, patch: Partial<SpecialHours[number]>) {
    onChange(value.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i))
  }

  if (value.length === 0) {
    return (
      <button
        onClick={addRow}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-dark hover:text-brand"
      >
        <Plus className="w-3.5 h-3.5" />
        Add a holiday or closure
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {value.map((row, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-bg-2/50 border border-ink-7">
          <input
            type="date"
            value={row.date}
            onChange={e => update(i, { date: e.target.value })}
            className="text-[12px] px-2 py-1 rounded-md border border-ink-6 bg-white"
          />
          <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={row.closed}
              onChange={e => update(i, { closed: e.target.checked })}
              className="rounded border-ink-5 text-brand focus:ring-brand"
            />
            Closed
          </label>
          {!row.closed && (
            <div className="inline-flex items-center gap-1">
              <input
                type="time"
                value={row.open ?? '11:00'}
                onChange={e => update(i, { open: e.target.value })}
                className="text-[12px] px-2 py-1 rounded-md border border-ink-6 bg-white"
              />
              <span className="text-[11px] text-ink-4">→</span>
              <input
                type="time"
                value={row.close ?? '21:00'}
                onChange={e => update(i, { close: e.target.value })}
                className="text-[12px] px-2 py-1 rounded-md border border-ink-6 bg-white"
              />
            </div>
          )}
          <span className="flex-1" />
          <button
            onClick={() => remove(i)}
            className="text-ink-4 hover:text-rose-600"
            title="Remove this entry"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={addRow}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-dark hover:text-brand"
      >
        <Plus className="w-3.5 h-3.5" />
        Add another
      </button>
    </div>
  )
}

function DayRow({ label, ranges, onChange }: {
  label: string
  ranges: Array<{ open: string; close: string }>
  onChange: (ranges: Array<{ open: string; close: string }>) => void
}) {
  const closed = ranges.length === 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[12.5px] text-ink-2 w-24 flex-shrink-0">{label}</span>
      {closed ? (
        <>
          <span className="text-[12px] text-ink-4 italic flex-1">Closed</span>
          <button
            onClick={() => onChange([{ open: '11:00', close: '21:00' }])}
            className="text-[11px] text-brand-dark hover:text-brand font-medium"
          >
            Set hours
          </button>
        </>
      ) : (
        <>
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            {ranges.map((r, i) => (
              <div key={i} className="inline-flex items-center gap-1">
                <input
                  type="time"
                  value={r.open}
                  onChange={e => onChange(ranges.map((x, j) => j === i ? { ...x, open: e.target.value } : x))}
                  className="text-[12px] px-2 py-1 rounded-md border border-ink-6 bg-white"
                />
                <span className="text-[11px] text-ink-4">→</span>
                <input
                  type="time"
                  value={r.close === '24:00' ? '00:00' : r.close}
                  onChange={e => onChange(ranges.map((x, j) => j === i ? { ...x, close: e.target.value } : x))}
                  className="text-[12px] px-2 py-1 rounded-md border border-ink-6 bg-white"
                />
                <button
                  onClick={() => onChange(ranges.filter((_, j) => j !== i))}
                  className="text-[11px] text-ink-4 hover:text-rose-600"
                  title="Remove range"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => onChange([])}
            className="text-[11px] text-ink-4 hover:text-rose-600"
          >
            Close
          </button>
        </>
      )}
    </div>
  )
}
