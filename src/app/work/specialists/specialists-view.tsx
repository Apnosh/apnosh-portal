'use client'

/**
 * Specialists directory — list + inline edit.
 *
 * Click a row to expand the editor. Save fires PATCH /api/work/specialists/[id]
 * which writes profiles + person_capabilities. New specialist invite at the
 * top opens a tiny modal that creates an auth.users row + profile via the
 * admin endpoint, then drops the user on edit so they can fill in
 * bio / specialties / capabilities immediately.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  Users, Search, AlertCircle, Loader2, ChevronDown, ChevronUp, ExternalLink, Check,
  Mail, Plus, X, Save,
} from 'lucide-react'
import type { SpecialistRow } from '@/lib/work/get-specialists'
import { ROLE_LABEL } from '@/lib/dashboard/team-labels'

/* Capability picker uses these as the universe of toggles. Mirrors
   get-specialists.ts. */
const SPECIALIST_CAPS: { key: string; label: string }[] = [
  { key: 'strategist', label: 'Strategist' },
  { key: 'social_media_manager', label: 'Social Media Manager' },
  { key: 'copywriter', label: 'Copywriter' },
  { key: 'photographer', label: 'Photographer' },
  { key: 'videographer', label: 'Videographer' },
  { key: 'editor', label: 'Video Editor' },
  { key: 'designer', label: 'Designer' },
  { key: 'community_mgr', label: 'Community Manager' },
  { key: 'ad_buyer', label: 'Paid Media Specialist' },
  { key: 'seo_specialist', label: 'SEO Specialist' },
  { key: 'influencer', label: 'Influencer Partner' },
  { key: 'onboarder', label: 'Onboarder' },
]

const AVAILABILITY_OPTIONS: { key: 'available' | 'limited' | 'full'; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'limited', label: 'Limited' },
  { key: 'full', label: 'Full' },
]

export default function SpecialistsView({ specialists: initial }: { specialists: SpecialistRow[] }) {
  const [specialists, setSpecialists] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCap, setFilterCap] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return specialists.filter(s => {
      if (filterCap && !s.capabilities.includes(filterCap)) return false
      if (!q) return true
      return [s.displayName, s.email, ...s.specialties, ...s.capabilityLabels].join(' ').toLowerCase().includes(q)
    })
  }, [specialists, search, filterCap])

  const updateLocal = useCallback((personId: string, patch: Partial<SpecialistRow>) => {
    setSpecialists(prev => prev.map(s => s.personId === personId ? { ...s, ...patch } : s))
  }, [])

  const handleInvited = useCallback((row: SpecialistRow) => {
    setSpecialists(prev => [row, ...prev])
    setExpanded(row.personId)
    setInviteOpen(false)
  }, [])

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            Specialists
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          Everyone with a specialist hat. Edits here flow into clients&rsquo; Marketplace tab in real time.
        </p>
      </header>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, specialty, or role"
            className="w-full text-[13px] pl-8 pr-3 py-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
          />
        </div>
        <select
          value={filterCap ?? ''}
          onChange={e => setFilterCap(e.target.value || null)}
          className="text-[13px] px-2.5 py-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none bg-white"
        >
          <option value="">All roles</option>
          {SPECIALIST_CAPS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button
          onClick={() => setInviteOpen(true)}
          className="text-[13px] font-semibold bg-ink text-white rounded-lg px-3 py-2 hover:bg-ink-2 inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Invite specialist
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-ink-3 py-12 text-center bg-white ring-1 ring-ink-6 rounded-2xl">
          {specialists.length === 0
            ? 'No specialists yet. Invite the first one to get started.'
            : 'No specialists match those filters.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(s => (
            <SpecialistRowItem
              key={s.personId}
              row={s}
              expanded={expanded === s.personId}
              onToggle={() => setExpanded(expanded === s.personId ? null : s.personId)}
              onPatched={(patch) => updateLocal(s.personId, patch)}
            />
          ))}
        </ul>
      )}

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onInvited={handleInvited}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// One row + inline editor
// ─────────────────────────────────────────────────────────────────────

function SpecialistRowItem({
  row, expanded, onToggle, onPatched,
}: {
  row: SpecialistRow
  expanded: boolean
  onToggle: () => void
  onPatched: (patch: Partial<SpecialistRow>) => void
}) {
  return (
    <li className="rounded-2xl bg-white ring-1 ring-ink-6">
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start gap-3 p-4 hover:bg-ink-7/30 transition-colors rounded-2xl"
      >
        {row.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={row.avatarUrl} alt={row.displayName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-ink-7 text-ink-2 inline-flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
            {row.displayName.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-ink leading-tight">{row.displayName}</p>
            <span className="text-[11px] text-ink-4">{row.email}</span>
            <AvailabilityChip status={row.availability} />
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {row.capabilityLabels.length === 0
              ? <span className="text-[10px] text-ink-4 italic">No capabilities set yet</span>
              : row.capabilityLabels.map(l => (
                <span key={l} className="text-[10px] font-medium text-ink-3 bg-ink-7 px-1.5 py-0.5 rounded-full">{l}</span>
              ))}
          </div>
          <p className="text-[10px] text-ink-3 mt-1.5">
            {row.activeAssignments === 0
              ? 'No active assignments'
              : `${row.activeAssignments} active assignment${row.activeAssignments === 1 ? '' : 's'}${row.assignedClientNames.length > 0 ? ' · ' + row.assignedClientNames.slice(0, 3).join(', ') + (row.assignedClientNames.length > 3 ? '…' : '') : ''}`}
          </p>
        </div>
        <div className="text-ink-3 flex-shrink-0 p-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && <Editor row={row} onPatched={onPatched} />}
    </li>
  )
}

function AvailabilityChip({ status }: { status: SpecialistRow['availability'] }) {
  const cls =
    status === 'available' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : status === 'limited' ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-ink-7 text-ink-3 ring-ink-6'
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ring-1 ${cls}`}>
      {status}
    </span>
  )
}

function Editor({ row, onPatched }: { row: SpecialistRow; onPatched: (patch: Partial<SpecialistRow>) => void }) {
  const [bio, setBio] = useState(row.bio ?? '')
  const [portfolio, setPortfolio] = useState(row.portfolioUrl ?? '')
  const [specialtiesText, setSpecialtiesText] = useState(row.specialties.join(', '))
  const [availability, setAvailability] = useState(row.availability)
  const [caps, setCaps] = useState<Set<string>>(new Set(row.capabilities))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const toggleCap = useCallback((key: string) => {
    setCaps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const save = useCallback(async () => {
    setBusy(true); setError(null); setSaved(false)
    try {
      const specialties = specialtiesText.split(',').map(s => s.trim()).filter(Boolean)
      const res = await fetch(`/api/work/specialists/${row.personId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bio: bio.trim() || null,
          portfolioUrl: portfolio.trim() || null,
          specialties,
          availability,
          capabilities: [...caps],
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      onPatched({
        bio: bio.trim() || null,
        portfolioUrl: portfolio.trim() || null,
        specialties,
        availability,
        capabilities: [...caps],
        capabilityLabels: [...caps].map(c => ROLE_LABEL[c] ?? c),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }, [bio, portfolio, specialtiesText, availability, caps, onPatched, row.personId])

  return (
    <div className="border-t border-ink-6 p-4 space-y-3 bg-ink-7/20">
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          rows={2}
          placeholder="One or two sentences in their voice."
          className="w-full text-[13px] p-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none resize-y"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1">
            Portfolio URL
          </label>
          <input
            type="url"
            value={portfolio}
            onChange={e => setPortfolio(e.target.value)}
            placeholder="https://…"
            className="w-full text-[13px] px-2.5 py-1.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1">
            Availability
          </label>
          <select
            value={availability}
            onChange={e => setAvailability(e.target.value as SpecialistRow['availability'])}
            className="w-full text-[13px] px-2.5 py-1.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none bg-white"
          >
            {AVAILABILITY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1">
          Specialties <span className="text-ink-4 normal-case">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={specialtiesText}
          onChange={e => setSpecialtiesText(e.target.value)}
          placeholder="TikTok native, food photography, Vietnamese-language captions"
          className="w-full text-[13px] px-2.5 py-1.5 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
        />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1">
          Capabilities <span className="text-ink-4 normal-case">(what they can do)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SPECIALIST_CAPS.map(c => {
            const on = caps.has(c.key)
            return (
              <button
                key={c.key}
                onClick={() => toggleCap(c.key)}
                className={`text-[12px] font-medium rounded-full px-3 py-1 ring-1 transition-colors ${
                  on
                    ? 'bg-ink text-white ring-ink'
                    : 'bg-white text-ink-2 ring-ink-6 hover:ring-ink-4'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-rose-700 inline-flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="text-[13px] font-semibold bg-brand text-white rounded-lg px-4 py-1.5 hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        {saved && (
          <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
            <Check className="w-3 h-3" />
            Saved
          </span>
        )}
        {row.portfolioUrl && (
          <a
            href={row.portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-ink-3 hover:text-ink inline-flex items-center gap-1 ml-auto"
          >
            <ExternalLink className="w-3 h-3" />
            View portfolio
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Invite modal
// ─────────────────────────────────────────────────────────────────────

function InviteModal({
  onClose, onInvited,
}: {
  onClose: () => void
  onInvited: (row: SpecialistRow) => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/work/specialists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      onInvited(j.specialist as SpecialistRow)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setBusy(false)
    }
  }, [email, fullName, onInvited])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:w-[460px] sm:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-ink-6">
          <p className="text-[15px] font-semibold text-ink">Invite a specialist</p>
          <button onClick={onClose} className="text-ink-4 hover:text-ink" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="sarah@apnosh.com"
                className="w-full text-[13px] pl-8 pr-3 py-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
              Full name <span className="text-ink-4 normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Sarah Nguyen"
              className="w-full text-[13px] px-2.5 py-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none"
            />
          </div>
          <p className="text-[11px] text-ink-3 leading-relaxed">
            Sends a magic-link email so they can set their password. After invite, set their bio + capabilities here.
          </p>
          {error && (
            <p className="text-[11px] text-rose-700 inline-flex items-start gap-1">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-3 bg-ink-7/30">
          <button onClick={onClose} disabled={busy} className="text-[13px] font-medium text-ink-3 hover:text-ink px-3 py-2">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !email.trim()}
            className="text-[13px] font-semibold bg-brand text-white rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            Send invite
          </button>
        </div>
      </div>
    </div>
  )
}
