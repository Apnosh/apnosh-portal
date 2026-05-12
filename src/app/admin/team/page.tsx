/**
 * /admin/team — manage every person across all 17 roles.
 *
 * Replaces /admin/strategists (which was strategist-only). Lists every
 * capability holder, grouped by role category. Invite modal accepts
 * any combination of capabilities + optional client assignments for
 * client-scoped roles.
 */

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  UserPlus, Loader2, Check, X, Mail, MoreVertical, UserMinus, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  ROLES_BY_CAPABILITY, CATEGORY_LABELS, INVITABLE_ROLES,
  type RoleDef, type RoleCategory,
} from '@/lib/roles/catalog'

interface CapabilityRow {
  capability: string
  status: string
  assignedClients: number
}
interface TeamMember {
  personId: string
  email: string | null
  displayName: string | null
  capabilities: CapabilityRow[]
  createdAt: string
}
interface ClientRow { id: string; name: string; slug: string }

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [t, c] = await Promise.all([
      fetch('/api/admin/team').then(r => r.json()).catch(() => ({ team: [] })),
      (async () => {
        const supabase = createClient()
        const { data } = await supabase.from('clients').select('id, name, slug').order('name')
        return (data ?? []) as ClientRow[]
      })(),
    ])
    setTeam(t.team ?? [])
    setClients(c)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return team
    return team.filter(m =>
      m.email?.toLowerCase().includes(q)
      || m.displayName?.toLowerCase().includes(q)
      || m.capabilities.some(c => c.capability.toLowerCase().includes(q))
    )
  }, [team, search])

  const grouped = useMemo(() => {
    const byCat = new Map<RoleCategory, TeamMember[]>()
    for (const m of filtered) {
      const first = m.capabilities[0]
      const role = first ? ROLES_BY_CAPABILITY[first.capability] : undefined
      const cat = (role?.category ?? 'ops') as RoleCategory
      if (!byCat.has(cat)) byCat.set(cat, [])
      byCat.get(cat)!.push(m)
    }
    return byCat
  }, [filtered])

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6">
      <header className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">Team</p>
          <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
            Everyone who can work here
          </h1>
          <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
            Strategists, creatives, contractors, and ops. Invite by email; pick the roles they hold; assign clients where it matters.
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Invite person
        </button>
      </header>

      <div className="mb-5">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or role"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 bg-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-8 text-center" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-ink-4" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState search={search} onInvite={() => setInviteOpen(true)} />
      ) : (
        <div className="space-y-6">
          {(Array.from(grouped.entries()) as Array<[RoleCategory, TeamMember[]]>).map(([cat, members]) => (
            <section key={cat}>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
                {CATEGORY_LABELS[cat]} · {members.length}
              </h2>
              <ul className="space-y-2">
                {members.map(m => <MemberRow key={m.personId} m={m} onChanged={load} />)}
              </ul>
            </section>
          ))}
        </div>
      )}

      {inviteOpen && (
        <InviteModal
          clients={clients}
          onClose={() => setInviteOpen(false)}
          onInvited={() => { setInviteOpen(false); void load() }}
        />
      )}
    </div>
  )
}

function MemberRow({ m, onChanged }: { m: TeamMember; onChanged: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const activeCaps = m.capabilities.filter(c => c.status === 'active')
  const offCaps    = m.capabilities.filter(c => c.status !== 'active')

  async function offboard(capability: string, hard: boolean) {
    const msg = hard
      ? `Permanently remove ${capability} from ${m.email}? Cannot be undone.`
      : `Offboard ${capability} from ${m.email}?`
    if (!confirm(msg)) return
    setBusy(true)
    await fetch(`/api/admin/team?personId=${encodeURIComponent(m.personId)}&capability=${encodeURIComponent(capability)}${hard ? '&hard=1' : ''}`, {
      method: 'DELETE',
    })
    setBusy(false); setMenuOpen(false); onChanged()
  }

  return (
    <li className="rounded-2xl border bg-white px-4 py-3" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-ink-7 text-ink ring-1 ring-ink-6 flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
            {(m.displayName ?? m.email ?? '?')[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink truncate">
              {m.displayName || m.email || '(unknown)'}
            </p>
            {m.displayName && m.email && (
              <p className="text-[11px] text-ink-4 truncate">{m.email}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {activeCaps.map(c => {
                const role = ROLES_BY_CAPABILITY[c.capability]
                return <RoleChip key={c.capability} role={role} count={c.assignedClients} />
              })}
              {offCaps.map(c => (
                <span key={c.capability} className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-7 text-ink-4 line-through">
                  {ROLES_BY_CAPABILITY[c.capability]?.label ?? c.capability}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(o => !o)}
            disabled={busy}
            className="p-2 rounded-lg hover:bg-bg-2 text-ink-4 hover:text-ink"
            aria-label="Manage member"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-ink-6 shadow-lg z-50 py-1.5">
                <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                  Offboard capability
                </p>
                {activeCaps.map(c => (
                  <div key={c.capability} className="flex items-center gap-1 px-1">
                    <button
                      onClick={() => offboard(c.capability, false)}
                      className="flex-1 text-left px-2 py-1.5 text-[12px] text-ink hover:bg-bg-2 rounded inline-flex items-center gap-2"
                    >
                      <UserMinus className="w-3.5 h-3.5 text-ink-4" />
                      {ROLES_BY_CAPABILITY[c.capability]?.label ?? c.capability}
                    </button>
                    <button
                      onClick={() => offboard(c.capability, true)}
                      className="px-2 py-1.5 text-[11px] text-red-600 hover:bg-red-50 rounded"
                      title="Hard delete"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {activeCaps.length === 0 && (
                  <p className="px-3 py-2 text-[12px] text-ink-4">No active capabilities</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

function RoleChip({ role, count }: { role: RoleDef | undefined; count: number }) {
  if (!role) return null
  const a = ACCENT_CLASSES[role.accent]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${a.bg} ${a.text}`}>
      {role.label}
      {role.clientScoped && count > 0 && (
        <span className="text-ink-3 font-normal lowercase">· {count} client{count === 1 ? '' : 's'}</span>
      )}
    </span>
  )
}

function EmptyState({ search, onInvite }: { search: string; onInvite: () => void }) {
  if (search) {
    return (
      <div className="rounded-2xl border-2 border-dashed p-10 text-center bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <p className="text-[14px] font-semibold text-ink leading-tight">No one matches &ldquo;{search}&rdquo;</p>
        <p className="text-[12px] text-ink-3 mt-1.5">Clear the search or invite someone new.</p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border-2 border-dashed p-10 text-center bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 ring-1 ring-emerald-100">
        <UserPlus className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">No team members yet</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed mb-4">
        Invite your first hire. They get a magic link to sign in and land on the workspace for their primary role.
      </p>
      <button onClick={onInvite} className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5">
        <UserPlus className="w-4 h-4" />
        Invite first person
      </button>
    </div>
  )
}

/* ─────────────────────────── Invite modal ─────────────────────────── */

function InviteModal({ clients, onClose, onInvited }: { clients: ClientRow[]; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [caps, setCaps] = useState<Set<string>>(new Set())
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [clientQuery, setClientQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const needsClientPick = useMemo(() => {
    for (const cap of caps) {
      const r = ROLES_BY_CAPABILITY[cap]
      if (r?.clientScoped) return true
    }
    return false
  }, [caps])

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
  }, [clients, clientQuery])

  function toggleCap(cap: string) {
    const next = new Set(caps)
    if (next.has(cap)) next.delete(cap); else next.add(cap)
    setCaps(next)
  }
  function toggleClient(id: string) {
    const next = new Set(selectedClients)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedClients(next)
  }

  async function submit() {
    if (!email) { setErr('Email required'); return }
    if (caps.size === 0) { setErr('Pick at least one role'); return }
    setSending(true); setErr(null)
    const res = await fetch('/api/admin/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        displayName: displayName || undefined,
        capabilities: Array.from(caps),
        clientIds: Array.from(selectedClients),
      }),
    })
    setSending(false)
    if (!res.ok) { setErr((await res.json()).error ?? 'failed'); return }
    onInvited()
  }

  const rolesByCategory = useMemo(() => {
    const map = new Map<RoleCategory, RoleDef[]>()
    for (const r of INVITABLE_ROLES) {
      if (!map.has(r.category)) map.set(r.category, [])
      map.get(r.category)!.push(r)
    }
    return map
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full my-8 overflow-hidden">
        <div className="p-5 border-b border-ink-6 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Invite person</h2>
            <p className="text-[11px] text-ink-4 mt-0.5">They get a magic link to sign in.</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-2 mb-1.5 inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </span>
              <input
                type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)}
                placeholder="person@example.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-2 mb-1.5">Display name (optional)</span>
              <input
                type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Sample Hire"
                className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3"
              />
            </label>
          </div>

          <div>
            <p className="text-[12px] font-semibold text-ink-2 mb-1.5">Roles ({caps.size} selected)</p>
            <p className="text-[11px] text-ink-4 mb-2">Pick one or more. Roles marked &ldquo;client&rdquo; need client assignments below.</p>
            <div className="space-y-3 rounded-lg border border-ink-6 p-2 bg-bg-1">
              {(Array.from(rolesByCategory.entries()) as Array<[RoleCategory, RoleDef[]]>).map(([cat, roles]) => (
                <div key={cat}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 px-1 mb-1">
                    {CATEGORY_LABELS[cat]}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {roles.map(r => (
                      <button
                        key={r.capability}
                        type="button"
                        onClick={() => toggleCap(r.capability)}
                        className={`text-left px-2.5 py-2 rounded text-[12px] border ${
                          caps.has(r.capability)
                            ? 'bg-ink text-white border-ink'
                            : 'bg-white border-ink-6 hover:border-ink-4 text-ink-2'
                        }`}
                      >
                        <span className="font-semibold">{r.label}</span>
                        {r.clientScoped && <span className="ml-1 opacity-70 text-[10px]">· client</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {needsClientPick && (
            <div>
              <p className="text-[12px] font-semibold text-ink-2 mb-1.5">
                Assign clients ({selectedClients.size} selected)
              </p>
              <input
                type="text" value={clientQuery} onChange={e => setClientQuery(e.target.value)}
                placeholder="Search clients"
                className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 mb-2"
              />
              <div className="max-h-44 overflow-y-auto rounded-lg border border-ink-6">
                {filteredClients.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px] text-ink-4">No clients match</p>
                ) : (
                  filteredClients.map(c => {
                    const on = selectedClients.has(c.id)
                    return (
                      <button
                        key={c.id} type="button" onClick={() => toggleClient(c.id)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-bg-2 border-b border-ink-7 last:border-0 flex items-center justify-between"
                      >
                        <span className="text-ink">{c.name}</span>
                        {on
                          ? <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-semibold"><Check className="w-3.5 h-3.5" /> Assigned</span>
                          : <span className="text-[11px] text-ink-4">Tap to assign</span>}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {err && <p className="text-[12px] text-red-600">{err}</p>}
        </div>

        <div className="p-4 border-t border-ink-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[13px] text-ink-3 hover:text-ink px-3 py-2">Cancel</button>
          <button
            onClick={submit}
            disabled={sending || !email || caps.size === 0}
            className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 disabled:opacity-50 text-white text-[13px] font-semibold rounded-xl px-4 py-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Send invite
          </button>
        </div>
      </div>
    </div>
  )
}

const ACCENT_CLASSES: Record<RoleDef['accent'], { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-700' },
  ink:     { bg: 'bg-ink-7',      text: 'text-ink' },
  brand:   { bg: 'bg-brand-tint', text: 'text-brand-dark' },
}
