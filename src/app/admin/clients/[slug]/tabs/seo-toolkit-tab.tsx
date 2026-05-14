'use client'

/**
 * SEO toolkit -- strategist-only operational tools for managing a
 * client's local presence. Currently hosts the schema markup
 * generator; will grow to include NAP citation audit, competitor
 * benchmark, and Q&A monitoring as those ship.
 *
 * Each section is collapsible so a strategist can focus on one job
 * at a time without scrolling past everything else.
 */

import { useEffect, useState } from 'react'
import { Loader2, Code, Copy, Check, ChevronDown, Building2, MessageSquare, Sparkles, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, X, MapPin, HelpCircle } from 'lucide-react'
import { draftRepliesForClient, type DraftReply } from '@/lib/review-draft-replies'
import { getCitationAudits, saveCitationAudit, checkYelpForClient, type CitationPlatform, type CitationAudit, type AuditSummary } from '@/lib/citation-audit'

interface Props { clientId: string }

interface SchemaInput {
  name: string
  description?: string
  phone?: string
  website?: string
  address?: { street: string; locality: string; region: string; postal: string; country: string }
  hours?: Array<{ day: string; opens: string; closes: string }>
  priceRange?: string
  acceptsReservations?: boolean
  servesCuisine?: string
  menuUrl?: string
  rating?: { value: number; count: number }
}

export default function SeoToolkitTab({ clientId }: Props) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">SEO toolkit</h2>
        <p className="text-xs text-ink-3 mt-0.5">
          Operational tools for managing this client&rsquo;s local presence. Strategist-only.
        </p>
      </div>
      <CitationAuditPanel clientId={clientId} />
      <SchemaGenerator clientId={clientId} />
      <ReviewReplyDrafter clientId={clientId} />
      <CompetitorBenchmark clientId={clientId} />
      <QnaMonitor clientId={clientId} />
    </div>
  )
}

const PLATFORMS: Array<{ id: CitationPlatform; label: string; canAutoCheck: boolean; helpUrl?: string }> = [
  { id: 'yelp',        label: 'Yelp',         canAutoCheck: true,  helpUrl: 'https://yelp.com' },
  { id: 'apple_maps',  label: 'Apple Maps',   canAutoCheck: false, helpUrl: 'https://mapsconnect.apple.com' },
  { id: 'facebook',    label: 'Facebook',     canAutoCheck: false, helpUrl: 'https://facebook.com' },
  { id: 'tripadvisor', label: 'TripAdvisor',  canAutoCheck: false, helpUrl: 'https://tripadvisor.com' },
  { id: 'foursquare',  label: 'Foursquare',   canAutoCheck: false, helpUrl: 'https://foursquare.com' },
  { id: 'bbb',         label: 'BBB',          canAutoCheck: false, helpUrl: 'https://bbb.org' },
]

function CitationAuditPanel({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(true)
  const [summary, setSummary] = useState<AuditSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePlatform, setActivePlatform] = useState<CitationPlatform | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getCitationAudits(clientId)
      setSummary(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId])

  if (loading) {
    return (
      <details open className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
        <summary className="px-5 py-3 list-none">
          <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-ink-3" /> Loading citation audit…</div>
        </summary>
      </details>
    )
  }

  if (!summary) return null

  const byPlatform = new Map(summary.audits.map(a => [a.platform, a]))
  const consistentCount = summary.audits.filter(a => a.consistent === true).length
  const totalChecked = summary.audits.length

  return (
    <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer hover:bg-bg-2/40 flex items-center gap-2 list-none">
        <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        <MapPin className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Citation audit (NAP consistency)</h3>
        <span className="text-[11px] text-ink-4">
          {totalChecked === 0 ? 'Not checked yet' : `${consistentCount}/${totalChecked} consistent`}
        </span>
      </summary>
      <div className="border-t border-ink-6 p-5 space-y-4">
        {/* Source NAP */}
        <div className="rounded-xl bg-bg-2/40 border border-ink-7 p-3 text-[12.5px]">
          <p className="text-[10.5px] uppercase tracking-wider font-semibold text-ink-4 mb-1.5">Source of truth (from Google)</p>
          <p><span className="text-ink-4">Name:</span> {summary.source.name || <em className="text-ink-4">none</em>}</p>
          <p><span className="text-ink-4">Address:</span> {summary.source.address || <em className="text-ink-4">none</em>}</p>
          <p><span className="text-ink-4">Phone:</span> {summary.source.phone || <em className="text-ink-4">none</em>}</p>
        </div>

        {/* Platforms table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-bg-2/40 text-left text-[10.5px] uppercase tracking-wider text-ink-4">
              <tr>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last checked</th>
                <th className="px-3 py-2">Issues</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map(p => {
                const a = byPlatform.get(p.id) ?? null
                return (
                  <PlatformRow
                    key={p.id}
                    platform={p}
                    audit={a}
                    clientId={clientId}
                    onChanged={load}
                    active={activePlatform === p.id}
                    setActive={() => setActivePlatform(activePlatform === p.id ? null : p.id)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>

        {error && <p className="text-xs text-rose-700">{error}</p>}
      </div>
    </details>
  )
}

function PlatformRow({
  platform, audit, clientId, onChanged, active, setActive,
}: {
  platform: { id: CitationPlatform; label: string; canAutoCheck: boolean; helpUrl?: string }
  audit: CitationAudit | null
  clientId: string
  onChanged: () => void
  active: boolean
  setActive: () => void
}) {
  const [running, setRunning] = useState(false)

  async function autoCheck() {
    if (!platform.canAutoCheck) return
    setRunning(true)
    try {
      if (platform.id === 'yelp') {
        await checkYelpForClient(clientId, /* will pull from auth inside lib if extended; passing empty for now */ '')
      }
      await onChanged()
    } finally {
      setRunning(false)
    }
  }

  const statusBadge = audit === null
    ? <span className="inline-flex items-center gap-1 text-[11px] text-ink-4"><HelpCircle className="w-3 h-3" /> Not checked</span>
    : audit.consistent === true
      ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><CheckCircle2 className="w-3 h-3" /> Consistent</span>
      : audit.consistent === false
        ? <span className="inline-flex items-center gap-1 text-[11px] text-rose-700"><AlertTriangle className="w-3 h-3" /> Mismatch</span>
        : <span className="inline-flex items-center gap-1 text-[11px] text-amber-700"><HelpCircle className="w-3 h-3" /> No listing found</span>

  return (
    <>
      <tr className="border-t border-ink-7 hover:bg-bg-2/40">
        <td className="px-3 py-2 text-ink-2 font-medium">
          {platform.label}
          {platform.helpUrl && (
            <a href={platform.helpUrl} target="_blank" rel="noreferrer" className="ml-1.5 text-ink-4 hover:text-ink-2">
              <ExternalLink className="w-2.5 h-2.5 inline" />
            </a>
          )}
        </td>
        <td className="px-3 py-2">{statusBadge}</td>
        <td className="px-3 py-2 text-ink-3 text-[11px]">
          {audit?.checkedAt ? new Date(audit.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
        </td>
        <td className="px-3 py-2 text-rose-700 text-[11px]">
          {audit?.inconsistencies?.join(', ') || ''}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="inline-flex gap-1">
            {platform.canAutoCheck && (
              <button
                onClick={autoCheck}
                disabled={running}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
              >
                {running ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                Auto check
              </button>
            )}
            <button
              onClick={setActive}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-ink-3 hover:text-ink ring-1 ring-ink-6"
            >
              {active ? <X className="w-2.5 h-2.5" /> : null}
              {active ? 'Cancel' : audit ? 'Update' : 'Log'}
            </button>
          </div>
        </td>
      </tr>
      {active && (
        <tr>
          <td colSpan={5} className="px-3 pb-3">
            <ManualAuditForm
              platform={platform.id}
              clientId={clientId}
              audit={audit}
              onSaved={() => { setActive(); onChanged() }}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function ManualAuditForm({
  platform, clientId, audit, onSaved,
}: {
  platform: CitationPlatform
  clientId: string
  audit: CitationAudit | null
  onSaved: () => void
}) {
  const [name, setName] = useState(audit?.nameFound ?? '')
  const [address, setAddress] = useState(audit?.addressFound ?? '')
  const [phone, setPhone] = useState(audit?.phoneFound ?? '')
  const [url, setUrl] = useState(audit?.listingUrl ?? '')
  const [notes, setNotes] = useState(audit?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null)
    try {
      const r = await saveCitationAudit(clientId, '', {
        platform,
        listingUrl: url || undefined,
        nameFound: name || undefined,
        addressFound: address || undefined,
        phoneFound: phone || undefined,
        notes: notes || undefined,
      })
      if (!r.ok) throw new Error(r.error)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-ink-6 bg-bg-2/40 p-3 space-y-2 mt-2">
      <p className="text-[11px] text-ink-3">
        Paste what you see on the platform. Inconsistencies vs the source-of-truth NAP will be flagged automatically.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="p-1.5 rounded-md border border-ink-6 bg-white" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="p-1.5 rounded-md border border-ink-6 bg-white" />
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Listing URL" className="p-1.5 rounded-md border border-ink-6 bg-white" />
      </div>
      <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address (one line)" className="w-full p-1.5 rounded-md border border-ink-6 bg-white text-[12px]" />
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" className="w-full p-1.5 rounded-md border border-ink-6 bg-white text-[12px]" />
      <div className="flex items-center justify-end gap-2">
        {error && <span className="text-[11px] text-rose-700">{error}</span>}
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  )
}

function QnaMonitor({ clientId }: { clientId: string }) {
  /* Q&A monitoring is gated on v4 access. Until that approves we
     surface a deep link to the public Maps Q&A panel so the
     strategist still has a one-click jumping-off point. */
  void clientId
  return (
    <details className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer hover:bg-bg-2/40 flex items-center gap-2 list-none">
        <ChevronDown className="w-4 h-4 text-ink-3" />
        <MessageSquare className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Q&amp;A monitoring</h3>
        <span className="text-[11px] text-ink-4">Waiting on v4 approval</span>
      </summary>
      <div className="border-t border-ink-6 p-5 text-[12.5px] text-ink-3">
        <p>
          The Google Q&amp;A panel API is part of v4 (case #5-7311000040463). Until v4 approves, monitor manually by searching the business on Google Maps and tapping <strong>Questions and Answers</strong>. We&rsquo;ll auto-poll for new questions and surface them here the moment v4 access lands.
        </p>
      </div>
    </details>
  )
}

function CompetitorBenchmark({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<BenchmarkResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/competitor-benchmark`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setData(body as BenchmarkResponse)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer hover:bg-bg-2/40 flex items-center gap-2 list-none">
        <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        <Building2 className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Competitor benchmark</h3>
        <span className="text-[11px] text-ink-4">Side-by-side with nearby restaurants in the same category</span>
      </summary>
      <div className="border-t border-ink-6 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-3 flex-1">
            Looks up the client&rsquo;s own listing and surfaces nearby competitors in the same primary category. Strategy use only — surface gaps in photo count, review count, attributes.
          </p>
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loading ? 'Loading…' : data ? 'Refresh' : 'Run benchmark'}
          </button>
        </div>
        {error && <p className="text-xs text-rose-700">{error}</p>}
        {data?.requiresSetup && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
            <p className="font-semibold">Places API not enabled</p>
            <p className="mt-1">
              To auto-discover nearby competitors, enable the Google <strong>Places API (New)</strong> in your GCP project ({data.projectId}) and set <code className="bg-amber-100 px-1 py-0.5 rounded">PLACES_API_KEY</code> in env. Free tier covers ~10k lookups/month.
            </p>
          </div>
        )}
        {data && !data.requiresSetup && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg-2/40 text-left text-[10.5px] uppercase tracking-wider text-ink-4">
                <tr>
                  <th className="px-3 py-2">Restaurant</th>
                  <th className="px-3 py-2 text-right">Rating</th>
                  <th className="px-3 py-2 text-right">Reviews</th>
                  <th className="px-3 py-2 text-right">Distance</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-ink-7 ${r.isClient ? 'bg-brand-tint/30 font-medium' : ''}`}>
                    <td className="px-3 py-2 text-ink-2">{r.name} {r.isClient && <span className="text-[10px] text-brand-dark">YOU</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rating?.toFixed(1) ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.reviewCount?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-ink-3">{r.distance ?? '—'}</td>
                    <td className="px-3 py-2 text-ink-3">{r.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  )
}

interface BenchmarkRow {
  name: string
  rating: number | null
  reviewCount: number | null
  distance: string | null
  isClient: boolean
  notes?: string
}
interface BenchmarkResponse {
  rows: BenchmarkRow[]
  requiresSetup?: boolean
  projectId?: string
}

function ReviewReplyDrafter({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<DraftReply[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    setDrafts(null)
    try {
      const result = await draftRepliesForClient(clientId, { limit: 8 })
      setDrafts(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function copy(d: DraftReply) {
    await navigator.clipboard.writeText(d.reply)
    setCopiedId(d.reviewId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer hover:bg-bg-2/40 flex items-center gap-2 list-none">
        <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        <MessageSquare className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">AI reply drafter</h3>
        <span className="text-[11px] text-ink-4">Generates ready-to-edit replies for unanswered reviews</span>
      </summary>
      <div className="border-t border-ink-6 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-3 flex-1">
            Pulls the latest 8 unanswered reviews with text and drafts an in-voice reply for each. You edit + send via the existing review reply flow.
          </p>
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
          >
            {loading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : drafts ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
            {loading ? 'Drafting…' : drafts ? 'Regenerate' : 'Generate drafts'}
          </button>
        </div>

        {error && <p className="text-xs text-rose-700">{error}</p>}

        {drafts && drafts.length === 0 && (
          <p className="text-xs text-ink-3">No unanswered reviews with text right now. Nothing to draft.</p>
        )}

        {drafts && drafts.length > 0 && (
          <ul className="space-y-3">
            {drafts.map(d => (
              <li key={d.reviewId} className="rounded-xl border border-ink-6 bg-bg-2/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12.5px] text-ink-2 leading-relaxed flex-1 whitespace-pre-wrap">{d.reply}</p>
                  <button
                    onClick={() => copy(d)}
                    className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink px-2 py-1 rounded-full ring-1 ring-ink-6"
                  >
                    {copiedId === d.reviewId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedId === d.reviewId ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10.5px] text-ink-4 mt-1.5">Review {d.reviewId.slice(0, 8)}…</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

function SchemaGenerator({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState<SchemaInput | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/clients/${clientId}/schema-input`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return j as SchemaInput
      })
      .then(d => { if (!cancelled) setInput(d) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clientId])

  const jsonLd = input ? buildJsonLd(input) : ''

  async function copy() {
    if (!jsonLd) return
    await navigator.clipboard.writeText(jsonLd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer hover:bg-bg-2/40 flex items-center gap-2 list-none">
        <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        <Code className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Schema markup generator</h3>
        <span className="text-[11px] text-ink-4">LocalBusiness JSON-LD for the client&rsquo;s website</span>
      </summary>
      <div className="border-t border-ink-6 p-5 space-y-3">
        <p className="text-xs text-ink-3">
          Paste this into the <code className="px-1 py-0.5 rounded bg-bg-2 text-[11px]">&lt;head&gt;</code> of the client&rsquo;s homepage. Google reads it for rich snippets (stars, hours, menu) on Search results.
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-3 py-6 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading listing fields…
          </div>
        )}
        {error && <p className="text-xs text-rose-700">{error}</p>}
        {input && (
          <>
            <div className="rounded-lg bg-ink-7 p-4 max-h-[400px] overflow-auto">
              <pre className="text-[11.5px] text-ink-2 font-mono whitespace-pre-wrap">{jsonLd}</pre>
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy JSON-LD'}
              </button>
              <a
                href={`https://search.google.com/test/rich-results?utm_source=apnosh&code=${encodeURIComponent(jsonLd)}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3 hover:text-ink"
              >
                <Building2 className="w-3 h-3" />
                Validate in Rich Results Test
              </a>
            </div>
          </>
        )}
      </div>
    </details>
  )
}

function buildJsonLd(input: SchemaInput): string {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: input.name,
  }
  if (input.description) ld.description = input.description
  if (input.phone) ld.telephone = input.phone
  if (input.website) ld.url = input.website
  if (input.address) {
    ld.address = {
      '@type': 'PostalAddress',
      streetAddress: input.address.street,
      addressLocality: input.address.locality,
      addressRegion: input.address.region,
      postalCode: input.address.postal,
      addressCountry: input.address.country,
    }
  }
  if (input.hours && input.hours.length > 0) {
    ld.openingHoursSpecification = input.hours.map(h => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.day,
      opens: h.opens,
      closes: h.closes,
    }))
  }
  if (input.servesCuisine) ld.servesCuisine = input.servesCuisine
  if (input.priceRange) ld.priceRange = input.priceRange
  if (input.acceptsReservations !== undefined) ld.acceptsReservations = input.acceptsReservations
  if (input.menuUrl) ld.menu = input.menuUrl
  if (input.rating && input.rating.count > 0) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.rating.value,
      reviewCount: input.rating.count,
    }
  }
  return JSON.stringify(ld, null, 2)
}
