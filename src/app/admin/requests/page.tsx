'use client'

/**
 * /admin/requests — the creative request queue (team side).
 *
 * Every owner request lands here the moment it is sent (staff are notified too).
 * The team reads the brief and the owner's files, writes the reply, sets the
 * quote amount, and moves the status; the owner's yes flips it to in-progress
 * and mints the work order. Open view sorts by the owner's due date (soonest
 * first, dateless last) with overdue/this-week badges, so a "this week" job can
 * never hide under newer no-rush rows. Claim marks who owns it.
 *
 * Reads go through the browser client (RLS: admin policy); writes go through the
 * API so the owner notification can never be skipped.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Inbox, Loader2, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  REQUEST_TYPES, REQUEST_STATUSES, STATUS_LABEL, requestTypeById, questionsFor,
  type RequestStatus,
} from '@/lib/requests/catalog'

interface NoteRow {
  id: string
  author_role: 'team' | 'owner'
  body: string
  created_at: string
}

interface Row {
  id: string
  client_id: string
  type: string
  brief: Record<string, string>
  status: RequestStatus
  team_note: string | null
  created_at: string
  updated_at: string
  due_date?: string | null
  attachments?: { url: string; name: string }[] | null
  quote_cents?: number | null
  assigned_to?: string | null
  assigned_name?: string | null
  accepted_at?: string | null
  work_order_id?: string | null
  notes?: NoteRow[] | null
  clients: { name: string | null } | null
}

const STATUS_CLASS: Record<RequestStatus, string> = {
  requested: 'bg-amber-50 text-amber-700',
  in_review: 'bg-blue-50 text-blue-700',
  quoted: 'bg-violet-50 text-violet-700',
  in_progress: 'bg-emerald-50 text-emerald-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-50 text-gray-500',
  declined: 'bg-red-50 text-red-600',
}

const OPEN_STATUSES: RequestStatus[] = ['requested', 'in_review', 'quoted', 'in_progress', 'delivered']

const V2_SELECT = 'id, client_id, type, brief, status, team_note, created_at, updated_at, due_date, attachments, quote_cents, assigned_to, assigned_name, accepted_at, work_order_id, notes:creative_request_notes(id, author_role, body, created_at), clients(name)'
const V1_SELECT = 'id, client_id, type, brief, status, team_note, created_at, updated_at, clients(name)'

/** Due-date urgency: how the queue keeps "this week" jobs on top and visible. */
function dueBadge(due: string | null | undefined, todayISO: string): { label: string; cls: string } | null {
  if (!due) return null
  const label = new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (due < todayISO) return { label: `Overdue · ${label}`, cls: 'bg-red-50 text-red-600' }
  const week = new Date(`${todayISO}T00:00:00`); week.setDate(week.getDate() + 7)
  if (due <= week.toISOString().slice(0, 10)) return { label: `Due ${label}`, cls: 'bg-amber-50 text-amber-700' }
  return { label: `Due ${label}`, cls: 'bg-gray-100 text-gray-600' }
}

export default function AdminRequestsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v1Only, setV1Only] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    let { data, error: e } = await supabase
      .from('creative_requests')
      .select(V2_SELECT)
      .order('created_at', { ascending: false })
      .limit(200)
    /* Pre-236 schema: fall back to the v1 shape so the queue still works. */
    if (e) {
      setV1Only(true)
      const fb = await supabase
        .from('creative_requests')
        .select(V1_SELECT)
        .order('created_at', { ascending: false })
        .limit(200)
      data = fb.data as unknown as typeof data
      e = fb.error
    } else {
      setV1Only(false)
    }
    if (e) setError(e.message.includes('does not exist') ? 'Run migration 235 first (creative_requests table is missing).' : e.message)
    setRows(((data ?? []) as unknown as Row[]))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const todayISO = new Date().toISOString().slice(0, 10)

  const visible = useMemo(() => {
    let list = filter === 'open' ? rows.filter((r) => OPEN_STATUSES.includes(r.status)) : [...rows]
    if (typeFilter !== 'all') list = list.filter((r) => r.type === typeFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        (r.clients?.name ?? '').toLowerCase().includes(q) ||
        (requestTypeById(r.type)?.label ?? r.type).toLowerCase().includes(q) ||
        Object.values(r.brief ?? {}).some((v) => String(v).toLowerCase().includes(q)),
      )
    }
    if (filter === 'open') {
      /* Soonest due first; dateless (no-rush) last; newest first within a tie. */
      list.sort((a, b) => {
        const da = a.due_date ?? '9999-12-31'
        const db = b.due_date ?? '9999-12-31'
        if (da !== db) return da < db ? -1 : 1
        return a.created_at < b.created_at ? 1 : -1
      })
    }
    return list
  }, [rows, filter, typeFilter, query])

  async function patch(row: Row, body: Record<string, unknown>) {
    setSaving(row.id)
    setError(null)
    try {
      const r = await fetch(`/api/requests/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'Update failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
    setSaving(null)
  }

  /** A status move carries the note and, when given, the quote amount. */
  function apply(row: Row, status: RequestStatus) {
    const body: Record<string, unknown> = { status, team_note: openId === row.id ? note : (row.team_note ?? '') }
    const dollars = parseFloat(amount)
    if (openId === row.id && Number.isFinite(dollars) && dollars >= 0) body.quote_cents = Math.round(dollars * 100)
    void patch(row, body).then(() => setOpenId(null))
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Inbox size={20} className="text-emerald-600" /> Creative requests
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Owners ask, you answer with a plan and a price. Every status change and note notifies the owner.
          </p>
        </div>
        <div className="flex gap-1 text-sm">
          {(['open', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {f === 'open' ? `Open (${rows.filter((r) => OPEN_STATUSES.includes(r.status)).length})` : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client, type, or brief..."
          className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 bg-white"
        >
          <option value="all">All types</option>
          {REQUEST_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {v1Only && (
        <div className="mb-4 rounded-lg bg-amber-50 text-amber-700 text-sm px-4 py-3">
          Run migration 236 to unlock due dates, files, quotes, claiming, and the thread.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}
      {loading ? (
        <div className="text-gray-400 text-sm py-10 text-center">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="text-gray-400 text-sm py-10 text-center">No requests here yet.</div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const type = requestTypeById(row.type)
            const isOpen = openId === row.id
            const prompts = type ? Object.fromEntries(questionsFor(type).map((q) => [q.id, q.prompt])) : {}
            const due = dueBadge(row.due_date, todayISO)
            const files = row.attachments ?? []
            const thread = row.notes ?? []
            return (
              <div key={row.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(isOpen ? null : row.id)
                    setNote(row.team_note ?? '')
                    setAmount(row.quote_cents != null ? String(row.quote_cents / 100) : '')
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      {type?.label ?? row.type}
                      {files.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <Paperclip size={12} /> {files.length}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {row.clients?.name ?? row.client_id.slice(0, 8)} · {new Date(row.created_at).toLocaleDateString()}
                      {row.assigned_name ? ` · ${row.assigned_name}` : ''}
                      {row.quote_cents != null && row.quote_cents > 0 ? ` · $${(row.quote_cents / 100).toLocaleString()}` : ''}
                    </div>
                  </div>
                  {due && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${due.cls}`}>{due.label}</span>
                  )}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_CLASS[row.status]}`}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                    <dl className="space-y-2">
                      {Object.entries(row.brief).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs font-medium text-gray-500">{prompts[k] ?? k}</dt>
                          <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">{v}</dd>
                        </div>
                      ))}
                    </dl>

                    {files.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {files.map((f, i) => (
                          <a
                            key={`${f.url}-${i}`}
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100"
                          >
                            <Paperclip size={12} /> {f.name}
                          </a>
                        ))}
                      </div>
                    )}

                    {thread.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-gray-500">Thread</div>
                        {thread.map((n) => (
                          <div key={n.id} className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">
                            <span className="text-xs font-medium text-gray-500 mr-2">
                              {n.author_role === 'owner' ? 'Owner' : 'Team'} · {new Date(n.created_at).toLocaleDateString()}
                            </span>
                            <span className="whitespace-pre-wrap">{n.body}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-gray-500 block mb-1.5">
                          Reply to the owner (the quote, the plan, or why not)
                        </label>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={3}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          placeholder="Example: We can do this for $180, delivered in 5 days. Tap yes and we start."
                        />
                      </div>
                      {!v1Only && (
                        <div className="w-28">
                          <label className="text-xs font-medium text-gray-500 block mb-1.5">Quote $</label>
                          <input
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            inputMode="decimal"
                            placeholder="180"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!v1Only && (
                        <>
                          <button
                            type="button"
                            disabled={saving === row.id}
                            onClick={() => void patch(row, { team_note: note })}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 inline-flex items-center gap-1.5"
                          >
                            {saving === row.id && <Loader2 size={12} className="animate-spin" />}
                            Save note
                          </button>
                          {row.assigned_to == null && (
                            <button
                              type="button"
                              disabled={saving === row.id}
                              onClick={() => void patch(row, { claim: true })}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Claim
                            </button>
                          )}
                        </>
                      )}
                      {REQUEST_STATUSES.filter((s) => s !== row.status).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={saving === row.id}
                          onClick={() => apply(row, s)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          {saving === row.id && <Loader2 size={12} className="animate-spin" />}
                          Mark {STATUS_LABEL[s].toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
