/**
 * /admin/strategists — invite + manage strategists.
 *
 * Admin-only. List of active strategists with their assigned-client
 * counts. "Invite strategist" button opens a modal: enter email,
 * multi-select clients to assign as their book, send.
 *
 * Pairs with /api/admin/strategists (GET to list, POST to invite).
 */

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { UserPlus, Loader2, Check, X, Users, Mail, MoreVertical, UserMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Strategist {
  personId: string
  email: string | null
  status: string
  assignedClients: number
  createdAt: string
}

interface ClientRow { id: string; name: string; slug: string }

export default function StrategistsPage() {
  const [list, setList] = useState<Strategist[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [s, c] = await Promise.all([
      fetch('/api/admin/strategists').then(r => r.json()).catch(() => ({ strategists: [] })),
      (async () => {
        const supabase = createClient()
        const { data } = await supabase.from('clients').select('id, name, slug').order('name')
        return (data ?? []) as ClientRow[]
      })(),
    ])
    setList(s.strategists ?? [])
    setClients(c)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="max-w-4xl mx-auto py-7 px-4 lg:px-6">
      <header className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Users className="w-4.5 h-4.5" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Strategists
            </p>
          </div>
          <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
            Manage your strategists
          </h1>
          <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
            Strategists service a book of clients. They sign in to /work/today and see only their assigned ones.
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Invite strategist
        </button>
      </header>

      {loading ? (
        <div className="rounded-2xl border bg-white p-8 text-center" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-ink-4" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState onInvite={() => setInviteOpen(true)} />
      ) : (
        <ul className="space-y-2">
          {list.map(s => <StrategistRow key={s.personId} s={s} onChanged={load} />)}
        </ul>
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

function StrategistRow({ s, onChanged }: { s: Strategist; onChanged: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function remove(hard: boolean) {
    const msg = hard
      ? `Permanently remove ${s.email}? This deletes their strategist role and all client assignments. Cannot be undone.`
      : `Offboard ${s.email}? They keep their account but lose access to all assigned clients.`
    if (!confirm(msg)) return
    setRemoving(true)
    await fetch(`/api/admin/strategists?personId=${encodeURIComponent(s.personId)}${hard ? '&hard=1' : ''}`, {
      method: 'DELETE',
    })
    setRemoving(false)
    setMenuOpen(false)
    onChanged()
  }

  return (
    <li
      className="rounded-2xl border bg-white px-4 py-3 flex items-center justify-between gap-3 relative"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full ring-1 flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
          s.status === 'active'
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
            : 'bg-ink-7 text-ink-4 ring-ink-6'
        }`}>
          {(s.email ?? '?')[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink truncate">{s.email ?? '(unknown email)'}</p>
          <p className="text-[11px] text-ink-4 truncate">
            {s.status === 'active' ? 'Active' : s.status[0].toUpperCase() + s.status.slice(1)}
            {' · '}
            {s.assignedClients} client{s.assignedClients === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div className="relative">
        <button
          onClick={() => setMenuOpen(o => !o)}
          disabled={removing}
          className="p-2 rounded-lg hover:bg-bg-2 text-ink-4 hover:text-ink"
          aria-label="Strategist actions"
        >
          {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-ink-6 shadow-lg z-50 py-1">
              {s.status === 'active' && (
                <button
                  onClick={() => remove(false)}
                  className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-bg-2 inline-flex items-center gap-2"
                >
                  <UserMinus className="w-3.5 h-3.5 text-ink-4" />
                  Offboard
                </button>
              )}
              <button
                onClick={() => remove(true)}
                className="w-full text-left px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
              >
                <X className="w-3.5 h-3.5" />
                Remove permanently
              </button>
            </div>
          </>
        )}
      </div>
    </li>
  )
}

function EmptyState({ onInvite }: { onInvite: () => void }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 ring-1 ring-emerald-100">
        <UserPlus className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">No strategists yet</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed mb-4">
        Invite your first strategist. They&rsquo;ll get a magic link to sign in and see the clients you assign.
      </p>
      <button
        onClick={onInvite}
        className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5"
      >
        <UserPlus className="w-4 h-4" />
        Invite first strategist
      </button>
    </div>
  )
}

function InviteModal({
  clients, onClose, onInvited,
}: {
  clients: ClientRow[]
  onClose: () => void
  onInvited: () => void
}) {
  const [email, setEmail] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
  }, [clients, query])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function submit() {
    if (!email) { setErr('Email required'); return }
    setSending(true); setErr(null)
    const res = await fetch('/api/admin/strategists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, clientIds: Array.from(selected) }),
    })
    setSending(false)
    if (!res.ok) { setErr((await res.json()).error ?? 'failed'); return }
    onInvited()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full my-8 overflow-hidden">
        <div className="p-5 border-b border-ink-6 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Invite strategist</h2>
            <p className="text-[11px] text-ink-4 mt-0.5">They get a magic link to sign in.</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-[12px] font-semibold text-ink-2 mb-1.5 inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Email
            </span>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="strategist@example.com"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3"
            />
          </label>

          <div>
            <p className="text-[12px] font-semibold text-ink-2 mb-1.5">
              Assign clients ({selected.size} selected)
            </p>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search clients"
              className="w-full px-3 py-2 text-sm rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 mb-2"
            />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-ink-6">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-[12px] text-ink-4">No clients match</p>
              ) : (
                filtered.map(c => {
                  const on = selected.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-bg-2 border-b border-ink-7 last:border-0 flex items-center justify-between"
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

          {err && <p className="text-[12px] text-red-600">{err}</p>}
        </div>

        <div className="p-4 border-t border-ink-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[13px] text-ink-3 hover:text-ink px-3 py-2">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={sending || !email}
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
