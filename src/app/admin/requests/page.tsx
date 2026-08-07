'use client'

/**
 * /admin/requests — the creative request queue (team side).
 *
 * Every owner request lands here the moment it is sent (staff are notified too).
 * The team reads the brief, writes the reply (the quote, the plan, or why not),
 * and moves the status. Every status move notifies the owner with the note in the
 * body, via PATCH /api/requests/[id] — no silent stalls.
 *
 * Reads go through the browser client (RLS: admin policy); writes go through the
 * API so the owner notification can never be skipped.
 */

import { useCallback, useEffect, useState } from 'react'
import { Inbox, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  REQUEST_STATUSES, STATUS_LABEL, requestTypeById, questionsFor,
  type RequestStatus,
} from '@/lib/requests/catalog'

interface Row {
  id: string
  client_id: string
  type: string
  brief: Record<string, string>
  status: RequestStatus
  team_note: string | null
  created_at: string
  updated_at: string
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

export default function AdminRequestsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error: e } = await supabase
      .from('creative_requests')
      .select('id, client_id, type, brief, status, team_note, created_at, updated_at, clients(name)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (e) setError(e.message.includes('does not exist') ? 'Run migration 235 first (creative_requests table is missing).' : e.message)
    setRows(((data ?? []) as unknown as Row[]))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const visible = filter === 'open' ? rows.filter((r) => OPEN_STATUSES.includes(r.status)) : rows

  async function apply(row: Row, status: RequestStatus) {
    setSaving(row.id)
    setError(null)
    try {
      const r = await fetch(`/api/requests/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, team_note: openId === row.id ? note : (row.team_note ?? '') }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'Update failed')
      await load()
      setOpenId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
    setSaving(null)
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Inbox size={20} className="text-emerald-600" /> Creative requests
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Owners ask, you answer with a plan and a price. Every status change notifies the owner with your note.
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
            return (
              <div key={row.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setOpenId(isOpen ? null : row.id); setNote(row.team_note ?? '') }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{type?.label ?? row.type}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {row.clients?.name ?? row.client_id.slice(0, 8)} · {new Date(row.created_at).toLocaleDateString()}
                    </div>
                  </div>
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

                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1.5">
                        Reply to the owner (the quote, the plan, or why not)
                      </label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="Example: We can do this for $180, delivered in 5 days. Reply yes and we start."
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
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
