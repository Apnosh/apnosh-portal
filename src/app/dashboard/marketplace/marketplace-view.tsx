'use client'

/**
 * Marketplace browser. Category tabs along the top, grid of creator
 * cards below, "Book" button on each card opens a request modal.
 *
 * Geographic scope is Washington-only for v1 (filtered server-side).
 * Search + content-style chips apply client-side.
 */

import { useMemo, useState, useCallback } from 'react'
import {
  Search, Sparkles, Camera, Film, ExternalLink, Check, X, Loader2, AlertCircle,
  Calendar as CalendarIcon, Send,
} from 'lucide-react'
import type { MarketplaceCreator, CreatorCategory } from '@/lib/dashboard/get-marketplace'

interface Props {
  clientId: string
  creators: MarketplaceCreator[]
}

type CategoryFilter = 'all' | CreatorCategory

const CATEGORY_TABS: { key: CategoryFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'all', label: 'All creators', icon: Sparkles },
  { key: 'food_influencer', label: 'Food influencers', icon: Sparkles },
  { key: 'photographer', label: 'Photographers', icon: Camera },
  { key: 'videographer', label: 'Videographers', icon: Film },
]

export default function MarketplaceView({ clientId, creators }: Props) {
  const [tab, setTab] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')
  const [activeStyles, setActiveStyles] = useState<Set<string>>(new Set())
  const [bookTarget, setBookTarget] = useState<MarketplaceCreator | null>(null)
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set())

  /* Style chips drawn from the union of all content_style values in
     the current category — so the filter set always matches the
     visible inventory. */
  const allStyles = useMemo(() => {
    const set = new Set<string>()
    for (const c of creators) {
      if (tab !== 'all' && c.category !== tab) continue
      for (const s of c.contentStyle) set.add(s)
    }
    return [...set].sort()
  }, [creators, tab])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return creators.filter(c => {
      if (bookedIds.has(c.personId)) return false
      if (tab !== 'all' && c.category !== tab) return false
      if (activeStyles.size > 0) {
        const hit = c.contentStyle.some(s => activeStyles.has(s))
        if (!hit) return false
      }
      if (q) {
        const haystack = [c.displayName, c.socialHandle ?? '', ...c.contentStyle, c.bio ?? ''].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [creators, tab, activeStyles, search, bookedIds])

  const onBooked = useCallback((personId: string) => {
    setBookedIds(prev => new Set(prev).add(personId))
    setBookTarget(null)
  }, [])

  const countsByCat = useMemo(() => {
    const c: Record<string, number> = { all: creators.length, food_influencer: 0, photographer: 0, videographer: 0, other: 0 }
    for (const cr of creators) c[cr.category] = (c[cr.category] ?? 0) + 1
    return c
  }, [creators])

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 lg:px-6">
      <header className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Home / Marketplace
        </p>
        <h1 className="text-[28px] sm:text-[34px] leading-[1.1] font-bold text-ink tracking-tight" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
          Marketplace
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 max-w-2xl leading-relaxed">
          Book a creator for a one-off. Food influencer to feature your patio. Photographer for a single shoot. Videographer for a launch. Your strategist handles negotiation, scheduling, and payment.
        </p>
        <p className="text-[11px] text-ink-4 mt-2">Washington only for now. More regions coming as we add creators.</p>
      </header>

      {/* Category tabs */}
      <div className="border-b border-ink-6 mb-4 flex items-center gap-1 overflow-x-auto">
        {CATEGORY_TABS.map(t => {
          const active = tab === t.key
          const Icon = t.icon
          const count = countsByCat[t.key] ?? 0
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setActiveStyles(new Set()) }}
              className={`relative px-3 py-2.5 text-[13px] font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              <span className={`text-[11px] font-normal ${active ? 'text-ink-3' : 'text-ink-4'}`}>{count}</span>
              {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink rounded-full" />}
            </button>
          )
        })}
      </div>

      {/* Search + style filters */}
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, handle, or style"
            className="w-full text-[13px] pl-8 pr-3 py-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
          />
        </div>
        {allStyles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allStyles.map(s => {
              const on = activeStyles.has(s)
              return (
                <button
                  key={s}
                  onClick={() => setActiveStyles(prev => {
                    const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next
                  })}
                  className={`text-[11px] font-medium rounded-full px-2 py-1 ring-1 transition-colors ${
                    on
                      ? 'bg-ink text-white ring-ink'
                      : 'bg-white text-ink-2 ring-ink-6 hover:ring-ink-4'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-ink-3 py-12 text-center bg-white ring-1 ring-ink-6 rounded-2xl">
          {creators.length === 0
            ? 'The marketplace is being curated. Check back soon.'
            : 'No creators match those filters. Try broadening, or ask your strategist for a suggestion.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => (
            <CreatorCard key={c.personId} creator={c} onBook={() => setBookTarget(c)} />
          ))}
        </div>
      )}

      {bookTarget && (
        <BookingModal
          clientId={clientId}
          creator={bookTarget}
          onClose={() => setBookTarget(null)}
          onBooked={() => onBooked(bookTarget.personId)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Creator card
// ─────────────────────────────────────────────────────────────────────

function avatarFallback(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function formatFollowers(n: number | null): string | null {
  if (n === null || n === undefined) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${n}`
}

const CATEGORY_LABEL: Record<CreatorCategory, string> = {
  food_influencer: 'Food influencer',
  photographer: 'Photographer',
  videographer: 'Videographer',
  other: 'Creator',
}

function CreatorCard({ creator, onBook }: { creator: MarketplaceCreator; onBook: () => void }) {
  const followers = formatFollowers(creator.followerCount)
  return (
    <article className="rounded-2xl bg-white ring-1 ring-ink-6 p-4 flex flex-col">
      <div className="flex items-start gap-3">
        {creator.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={creator.avatarUrl} alt={creator.displayName} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-ink-7 text-ink-2 inline-flex items-center justify-center text-[13px] font-semibold flex-shrink-0">
            {avatarFallback(creator.displayName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-ink leading-tight truncate">{creator.displayName}</p>
          <p className="text-[11px] text-ink-3 truncate">
            {CATEGORY_LABEL[creator.category]}
            {creator.socialHandle && <> · @{creator.socialHandle}</>}
          </p>
          {followers && (
            <p className="text-[11px] text-ink-3 mt-0.5">{followers} followers</p>
          )}
        </div>
      </div>

      {creator.bio && (
        <p className="text-[12px] text-ink-2 mt-3 leading-relaxed line-clamp-3">
          {creator.bio}
        </p>
      )}

      {creator.contentStyle.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {creator.contentStyle.slice(0, 3).map(s => (
            <span key={s} className="text-[10px] font-medium text-brand-dark bg-brand/10 px-1.5 py-0.5 rounded-full">{s}</span>
          ))}
        </div>
      )}

      {creator.sampleWorkUrls.length > 0 && (
        <div className="flex gap-1 mt-3">
          {creator.sampleWorkUrls.slice(0, 3).map((u, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={i} src={u} alt="Sample" className="w-1/3 aspect-square object-cover rounded-md" />
          ))}
        </div>
      )}

      <div className="mt-3 text-[11px] text-ink-3">
        {creator.typicalRate
          ? <>Typical rate: <span className="text-ink-2 font-medium">{creator.typicalRate}</span></>
          : 'Rate varies by engagement'}
      </div>

      {creator.pastBookings > 0 && (
        <p className="text-[10px] text-ink-4 mt-1.5">
          {creator.pastBookings} Apnosh booking{creator.pastBookings === 1 ? '' : 's'} completed
        </p>
      )}

      <div className="mt-auto pt-3 flex items-center gap-2">
        <button
          onClick={onBook}
          className="flex-1 text-[12px] font-semibold bg-ink text-white rounded-lg px-3 py-1.5 hover:bg-ink-2 inline-flex items-center justify-center gap-1"
        >
          <Send className="w-3.5 h-3.5" />
          Request booking
        </button>
        {creator.socialHandle && creator.socialPlatform === 'instagram' && (
          <a
            href={`https://instagram.com/${creator.socialHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg ring-1 ring-ink-6 text-ink-3 hover:text-ink hover:bg-ink-7"
            aria-label="Open Instagram profile"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Booking modal
// ─────────────────────────────────────────────────────────────────────

const COMP_OPTIONS: { key: 'paid' | 'meal_only' | 'meal_plus_pay' | 'barter' | 'flexible'; label: string; hint: string }[] = [
  { key: 'paid', label: 'Paid', hint: 'A flat fee for the post or shoot' },
  { key: 'meal_only', label: 'Meal only', hint: 'Comp the experience, no cash' },
  { key: 'meal_plus_pay', label: 'Meal + pay', hint: 'Comp plus a smaller fee' },
  { key: 'barter', label: 'Barter / other', hint: 'Trade for something else' },
  { key: 'flexible', label: 'Open — your strategist decides', hint: 'You trust them to pick the right structure' },
]

function BookingModal({
  clientId, creator, onClose, onBooked,
}: {
  clientId: string
  creator: MarketplaceCreator
  onClose: () => void
  onBooked: () => void
}) {
  const [brief, setBrief] = useState('')
  const [comp, setComp] = useState<typeof COMP_OPTIONS[number]['key']>('flexible')
  const [compDetail, setCompDetail] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = useCallback(async () => {
    if (!brief.trim()) { setError('Tell us what the booking is for.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/dashboard/marketplace/book', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          creatorId: creator.personId,
          category: creator.category,
          brief: brief.trim(),
          desiredStart: start || null,
          desiredEnd: end || null,
          compType: comp,
          compDetail: compDetail.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setDone(true)
      setTimeout(onBooked, 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }, [brief, comp, compDetail, start, end, clientId, creator.personId, creator.category, onBooked])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:w-[520px] sm:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-ink-6">
          <p className="text-[15px] font-semibold text-ink">
            Book {creator.displayName}
          </p>
          <button onClick={onClose} className="text-ink-4 hover:text-ink" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {done ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 inline-flex items-center justify-center mb-3">
                <Check className="w-5 h-5" />
              </div>
              <p className="text-[14px] font-semibold text-ink mb-1">Booking request sent</p>
              <p className="text-[12px] text-ink-3 leading-relaxed max-w-md mx-auto">
                Your strategist confirms with {creator.displayName.split(' ')[0]} and sends you a quote with the final terms.
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
                  What&rsquo;s the booking for?
                </label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  rows={3}
                  placeholder="Featuring our new summer menu / shoot the patio reopening / video for grand opening…"
                  className="w-full text-[13px] p-2.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
                    Start date <span className="text-ink-4 normal-case">(optional)</span>
                  </label>
                  <div className="relative">
                    <CalendarIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
                    <input
                      type="date"
                      value={start}
                      onChange={e => setStart(e.target.value)}
                      className="w-full text-[12px] pl-8 pr-2 py-1.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
                    By <span className="text-ink-4 normal-case">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={end}
                    onChange={e => setEnd(e.target.value)}
                    className="w-full text-[12px] px-2.5 py-1.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
                  How are you paying them?
                </p>
                <div className="space-y-1">
                  {COMP_OPTIONS.map(o => {
                    const on = comp === o.key
                    return (
                      <button
                        key={o.key}
                        onClick={() => setComp(o.key)}
                        className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg ring-1 transition-colors ${
                          on
                            ? 'bg-ink text-white ring-ink'
                            : 'bg-white text-ink-2 ring-ink-6 hover:ring-ink-4'
                        }`}
                      >
                        <span className="text-[13px] font-medium leading-tight">{o.label}</span>
                        <span className={`text-[11px] leading-tight ${on ? 'opacity-80' : 'text-ink-4'}`}>
                          {o.hint}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {comp !== 'flexible' && (
                  <input
                    type="text"
                    value={compDetail}
                    onChange={e => setCompDetail(e.target.value)}
                    placeholder="Budget or detail, e.g. '$300 + meal for 2'"
                    className="mt-2 w-full text-[12px] px-2.5 py-1.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
                  />
                )}
              </div>

              {error && (
                <p className="text-[11px] text-rose-700 inline-flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {!done && (
          <div className="flex items-center justify-end gap-2 p-3 bg-ink-7/30 border-t border-ink-6">
            <button onClick={onClose} disabled={busy} className="text-[13px] font-medium text-ink-3 hover:text-ink px-3 py-2">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || !brief.trim()}
              className="text-[13px] font-semibold bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send to your strategist
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
