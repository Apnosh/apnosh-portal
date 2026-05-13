'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2, MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ListingFields, WeeklyHours, DayKey } from '@/lib/gbp-listing'

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

  /* Form state — kept separate from the original so we know what
     changed. On save we only PATCH the diff. */
  const [description, setDescription] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [websiteUri, setWebsiteUri] = useState('')
  const [hours, setHours] = useState<WeeklyHours>(emptyHours())

  const [original, setOriginal] = useState<Required<ListingFields> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dashboard/listing')
        const body = await res.json()
        if (!res.ok) {
          setLoadError(body.error || `HTTP ${res.status}`)
          return
        }
        const data = body as { ok: true; title: string | null; fields: Required<ListingFields> }
        setTitle(data.title)
        setDescription(data.fields.description ?? '')
        setPrimaryPhone(data.fields.primaryPhone ?? '')
        setWebsiteUri(data.fields.websiteUri ?? '')
        setHours(data.fields.regularHours ?? emptyHours())
        setOriginal(data.fields)
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
    return out
  }

  async function save() {
    const patch = diffFields()
    if (Object.keys(patch).length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/dashboard/listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const body = await res.json()
      if (!res.ok) {
        setSaveError(body.error || `HTTP ${res.status}`)
        return
      }
      setSavedAt(Date.now())
      setOriginal({
        description, primaryPhone, websiteUri, regularHours: hours,
      })
      /* Clear "Saved" toast after 4 seconds. */
      setTimeout(() => setSavedAt(s => (s && Date.now() - s >= 4000 ? null : s)), 4000)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = Object.keys(diffFields()).length > 0

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
