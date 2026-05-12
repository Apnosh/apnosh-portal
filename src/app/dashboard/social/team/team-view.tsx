'use client'

/**
 * Team view — Section 1 only (Your team).
 *
 * One CTA, one primary card, a grid of standard cards. Each card has
 * an overflow menu with "Request a different {role}" which opens the
 * swap modal.
 */

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  MessageSquare, MoreHorizontal, ExternalLink, EyeOff, ArrowLeftRight,
  Circle, Users, X, Loader2, AlertCircle, Check, Plus, Search, UserPlus,
} from 'lucide-react'
import type { TeamMember } from '@/lib/dashboard/get-team'
import type { AvailableSpecialist } from '@/lib/dashboard/get-available-specialists'
import { ROLE_LABEL } from '@/lib/dashboard/team-labels'

interface Props {
  clientId: string
  team: TeamMember[]
  available: AvailableSpecialist[]
  missingRoles: string[]
}

export default function TeamView({ clientId, team, available, missingRoles }: Props) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)
  const [swapTarget, setSwapTarget] = useState<{ personId: string; role: string; personName: string } | null>(null)
  const [addTarget, setAddTarget] = useState<AvailableSpecialist | null>(null)
  // Section 2 filters (multi-select role, multi-select availability, search)
  const [filterRoles, setFilterRoles] = useState<Set<string>>(new Set())
  const [filterAvail, setFilterAvail] = useState<Set<'available' | 'limited' | 'full'>>(new Set(['available', 'limited']))
  const [search, setSearch] = useState('')
  /* Local "requested" set — once the client taps Request to add, we
     hide that card so they don't tap again. Server is idempotent
     anyway, but the UI feedback matters. */
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())

  const visible = useMemo(() => team.filter(m => !hiddenIds.has(m.personId)), [team, hiddenIds])
  const primary = visible.find(m => m.isPrimaryContact)
  const others = visible.filter(m => !m.isPrimaryContact)

  // Section 2 filtered list. All filters apply client-side; the server
  // pre-filters to active marketplace-relevant capabilities only.
  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase()
    return available
      .filter(s => !requestedIds.has(s.personId))
      .filter(s => filterAvail.has(s.availability))
      .filter(s => {
        if (filterRoles.size === 0) return true
        return s.capabilities.some(c => filterRoles.has(c))
      })
      .filter(s => {
        if (!q) return true
        const haystack = [s.displayName, ...s.specialties, ...s.capabilityLabels].join(' ').toLowerCase()
        return haystack.includes(q)
      })
  }, [available, requestedIds, filterAvail, filterRoles, search])

  const handleAddSent = useCallback((personId: string) => {
    setRequestedIds(prev => new Set(prev).add(personId))
    setAddTarget(null)
  }, [])

  // Suggestion strip: pick up to 3 candidates per missing role.
  const suggestionStrips = useMemo(() => {
    if (missingRoles.length === 0) return []
    return missingRoles
      .map(role => ({
        role,
        candidates: available
          .filter(s => s.capabilities.includes(role) && !requestedIds.has(s.personId))
          .slice(0, 3),
      }))
      .filter(s => s.candidates.length > 0)
  }, [missingRoles, available, requestedIds])

  const messageThreadHref = primary
    ? `/dashboard/messages?to=${primary.personId}`
    : '/dashboard/messages'

  // Empty state — no team yet at all.
  if (team.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 lg:px-6">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Home / Social / Team
        </p>
        <h1 className="text-[28px] sm:text-[34px] leading-[1.1] font-bold text-ink tracking-tight" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
          Your team
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 max-w-2xl leading-relaxed">
          The people producing your content. Message anyone directly, or let {primary?.displayName.split(' ')[0] ?? 'your strategist'} route it.
        </p>
      </header>

      {/* Message your team — recommended channel */}
      <Link
        href={messageThreadHref}
        className="block mb-4 rounded-2xl bg-brand text-white hover:bg-brand-dark transition-colors p-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/15 inline-flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-tight">Message your team</p>
            <p className="text-[12px] opacity-80 mt-0.5 leading-snug">
              {primary
                ? `Default thread goes to ${primary.displayName.split(' ')[0]}. She'll loop in whoever's needed.`
                : 'Reach the whole team in one thread.'}
            </p>
          </div>
          <MessageSquare className="w-4 h-4 opacity-70 flex-shrink-0" />
        </div>
      </Link>

      {/* Primary contact card */}
      {primary && (
        <PrimaryCard
          member={primary}
          menuOpen={openMenuFor === primary.personId}
          onOpenMenu={() => setOpenMenuFor(openMenuFor === primary.personId ? null : primary.personId)}
          onCloseMenu={() => setOpenMenuFor(null)}
          onRequestSwap={(role) => setSwapTarget({ personId: primary.personId, role, personName: primary.displayName })}
          onHide={() => setHiddenIds(s => new Set(s).add(primary.personId))}
        />
      )}

      {/* Standard cards */}
      {others.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {others.map(m => (
            <StandardCard
              key={m.personId}
              member={m}
              menuOpen={openMenuFor === m.personId}
              onOpenMenu={() => setOpenMenuFor(openMenuFor === m.personId ? null : m.personId)}
              onCloseMenu={() => setOpenMenuFor(null)}
              onRequestSwap={(role) => setSwapTarget({ personId: m.personId, role, personName: m.displayName })}
              onHide={() => setHiddenIds(s => new Set(s).add(m.personId))}
            />
          ))}
        </div>
      )}

      {/* ─── Section 2: Available specialists ────────────────────── */}
      <section className="mt-10">
        <header className="mb-3">
          <h2
            className="text-[22px] sm:text-[26px] leading-tight font-bold text-ink tracking-tight"
            style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}
          >
            Add to your team
          </h2>
          <p className="text-[13px] text-ink-2 mt-1.5 max-w-2xl leading-relaxed">
            Specialists {primary?.displayName.split(' ')[0] ?? 'your strategist'} trusts who could fit your account.
          </p>
        </header>

        {/* Suggestion strips for missing roles */}
        {suggestionStrips.length > 0 && (
          <div className="space-y-2 mb-4">
            {suggestionStrips.map(({ role, candidates }) => (
              <div key={role} className="rounded-xl bg-brand/5 ring-1 ring-brand/20 p-3">
                <p className="text-[13px] text-ink-2 leading-snug">
                  You don&rsquo;t have a dedicated <strong>{ROLE_LABEL[role] ?? role}</strong>. Here {candidates.length === 1 ? 'is one' : `are ${candidates.length}`} we&rsquo;d recommend.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidates.map(c => (
                    <button
                      key={c.personId}
                      onClick={() => setAddTarget(c)}
                      className="inline-flex items-center gap-2 bg-white hover:bg-ink-7 ring-1 ring-ink-6 rounded-full pl-1 pr-3 py-1 text-[12px] font-medium text-ink-2"
                    >
                      <Avatar url={c.avatarUrl} name={c.displayName} size={24} />
                      {c.displayName}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, specialty, or role"
              className="w-full text-[13px] pl-8 pr-3 py-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
            />
          </div>
          <FilterChips
            label="Role"
            options={[
              ['strategist', 'Strategist'],
              ['social_media_manager', 'SMM'],
              ['copywriter', 'Copywriter'],
              ['photographer', 'Photographer'],
              ['videographer', 'Videographer'],
              ['editor', 'Video editor'],
              ['ad_buyer', 'Paid media'],
              ['seo_specialist', 'SEO'],
            ]}
            selected={filterRoles}
            onToggle={(k) => setFilterRoles(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next })}
          />
          <FilterChips
            label="Available"
            options={[
              ['available', 'Available'],
              ['limited', 'Limited'],
            ]}
            selected={filterAvail as Set<string>}
            onToggle={(k) => setFilterAvail(prev => {
              const next = new Set(prev) as Set<'available' | 'limited' | 'full'>
              if (next.has(k as 'available' | 'limited' | 'full')) next.delete(k as 'available' | 'limited' | 'full')
              else next.add(k as 'available' | 'limited' | 'full')
              return next
            })}
          />
        </div>

        {filteredAvailable.length === 0 ? (
          <p className="text-[13px] text-ink-3 py-8 text-center bg-white ring-1 ring-ink-6 rounded-2xl">
            {search || filterRoles.size > 0
              ? `No one matches those filters right now. Try broadening, or message ${primary?.displayName.split(' ')[0] ?? 'your strategist'} to source someone specific.`
              : 'No additional specialists available right now.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredAvailable.map(s => (
              <AvailableCard key={s.personId} specialist={s} onRequest={() => setAddTarget(s)} />
            ))}
          </div>
        )}
      </section>

      {swapTarget && (
        <SwapModal
          clientId={clientId}
          target={swapTarget}
          onClose={() => setSwapTarget(null)}
        />
      )}

      {addTarget && (
        <AddSpecialistModal
          clientId={clientId}
          specialist={addTarget}
          onClose={() => setAddTarget(null)}
          onSent={() => handleAddSent(addTarget.personId)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────────────

function avatarFallback(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  if (url) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div
      className="rounded-full bg-ink-7 text-ink-2 font-semibold inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.floor(size * 0.4) }}
    >
      {avatarFallback(name)}
    </div>
  )
}

function PrimaryCard({
  member, menuOpen, onOpenMenu, onCloseMenu, onRequestSwap, onHide,
}: {
  member: TeamMember
  menuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onRequestSwap: (role: string) => void
  onHide: () => void
}) {
  return (
    <article className="rounded-2xl bg-white ring-1 ring-ink-6 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <Avatar url={member.avatarUrl} name={member.displayName} size={80} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-[20px] font-semibold text-ink leading-tight">
              {member.displayName}
            </h2>
            {member.workingNow && (
              <span className="text-[11px] font-medium text-emerald-700 inline-flex items-center gap-1">
                <Circle className="w-2 h-2 fill-emerald-500 stroke-emerald-500" />
                Working now
              </span>
            )}
            {member.swapStatus && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded-full">
                Discussing options
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-3 mb-3">
            {member.roleLabels.join(' · ')}
          </p>
          {member.currentFocus && (
            <p className="text-[14px] text-ink-2 leading-relaxed mb-4 italic">
              &ldquo;{member.currentFocus}&rdquo;
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/messages?to=${member.personId}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-ink hover:bg-ink-2 text-white rounded-lg px-3.5 py-2"
            >
              <MessageSquare className="w-4 h-4" />
              Message
            </Link>
            <div className="relative">
              <button
                onClick={onOpenMenu}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg ring-1 ring-ink-6 text-ink-3 hover:text-ink hover:bg-ink-7"
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <OverflowMenu
                  member={member}
                  onRequestSwap={(role) => { onCloseMenu(); onRequestSwap(role) }}
                  onHide={() => { onCloseMenu(); onHide() }}
                  onClose={onCloseMenu}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function StandardCard({
  member, menuOpen, onOpenMenu, onCloseMenu, onRequestSwap, onHide,
}: {
  member: TeamMember
  menuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onRequestSwap: (role: string) => void
  onHide: () => void
}) {
  return (
    <article className="rounded-2xl bg-white ring-1 ring-ink-6 p-4">
      <div className="flex items-start gap-3">
        <Avatar url={member.avatarUrl} name={member.displayName} size={48} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-ink leading-tight truncate">
            {member.displayName}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {member.roleLabels.map(label => (
              <span key={label} className="text-[10px] font-medium text-ink-3 bg-ink-7 px-1.5 py-0.5 rounded-full">
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={onOpenMenu}
            className="text-ink-3 hover:text-ink p-1 rounded"
            aria-label="More options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <OverflowMenu
              member={member}
              onRequestSwap={(role) => { onCloseMenu(); onRequestSwap(role) }}
              onHide={() => { onCloseMenu(); onHide() }}
              onClose={onCloseMenu}
            />
          )}
        </div>
      </div>

      {member.lastActivityLabel && (
        <p className="text-[11px] text-ink-3 mt-3 leading-relaxed">
          {member.lastActivityLabel}
        </p>
      )}

      {member.swapStatus && (
        <span className="inline-block mt-3 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded-full">
          Discussing options
        </span>
      )}

      <div className="mt-3 flex items-center gap-1">
        <Link
          href={`/dashboard/messages?to=${member.personId}`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink bg-ink-7 hover:bg-ink-6 rounded-md px-2 py-1"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Message
        </Link>
      </div>
    </article>
  )
}

function OverflowMenu({
  member, onRequestSwap, onHide, onClose,
}: {
  member: TeamMember
  onRequestSwap: (role: string) => void
  onHide: () => void
  onClose: () => void
}) {
  return (
    <>
      {/* Click-outside scrim */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-white shadow-lg ring-1 ring-ink-6 z-50 py-1">
        {member.portfolioUrl && (
          <a
            href={member.portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-[12px] text-ink-2 hover:text-ink hover:bg-ink-7"
            onClick={onClose}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View portfolio
          </a>
        )}
        {member.roles.map(role => (
          <button
            key={role}
            onClick={() => onRequestSwap(role)}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-ink-2 hover:text-ink hover:bg-ink-7 text-left"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Request a different {ROLE_LABEL[role] ?? role}
          </button>
        ))}
        <button
          onClick={onHide}
          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-ink-3 hover:text-ink hover:bg-ink-7 text-left"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Hide from team page
        </button>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Swap modal
// ─────────────────────────────────────────────────────────────────────

const REASON_TAGS = [
  { key: 'style', label: 'Different style' },
  { key: 'communication', label: 'Communication' },
  { key: 'responsiveness', label: 'Responsiveness' },
  { key: 'specific_skills', label: 'Specific skills' },
]

function SwapModal({
  clientId, target, onClose,
}: {
  clientId: string
  target: { personId: string; role: string; personName: string }
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [tags, setTags] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const toggleTag = useCallback((key: string) => {
    setTags(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const submit = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/dashboard/team/swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          currentSpecialistId: target.personId,
          currentRole: target.role,
          reason: reason.trim() || null,
          reasonTags: [...tags],
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }, [clientId, target, reason, tags])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:w-[460px] sm:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-ink-6">
          <p className="text-[15px] font-semibold text-ink">
            Let&rsquo;s find a better fit for {ROLE_LABEL[target.role] ?? target.role}
          </p>
          <button onClick={onClose} className="text-ink-4 hover:text-ink" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 inline-flex items-center justify-center mb-3">
              <Check className="w-5 h-5" />
            </div>
            <p className="text-[14px] font-semibold text-ink mb-1">Sent</p>
            <p className="text-[12px] text-ink-3 leading-relaxed">
              Sarah handles the conversation from here.
            </p>
            <button
              onClick={onClose}
              className="mt-4 text-[12px] font-semibold bg-ink text-white rounded-lg px-4 py-2 hover:bg-ink-2"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
                  What are you looking for instead? <span className="text-ink-4 normal-case">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={4}
                  placeholder="A sentence or two on what's not working, or what you'd want instead."
                  className="w-full text-[13px] p-2.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none resize-y leading-relaxed"
                />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-2">
                  Anything specific? <span className="text-ink-4 normal-case">(private)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {REASON_TAGS.map(t => {
                    const on = tags.has(t.key)
                    return (
                      <button
                        key={t.key}
                        onClick={() => toggleTag(t.key)}
                        className={`text-[12px] font-medium rounded-full px-3 py-1 ring-1 transition-colors ${
                          on
                            ? 'bg-ink text-white ring-ink'
                            : 'bg-white text-ink-2 ring-ink-6 hover:ring-ink-4'
                        }`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-ink-4 mt-2 leading-relaxed">
                  Sarah sees this. {target.personName.split(' ')[0]} doesn&rsquo;t.
                </p>
              </div>

              {error && (
                <p className="text-[11px] text-rose-700 inline-flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-3 bg-ink-7/30">
              <button
                onClick={onClose}
                className="text-[13px] font-medium text-ink-3 hover:text-ink px-3 py-2"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="text-[13px] font-semibold bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Send to Sarah
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="max-w-2xl mx-auto py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-ink-7 text-ink-2 mx-auto inline-flex items-center justify-center mb-4">
        <Users className="w-6 h-6" />
      </div>
      <h2
        className="text-[22px] font-semibold text-ink mb-2"
        style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}
      >
        Your team is being assembled
      </h2>
      <p className="text-[13px] text-ink-3 leading-relaxed max-w-md mx-auto">
        Your strategist will introduce everyone within 48 hours of kickoff. You&rsquo;ll see them here as soon as they&rsquo;re on board.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Section 2 sub-components
// ─────────────────────────────────────────────────────────────────────

function FilterChips({
  label, options, selected, onToggle,
}: {
  label: string
  options: [string, string][]
  selected: Set<string>
  onToggle: (key: string) => void
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4 mr-1 hidden sm:inline">
        {label}
      </span>
      {options.map(([k, lbl]) => {
        const on = selected.has(k)
        return (
          <button
            key={k}
            onClick={() => onToggle(k)}
            className={`text-[11px] font-medium rounded-full px-2 py-1 ring-1 transition-colors ${
              on
                ? 'bg-ink text-white ring-ink'
                : 'bg-white text-ink-2 ring-ink-6 hover:ring-ink-4'
            }`}
          >
            {lbl}
          </button>
        )
      })}
    </div>
  )
}

function AvailableCard({
  specialist, onRequest,
}: {
  specialist: AvailableSpecialist
  onRequest: () => void
}) {
  return (
    <article className="rounded-2xl bg-white ring-1 ring-ink-6 p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <Avatar url={specialist.avatarUrl} name={specialist.displayName} size={44} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-ink leading-tight truncate">
            {specialist.displayName}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {specialist.capabilityLabels.slice(0, 2).map(label => (
              <span key={label} className="text-[10px] font-medium text-ink-3 bg-ink-7 px-1.5 py-0.5 rounded-full">
                {label}
              </span>
            ))}
            {specialist.availability === 'limited' && (
              <span className="text-[10px] font-medium text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded-full">
                Limited
              </span>
            )}
          </div>
        </div>
      </div>

      {specialist.bio && (
        <p className="text-[12px] text-ink-2 mt-3 leading-relaxed line-clamp-3">
          {specialist.bio}
        </p>
      )}

      {specialist.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {specialist.specialties.slice(0, 3).map(s => (
            <span key={s} className="text-[10px] font-medium text-brand-dark bg-brand/10 px-1.5 py-0.5 rounded-full">
              {s}
            </span>
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-3 mt-3 leading-snug">
        {specialist.trustSignal}
      </p>

      <div className="mt-auto pt-3 flex items-center gap-2">
        <button
          onClick={onRequest}
          className="flex-1 text-[12px] font-semibold bg-ink text-white rounded-lg px-3 py-1.5 hover:bg-ink-2 inline-flex items-center justify-center gap-1"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Request to add
        </button>
        {specialist.portfolioUrl && (
          <a
            href={specialist.portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg ring-1 ring-ink-6 text-ink-3 hover:text-ink hover:bg-ink-7"
            aria-label="View portfolio"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </article>
  )
}

function AddSpecialistModal({
  clientId, specialist, onClose, onSent,
}: {
  clientId: string
  specialist: AvailableSpecialist
  onClose: () => void
  onSent: () => void
}) {
  /* Roles the client wants this person to play on THEIR account.
     Pre-checks the specialist's primary capability so the common case
     ("yep, that's what I want them for") is one tap. */
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(() => {
    return new Set(specialist.capabilities.slice(0, 1))
  })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const toggleRole = useCallback((role: string) => {
    setSelectedRoles(prev => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }, [])

  const submit = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/dashboard/team/add-specialist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          proposedSpecialistId: specialist.personId,
          proposedRoles: [...selectedRoles],
          note: note.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setDone(true)
      setTimeout(onSent, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }, [clientId, specialist.personId, selectedRoles, note, onSent])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:w-[460px] sm:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-ink-6">
          <p className="text-[15px] font-semibold text-ink">
            Add {specialist.displayName.split(' ')[0]} to your team
          </p>
          <button onClick={onClose} className="text-ink-4 hover:text-ink" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 inline-flex items-center justify-center mb-3">
              <Check className="w-5 h-5" />
            </div>
            <p className="text-[14px] font-semibold text-ink mb-1">Sent</p>
            <p className="text-[12px] text-ink-3 leading-relaxed">
              Your strategist will send a quote shortly.
            </p>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Avatar url={specialist.avatarUrl} name={specialist.displayName} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink leading-tight">{specialist.displayName}</p>
                  <p className="text-[11px] text-ink-3 mt-0.5">{specialist.trustSignal}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
                  What would they do on your account?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {specialist.capabilities.map(role => {
                    const on = selectedRoles.has(role)
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(role)}
                        className={`text-[12px] font-medium rounded-full px-3 py-1 ring-1 transition-colors ${
                          on
                            ? 'bg-ink text-white ring-ink'
                            : 'bg-white text-ink-2 ring-ink-6 hover:ring-ink-4'
                        }`}
                      >
                        {ROLE_LABEL[role] ?? role}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
                  Anything your strategist should know? <span className="text-ink-4 normal-case">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="What you're hoping they can help with."
                  className="w-full text-[13px] p-2.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none resize-y leading-relaxed"
                />
              </div>

              {error && (
                <p className="text-[11px] text-rose-700 inline-flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-3 bg-ink-7/30">
              <button
                onClick={onClose}
                className="text-[13px] font-medium text-ink-3 hover:text-ink px-3 py-2"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || selectedRoles.size === 0}
                className="text-[13px] font-semibold bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Send request
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
