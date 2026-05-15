'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Save, Loader2, MapPin, AlertTriangle, CheckCircle2, Plus, X, Search, Tag } from 'lucide-react'
import type {
  ListingFields, WeeklyHours, DayKey, SpecialHours, AttributeValues,
  ListingCategories, ListingCategory,
} from '@/lib/gbp-listing'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'
import { useClient } from '@/lib/client-context'
import ConnectEmptyState from '../connect-empty-state'
import MobileListingPreview from '@/components/dashboard/mobile-listing-preview'

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

interface GbpStatus {
  connected: boolean
  v4Enabled?: boolean
  verified?: boolean
  tokenRevoked?: boolean
  locationName?: string | null
  clientId?: string
}

export default function ListingEditor() {
  const { client } = useClient()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [status, setStatus] = useState<GbpStatus>({ connected: true })
  const [statusChecked, setStatusChecked] = useState(false)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null)

  /* Form state — kept separate from the original so we know what
     changed. On save we only PATCH the diff. */
  const [description, setDescription] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [websiteUri, setWebsiteUri] = useState('')
  const [hours, setHours] = useState<WeeklyHours>(emptyHours())
  const [specialHours, setSpecialHours] = useState<SpecialHours>([])
  const [categories, setCategories] = useState<ListingCategories>({ primary: null, additional: [] })
  const [attributes, setAttributes] = useState<AttributeValues>({})
  const [attributeCatalog, setAttributeCatalog] = useState<AttributeCatalogItem[]>([])
  const [originalAttributes, setOriginalAttributes] = useState<AttributeValues>({})

  const [original, setOriginal] = useState<Required<ListingFields> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  /* Load client_locations once so the picker has options. */
  useEffect(() => {
    if (!client?.id) return
    getClientLocations(client.id).then(locs => {
      setLocations(locs)
      /* Default to the location flagged is_primary, or the first one. */
      if (locs.length > 0 && !activeLocationId) {
        const primary = locs.find(l => l.is_primary) ?? locs[0]
        setActiveLocationId(primary.id)
      }
    }).catch(() => { /* leave empty */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id])

  useEffect(() => {
    async function load() {
      /* Wait until the active location is decided. For single-location
         clients the API works with no locationId so we don't block. */
      if (locations.length > 1 && !activeLocationId) return
      const q = activeLocationId ? `?locationId=${encodeURIComponent(activeLocationId)}` : ''
      setLoading(true)
      try {
        const [listingRes, attrRes, statusRes] = await Promise.all([
          fetch(`/api/dashboard/listing${q}`),
          fetch(`/api/dashboard/listing/attributes${q}`),
          fetch('/api/dashboard/gbp/status'),
        ])
        if (statusRes.ok) {
          const s = await statusRes.json() as GbpStatus
          setStatus(s)
          setStatusChecked(true)
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
        setCategories(data.fields.categories ?? { primary: null, additional: [] })
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
  }, [activeLocationId, locations.length])

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
    if (JSON.stringify(original.categories ?? { primary: null, additional: [] }) !== JSON.stringify(categories)) {
      out.categories = categories
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
          body: JSON.stringify({ ...patch, locationId: activeLocationId }),
        }))
      }
      if (attributesChanged) {
        calls.push(fetch('/api/dashboard/listing/attributes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: attributes, locationId: activeLocationId }),
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
        description, primaryPhone, websiteUri, regularHours: hours, specialHours, categories,
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
      <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-10">
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
    /* If the status endpoint says we're not connected, prefer the
       friendly CTA over a raw API error. */
    if (statusChecked && !status.connected) {
      return <ConnectEmptyState context="your listing" />
    }
    return (
      <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-10">
        {/* No back link -- sticky sub-nav has Overview */}
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
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      {/* Header -- matches the portal-wide page-title pattern */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Local SEO
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-ink-4" />
            Your listing
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">
            Changes here update what people see on <strong className="text-ink-2">{title ?? 'your listing'}</strong> in Google Search and Maps.
          </p>
        </div>
          {/* Multi-location clients get a picker to edit any of their
             listings; single-location clients see the legacy "Switch
             listing" button which re-runs the OAuth + picker flow. */}
          {locations.length > 1 ? (
            <select
              value={activeLocationId ?? ''}
              onChange={e => setActiveLocationId(e.target.value || null)}
              className="text-[12px] font-medium text-ink-2 bg-white ring-1 ring-ink-6 hover:ring-ink-4 rounded-full px-3 py-1.5 focus:outline-none focus:ring-ink-3"
            >
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.location_name}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => {
                if (confirm('Pick a different Google listing? You\'ll re-authorize with Google and choose which listing to link.')) {
                  window.location.href = `/api/auth/google-business?clientId=${encodeURIComponent(status.clientId ?? '')}`
                }
              }}
              className="text-[11px] font-medium text-ink-3 hover:text-ink ring-1 ring-ink-6 hover:ring-ink-4 rounded-full px-3 py-1.5"
              title="Re-authorize and link a different listing"
            >
              Switch listing
            </button>
          )}
      </div>

      {/* Token revoked banner — takes precedence over other states
         because nothing else works until the owner re-authenticates. */}
      {statusChecked && status.tokenRevoked && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4.5 h-4.5 text-rose-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed flex-1">
            <p className="font-semibold text-rose-900">Google revoked access</p>
            <p className="text-rose-900/85 mt-1">
              The Google account that connected this listing no longer has manager
              access, or the OAuth grant was revoked. Reconnect to keep syncing
              and editing.
            </p>
          </div>
          <Link
            href={`/api/auth/google-business?clientId=${encodeURIComponent(status.clientId ?? '')}`}
            className="self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700"
          >
            Reconnect
          </Link>
        </div>
      )}

      {/* Verification banner: most write operations require a verified
         listing and Performance API metrics only flow for verified
         listings. We detect "not found" errors on the metrics sync as
         the proxy for unverified status. */}
      {statusChecked && !status.tokenRevoked && status.verified === false && (
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

      {/* Categories — primary + up to 9 additional */}
      <Section
        label="Categories"
        hint="Your primary category is the main label customers see; additional categories help discovery."
      >
        <CategoriesEditor value={categories} onChange={setCategories} />
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

      {/* Mobile preview — "this is what customers see" mockup. */}
      <MobileListingPreview locationId={activeLocationId} />

      {/* Recent edits — surface the audit log so owners + strategists
         can see who changed what when, without having to ask Apnosh
         staff to dig through logs. */}
      <Section
        label="Recent edits"
        hint="Every change made to this listing through the portal."
      >
        <AuditHistory />
      </Section>

      {/* Photos + posts await v4 API approval. Surface clearly so owners
         know they're coming, not missing. */}
      <Section
        label="Photos & posts"
        hint="Photo management and local posts publish to Google through a separate API surface that&apos;s still in review."
      >
        <div className="rounded-2xl border border-ink-6 bg-bg-2/50 px-4 py-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 grid place-items-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Waiting on Google&rsquo;s API approval</p>
            <p className="text-xs text-ink-3 mt-1 leading-relaxed">
              Uploading photos and publishing posts (specials, events, offers) use Google&rsquo;s
              legacy v4 Business Profile API. We&rsquo;ve requested access (case 5-7311000040463) —
              typical turnaround is 7–10 business days. Once approved, both will appear here
              without you needing to do anything.
            </p>
          </div>
        </div>
      </Section>

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

/* Category editor: primary (one) + additional (up to 9). Typeahead
   search hits the v1 categories:search endpoint. Categories share
   shape across the API but their resource names live in a flat
   namespace ("categories/gcid:restaurant") so we just shove them
   into a list and let the user reorder which is primary. */
function CategoriesEditor({ value, onChange }: {
  value: ListingCategories
  onChange: (next: ListingCategories) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ListingCategory[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/dashboard/listing/categories?q=${encodeURIComponent(query.trim())}`)
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (cancelled || !json) return
          setResults(json.categories ?? [])
        })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  function add(cat: ListingCategory) {
    /* Don't add duplicates. If we have no primary yet, fill that
       slot; otherwise it becomes an additional category (up to 9). */
    const all = [
      value.primary,
      ...value.additional,
    ].filter(Boolean) as ListingCategory[]
    if (all.some(c => c.name === cat.name)) return
    if (!value.primary) {
      onChange({ primary: cat, additional: value.additional })
    } else if (value.additional.length < 9) {
      onChange({ primary: value.primary, additional: [...value.additional, cat] })
    }
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function remove(cat: ListingCategory) {
    if (value.primary?.name === cat.name) {
      /* Removing the primary promotes the first additional. */
      const [next, ...rest] = value.additional
      onChange({ primary: next ?? null, additional: rest })
    } else {
      onChange({
        primary: value.primary,
        additional: value.additional.filter(c => c.name !== cat.name),
      })
    }
  }

  function makePrimary(cat: ListingCategory) {
    if (value.primary?.name === cat.name) return
    /* Switching the primary category is the single most ranking-impactful
       edit on a Google listing — it changes which searches surface the
       business and which features Google offers (reservation widgets,
       order links). Worth a one-line confirm so an owner can't fat-finger
       it from "Restaurant" to "Office space." */
    if (value.primary && !confirm(
      `Switch your primary category from "${value.primary.displayName}" to "${cat.displayName}"? This changes which Google searches show your listing and may take a few days to reflect publicly.`
    )) {
      return
    }
    const newAdditional = [
      ...(value.primary ? [value.primary] : []),
      ...value.additional.filter(c => c.name !== cat.name),
    ]
    onChange({ primary: cat, additional: newAdditional })
  }

  const additionalSlotsLeft = 9 - value.additional.length

  return (
    <div className="space-y-3">
      {/* Current categories */}
      <div className="space-y-2">
        {value.primary && (
          <CategoryPill
            cat={value.primary}
            isPrimary
            onRemove={() => remove(value.primary!)}
          />
        )}
        {value.additional.map(c => (
          <CategoryPill
            key={c.name}
            cat={c}
            isPrimary={false}
            onRemove={() => remove(c)}
            onMakePrimary={() => makePrimary(c)}
          />
        ))}
        {!value.primary && value.additional.length === 0 && (
          <p className="text-[12px] text-ink-4 italic">No categories yet — add your first below.</p>
        )}
      </div>

      {/* Add search box */}
      <div className="relative">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={!value.primary
              ? 'Search for your primary category (e.g. Korean restaurant)'
              : `Add another category (up to ${additionalSlotsLeft} more)`}
            disabled={value.primary !== null && additionalSlotsLeft === 0}
            className="w-full text-sm pl-9 pr-3 py-2.5 rounded-lg border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50"
          />
        </div>
        {open && query.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-lg border border-ink-6 bg-white shadow-md z-10">
            {searching && <div className="px-3 py-2 text-[12px] text-ink-4">Searching…</div>}
            {!searching && results.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-ink-4">No matches. Try a different term.</div>
            )}
            {results.map(r => (
              <button
                key={r.name}
                onClick={() => add(r)}
                className="w-full text-left px-3 py-2 text-sm text-ink-2 hover:bg-bg-2 inline-flex items-center gap-2"
              >
                <Tag className="w-3 h-3 text-ink-4" />
                {r.displayName}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryPill({ cat, isPrimary, onRemove, onMakePrimary }: {
  cat: ListingCategory
  isPrimary: boolean
  onRemove: () => void
  onMakePrimary?: () => void
}) {
  return (
    <div className="inline-flex items-center gap-2 text-sm bg-white border border-ink-6 rounded-lg px-3 py-2 w-full">
      <Tag className={`w-3.5 h-3.5 ${isPrimary ? 'text-brand-dark' : 'text-ink-4'}`} />
      <span className={isPrimary ? 'font-semibold text-ink' : 'text-ink-2'}>{cat.displayName}</span>
      {isPrimary ? (
        <span className="text-[10px] uppercase tracking-wider font-bold text-brand-dark bg-brand/15 px-1.5 py-0.5 rounded">Primary</span>
      ) : (
        onMakePrimary && (
          <button onClick={onMakePrimary} className="text-[11px] text-ink-3 hover:text-brand-dark underline">
            Make primary
          </button>
        )
      )}
      <span className="flex-1" />
      <button onClick={onRemove} className="text-ink-4 hover:text-rose-600" title="Remove">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

interface AuditEntry {
  id: string
  actor_email: string | null
  action: string
  fields: unknown
  error: string | null
  created_at: string
}

function actionLabel(action: string): string {
  switch (action) {
    case 'update_listing': return 'Edited listing info'
    case 'update_attributes': return 'Updated attributes'
    case 'update_menu': return 'Edited menu'
    case 'reply_to_review': return 'Replied to review'
    default: return action.replace(/_/g, ' ')
  }
}

function fieldsSummary(fields: unknown): string {
  if (Array.isArray(fields)) return fields.length === 0 ? '' : fields.join(', ')
  if (fields && typeof fields === 'object') {
    const obj = fields as Record<string, unknown>
    return Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  }
  return ''
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function AuditHistory() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/listing/audit')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json) setEntries(json.entries ?? [])
      })
      .catch(() => { /* leave empty */ })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="text-[12px] text-ink-4 italic">Loading history…</p>
  }
  if (entries.length === 0) {
    return <p className="text-[12px] text-ink-4 italic">No edits yet. Changes you save will show up here.</p>
  }

  const visible = expanded ? entries : entries.slice(0, 5)

  return (
    <div className="space-y-1.5">
      {visible.map(e => {
        const summary = fieldsSummary(e.fields)
        return (
          <div key={e.id} className="flex items-start gap-3 text-[12.5px] py-1.5">
            <span className="text-[10.5px] text-ink-4 tabular-nums w-[60px] flex-shrink-0 mt-0.5">
              {relTime(e.created_at)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-ink-2">
                <strong className="text-ink">{actionLabel(e.action)}</strong>
                {summary && <span className="text-ink-3"> · {summary}</span>}
                {e.error && (
                  <span className="ml-1.5 text-[10.5px] uppercase tracking-wider font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                    failed
                  </span>
                )}
              </p>
              <p className="text-[10.5px] text-ink-4 mt-0.5">{e.actor_email ?? 'someone'}</p>
            </div>
          </div>
        )
      })}
      {entries.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[12px] font-medium text-brand-dark hover:text-brand mt-1"
        >
          {expanded ? `Show fewer` : `Show ${entries.length - 5} more`}
        </button>
      )}
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
