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
  MessageSquare, MoreHorizontal, ExternalLink, ArrowLeftRight,
  Circle, Users, X, Loader2, AlertCircle, Check, Send, Clock,
} from 'lucide-react'
import type { TeamMember } from '@/lib/dashboard/get-team'
import type { TeamRequest } from '@/lib/dashboard/get-team-requests'
import { ROLE_LABEL } from '@/lib/dashboard/team-labels'

interface Props {
  clientId: string
  team: TeamMember[]
  openRequests: TeamRequest[]
}

export default function TeamView({ clientId, team, openRequests }: Props) {
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)
  const [swapTarget, setSwapTarget] = useState<{ personId: string; role: string; personName: string } | null>(null)

  /* Backend-role hiding: editor, ad_buyer, seo_specialist, designer
     only surface when they have recent activity on the account.
     A restaurant owner doesn't think about their video editor unless
     a reel was just delivered — surfacing them otherwise adds noise. */
  const BACKEND_ROLES = new Set(['editor', 'ad_buyer', 'seo_specialist', 'designer', 'paid_media'])
  const ACTIVITY_RECENCY_MS = 30 * 24 * 60 * 60 * 1000  // 30 days
  const visible = useMemo(() => {
    const now = Date.now()
    return team.filter(m => {
      // Always show client-facing roles + the primary contact.
      if (m.isPrimaryContact) return true
      const isBackendOnly = m.roles.every(r => BACKEND_ROLES.has(r))
      if (!isBackendOnly) return true
      // Backend-only: require recent activity to be visible.
      if (!m.lastActivityAt) return false
      return now - new Date(m.lastActivityAt).getTime() < ACTIVITY_RECENCY_MS
    })
  }, [team])
  const primary = visible.find(m => m.isPrimaryContact)
  const others = visible.filter(m => !m.isPrimaryContact)

  const messageThreadHref = primary
    ? `/dashboard/messages?to=${primary.personId}`
    : '/dashboard/messages'

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 lg:px-6">
      <header className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Home / Team
        </p>
        <h1 className="text-[28px] sm:text-[34px] leading-[1.1] font-bold text-ink tracking-tight" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
          Your team
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 max-w-2xl leading-relaxed">
          {team.length > 0
            ? `The people producing your content. Message anyone directly, or let ${primary?.displayName.split(' ')[0] ?? 'your strategist'} route it.`
            : `Your team is being assembled. ${primary?.displayName.split(' ')[0] ?? 'Your strategist'} will introduce everyone soon.`}
        </p>
      </header>

      {team.length === 0 ? (
        <EmptyTeamInline />
      ) : (
        <>
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
                    ? `Default thread goes to ${primary.displayName.split(' ')[0]}. They'll loop in whoever's needed.`
                    : 'Reach the whole team in one thread.'}
                </p>
              </div>
              <MessageSquare className="w-4 h-4 opacity-70 flex-shrink-0" />
            </div>
          </Link>

          {/* Open requests rail — so the owner knows the loop is moving */}
          {openRequests.length > 0 && (
            <OpenRequestsRail requests={openRequests} />
          )}

          {/* Primary contact card */}
          {primary && (
            <PrimaryCard
              member={primary}
              primaryName={primary.displayName}
              menuOpen={openMenuFor === primary.personId}
              onOpenMenu={() => setOpenMenuFor(openMenuFor === primary.personId ? null : primary.personId)}
              onCloseMenu={() => setOpenMenuFor(null)}
              onRequestSwap={(role) => setSwapTarget({ personId: primary.personId, role, personName: primary.displayName })}
            />
          )}

          {/* Standard cards */}
          {others.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {others.map(m => (
                <StandardCard
                  key={m.personId}
                  member={m}
                  primaryName={primary?.displayName ?? null}
                  menuOpen={openMenuFor === m.personId}
                  onOpenMenu={() => setOpenMenuFor(openMenuFor === m.personId ? null : m.personId)}
                  onCloseMenu={() => setOpenMenuFor(null)}
                  onRequestSwap={(role) => setSwapTarget({ personId: m.personId, role, personName: m.displayName })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer: ongoing-team help. One-off creator bookings live on /dashboard/marketplace. */}
      <div className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Need more help?
        </h2>
        <AskPrompt
          clientId={clientId}
          primaryName={primary?.displayName ?? null}
        />
      </div>

      {swapTarget && (
        <SwapModal
          clientId={clientId}
          target={swapTarget}
          onClose={() => setSwapTarget(null)}
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
  member, primaryName, menuOpen, onOpenMenu, onCloseMenu, onRequestSwap,
}: {
  member: TeamMember
  primaryName: string | null
  menuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onRequestSwap: (role: string) => void
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
                  primaryName={primaryName}
                  onRequestSwap={(role) => { onCloseMenu(); onRequestSwap(role) }}
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
  member, primaryName, menuOpen, onOpenMenu, onCloseMenu, onRequestSwap,
}: {
  member: TeamMember
  primaryName: string | null
  menuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onRequestSwap: (role: string) => void
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
              primaryName={primaryName}
              onRequestSwap={(role) => { onCloseMenu(); onRequestSwap(role) }}
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
  member, primaryName, onRequestSwap, onClose,
}: {
  member: TeamMember
  primaryName: string | null
  onRequestSwap: (role: string) => void
  onClose: () => void
}) {
  const strategistFirst = primaryName?.split(' ')[0] ?? 'your strategist'
  return (
    <>
      {/* Click-outside scrim */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 w-64 rounded-xl bg-white shadow-lg ring-1 ring-ink-6 z-50 py-1">
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
        {/* Softened: framed as raising a need, not firing a person. */}
        {member.roles.map(role => (
          <button
            key={role}
            onClick={() => onRequestSwap(role)}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-ink-2 hover:text-ink hover:bg-ink-7 text-left"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Talk to {strategistFirst} about your {(ROLE_LABEL[role] ?? role).toLowerCase()}
          </button>
        ))}
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
            About your {(ROLE_LABEL[target.role] ?? target.role).toLowerCase()}
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
// Tab nav + empty states
// ─────────────────────────────────────────────────────────────────────

function EmptyTeamInline() {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-ink-6 py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-ink-7 text-ink-2 mx-auto inline-flex items-center justify-center mb-4">
        <Users className="w-6 h-6" />
      </div>
      <h2
        className="text-[18px] font-semibold text-ink mb-1.5"
        style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}
      >
        Your team is being assembled
      </h2>
      <p className="text-[13px] text-ink-3 leading-relaxed max-w-md mx-auto">
        Your strategist will introduce everyone within 48 hours of kickoff. The &ldquo;Need more help?&rdquo; box below lets you tell them what you&rsquo;re hoping for.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Add-to-your-team: conversational prompt
// ─────────────────────────────────────────────────────────────────────

function AskPrompt({
  clientId, primaryName,
}: {
  clientId: string
  primaryName: string | null
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  /* Two forms so we render correctly at sentence start (capitalized
     fallback) and mid-sentence (lowercase fallback). When a real
     strategist name is set, both forms are just the first name. */
  const strategistFirst = primaryName?.split(' ')[0] ?? 'your strategist'
  const StrategistFirst = primaryName?.split(' ')[0] ?? 'Your strategist'

  const submit = useCallback(async () => {
    const m = message.trim()
    if (!m) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/dashboard/team/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, message: m }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setSent(true)
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }, [clientId, message])

  if (sent) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-emerald-200 p-5 text-center">
        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center justify-center mb-2">
          <Check className="w-5 h-5" />
        </div>
        <p className="text-[14px] font-semibold text-ink mb-1">Sent</p>
        <p className="text-[12px] text-ink-3 leading-relaxed max-w-md mx-auto">
          {StrategistFirst} will reply in your thread with the right person and any plan changes — usually within a day.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-3 text-[12px] font-medium text-ink-3 hover:text-ink"
        >
          Send another
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-5">
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={4}
        placeholder={`Examples: "We need more photo content for the patio" · "I want someone to handle TikTok" · "Launching a new menu — who can help?"`}
        className="w-full text-[14px] p-3 rounded-xl ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none resize-y leading-relaxed placeholder:text-ink-4"
      />
      <p className="text-[11px] text-ink-3 mt-2 leading-relaxed">
        {StrategistFirst} replies with a name and tells you upfront if it changes your plan or pricing. No surprises.
      </p>
      {error && (
        <p className="mt-2 text-[11px] text-rose-700 inline-flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center justify-end">
        <button
          onClick={submit}
          disabled={busy || !message.trim()}
          className="text-[13px] font-semibold bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send to {strategistFirst}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Open team-requests rail — closes the loop for the owner
// ─────────────────────────────────────────────────────────────────────

function OpenRequestsRail({ requests }: { requests: TeamRequest[] }) {
  return (
    <div className="mb-4 rounded-2xl bg-ink-7/60 ring-1 ring-ink-6 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2 inline-flex items-center gap-1.5">
        <Clock className="w-3 h-3" />
        Open with your team · {requests.length}
      </p>
      <ul className="space-y-1.5">
        {requests.map(r => {
          const toneClass =
            r.statusTone === 'progress' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
            : r.statusTone === 'warn' ? 'bg-amber-50 text-amber-700 ring-amber-200'
            : 'bg-white text-ink-3 ring-ink-6'
          return (
            <li key={r.id} className="rounded-xl bg-white ring-1 ring-ink-6 p-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink leading-tight">{r.title}</p>
                {r.preview && (
                  <p className="text-[12px] text-ink-3 mt-0.5 leading-snug line-clamp-2 italic">
                    &ldquo;{r.preview}&rdquo;
                  </p>
                )}
                <p className="text-[10px] text-ink-4 mt-1">
                  Sent {new Date(r.requestedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ring-1 flex-shrink-0 whitespace-nowrap ${toneClass}`}>
                {r.statusLabel}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
