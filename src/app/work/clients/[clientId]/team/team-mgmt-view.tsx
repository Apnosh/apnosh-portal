'use client'

/**
 * Staff-facing team management.
 *
 * One screen, two stacked sections:
 *   1. Open swaps — each one has a single "Mark resolved" action
 *   2. Team list — each member has inline editors for current_focus
 *      and a "Primary" toggle (only one per role enforced server-side)
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Check, AlertCircle, Star, ArrowLeftRight, Users } from 'lucide-react'
import type { TeamMember } from '@/lib/dashboard/get-team'
import { ROLE_LABEL } from '@/lib/dashboard/team-labels'

interface OpenSwap {
  id: string
  currentSpecialistId: string
  currentRole: string
  reason: string | null
  reasonTags: string[]
  requestedAt: string
  status: 'open' | 'in_discussion'
}

interface Props {
  clientId: string
  clientName: string
  team: TeamMember[]
  openSwaps: OpenSwap[]
}

export default function TeamMgmtView({ clientId, clientName, team: initialTeam, openSwaps: initialSwaps }: Props) {
  const [team, setTeam] = useState(initialTeam)
  const [swaps, setSwaps] = useState(initialSwaps)
  const [error, setError] = useState<string | null>(null)

  const personName = useCallback((id: string) => {
    return team.find(m => m.personId === id)?.displayName ?? 'Specialist'
  }, [team])

  const resolveSwap = useCallback(async (swapId: string, note: string | null) => {
    setError(null)
    const prev = swaps
    setSwaps(s => s.filter(x => x.id !== swapId))  // optimistic
    try {
      const res = await fetch(`/api/work/clients/${clientId}/swaps/${swapId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolutionNote: note }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
    } catch (e) {
      setSwaps(prev)
      setError(e instanceof Error ? e.message : 'Resolve failed')
    }
  }, [clientId, swaps])

  const setCurrentFocus = useCallback(async (personId: string, role: string, focus: string) => {
    setError(null)
    const prevTeam = team
    setTeam(t => t.map(m => m.personId === personId ? { ...m, currentFocus: focus } : m))
    try {
      const res = await fetch(`/api/work/clients/${clientId}/team`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId, role, currentFocus: focus }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch (e) {
      setTeam(prevTeam)
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }, [clientId, team])

  const setPrimary = useCallback(async (personId: string, role: string) => {
    setError(null)
    const prevTeam = team
    setTeam(t => t.map(m => ({
      ...m,
      // Clear previous primaries that share the same role.
      isPrimaryContact: m.personId === personId
        ? true
        : (m.roles.includes(role) ? false : m.isPrimaryContact),
    })))
    try {
      const res = await fetch(`/api/work/clients/${clientId}/team`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId, role, isPrimaryContact: true }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch (e) {
      setTeam(prevTeam)
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }, [clientId, team])

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6">
      <Link href="/work/clients" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> All clients
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-ink-7 text-ink-2 ring-1 ring-ink-6 flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            {clientName} team
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          Who&rsquo;s on this account. Set the primary contact and the one-liner that shows under their card.
        </p>
      </header>

      {error && (
        <div className="mb-3 flex items-start gap-1.5 text-[12px] text-rose-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Open swaps */}
      {swaps.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 mb-2 inline-flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Open swap requests · {swaps.length}
          </h2>
          <ul className="space-y-2">
            {swaps.map(s => (
              <SwapRow
                key={s.id}
                swap={s}
                personName={personName(s.currentSpecialistId)}
                onResolve={(note) => resolveSwap(s.id, note)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Team list */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
          Team
        </h2>
        {team.length === 0 ? (
          <p className="text-[13px] text-ink-3 py-6 text-center">
            No one is assigned to this client yet. Use the onboarding tools to add the first specialist.
          </p>
        ) : (
          <ul className="space-y-3">
            {team.map(m => (
              <MgmtRow
                key={m.personId}
                member={m}
                onSetCurrentFocus={(focus) => setCurrentFocus(m.personId, m.roles[0], focus)}
                onSetPrimary={() => setPrimary(m.personId, m.roles[0])}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SwapRow({
  swap, personName, onResolve,
}: {
  swap: OpenSwap
  personName: string
  onResolve: (note: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <li className="rounded-2xl bg-amber-50/40 ring-1 ring-amber-200 p-4">
      <p className="text-[14px] font-semibold text-ink leading-tight">
        Swap {ROLE_LABEL[swap.currentRole] ?? swap.currentRole} — {personName}
      </p>
      <p className="text-[10px] text-ink-3 mt-0.5">
        Requested {new Date(swap.requestedAt).toLocaleString()}
      </p>
      {swap.reason && (
        <p className="text-[12px] text-ink-2 mt-2 leading-relaxed italic">
          &ldquo;{swap.reason}&rdquo;
        </p>
      )}
      {swap.reasonTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {swap.reasonTags.map(t => (
            <span key={t} className="text-[10px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3">
        {open ? (
          <div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Optional note for the audit log (e.g. 'Replaced with Marcus on May 15')"
              className="w-full text-[12px] p-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none resize-y"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => { setBusy(true); onResolve(note.trim() || null) }}
                disabled={busy}
                className="text-[12px] font-semibold bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink-2 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Mark resolved
              </button>
              <button onClick={() => setOpen(false)} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="text-[12px] font-semibold text-amber-800 hover:text-amber-900 inline-flex items-center gap-1"
          >
            <Check className="w-3 h-3" />
            Mark resolved
          </button>
        )}
      </div>
    </li>
  )
}

function MgmtRow({
  member, onSetCurrentFocus, onSetPrimary,
}: {
  member: TeamMember
  onSetCurrentFocus: (focus: string) => void
  onSetPrimary: () => void
}) {
  const [focus, setFocus] = useState(member.currentFocus ?? '')
  const [editing, setEditing] = useState(false)
  return (
    <li className="rounded-2xl bg-white ring-1 ring-ink-6 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-ink leading-tight">{member.displayName}</p>
            {member.isPrimaryContact && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-dark bg-brand/10 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5 fill-current" />
                Primary
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-3 mt-0.5">
            {member.roleLabels.join(' · ')}
          </p>
        </div>
        {!member.isPrimaryContact && (
          <button
            onClick={onSetPrimary}
            className="text-[11px] font-semibold text-ink-2 hover:text-ink ring-1 ring-ink-6 rounded-md px-2 py-1 inline-flex items-center gap-1"
            title={`Make primary for ${member.roleLabels[0]}`}
          >
            <Star className="w-3 h-3" />
            Make primary
          </button>
        )}
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1">
          What they&rsquo;re working on
        </p>
        {editing ? (
          <div>
            <textarea
              value={focus}
              onChange={e => setFocus(e.target.value)}
              rows={2}
              placeholder="Drafting the holiday campaign…"
              className="w-full text-[12px] p-2 rounded-lg ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none resize-y"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={() => { onSetCurrentFocus(focus); setEditing(false) }}
                className="text-[11px] font-semibold bg-ink text-white rounded-md px-2.5 py-1 hover:bg-ink-2"
              >
                Save
              </button>
              <button onClick={() => { setFocus(member.currentFocus ?? ''); setEditing(false) }} className="text-[11px] text-ink-3 hover:text-ink px-2 py-1">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-left w-full text-[12px] text-ink-2 hover:text-ink"
          >
            {member.currentFocus
              ? <em>&ldquo;{member.currentFocus}&rdquo;</em>
              : <span className="text-ink-4">Click to set the one-liner that shows on the team page.</span>}
          </button>
        )}
      </div>
    </li>
  )
}
