'use client'

/**
 * Publish history drawer — shows past published versions and lets the AM
 * revert any of them back into the current draft (no overwrite without
 * confirmation; safe operation).
 */

import { useEffect, useState } from 'react'
import { X, Loader2, RotateCcw, Eye, Check } from 'lucide-react'
import { listHistory, revertToVersion } from '@/lib/site-config/actions'

interface HistoryEntry {
  id: string
  version: number
  published_at: string
  notes: string | null
}

interface Props {
  clientId: string
  clientSlug: string
  open: boolean
  onClose: () => void
  /** Called after a successful revert so the form can re-fetch the draft. */
  onReverted: () => void
}

export default function HistoryDrawer({ clientId, clientSlug, open, onClose, onReverted }: Props) {
  const [items, setItems] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    listHistory(clientId).then(res => {
      setLoading(false)
      if (res.success) setItems(res.data ?? [])
      else setError(res.error)
    })
  }, [open, clientId])

  async function handleRevert(id: string) {
    setReverting(id)
    setError(null)
    const res = await revertToVersion(clientId, id)
    setReverting(null)
    if (res.success) {
      setConfirmId(null)
      onReverted()
      onClose()
    } else {
      setError(res.error)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <aside className="fixed top-0 right-0 bottom-0 w-[420px] bg-white border-l border-ink-6 shadow-2xl z-50 flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-ink-6">
          <div>
            <h3 className="text-sm font-semibold text-ink">Publish history</h3>
            <p className="text-[11px] text-ink-3 mt-0.5">Restore any prior version into your current draft.</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-ink-3 py-8 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>
          )}
          {!loading && items.length === 0 && !error && (
            <div className="text-center py-12 text-xs text-ink-3">
              No publishes yet. Publish your first version to start the history.
            </div>
          )}
          {items.map((entry, idx) => (
            <article key={entry.id} className="border border-ink-6 rounded-xl p-3 hover:border-ink-5 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">v{entry.version}</span>
                    {idx === 0 && <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Latest</span>}
                  </div>
                  <div className="text-[11px] text-ink-3">{formatDate(entry.published_at)}</div>
                </div>
                <a
                  href={`/preview/sites/${clientSlug}?mode=published&v=${entry.version}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink"
                >
                  <Eye className="w-3 h-3" /> View
                </a>
              </div>
              {entry.notes && <p className="text-[11px] text-ink-3 italic mb-2">"{entry.notes}"</p>}
              {confirmId === entry.id ? (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-2 space-y-2">
                  <p className="text-[11px] text-amber-800">Replace your current draft with v{entry.version}? Your in-progress edits will be overwritten.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRevert(entry.id)}
                      disabled={reverting === entry.id}
                      className="flex-1 bg-ink hover:bg-black text-white text-[11px] font-semibold rounded px-2 py-1.5 flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {reverting === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Yes, restore
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="flex-1 text-[11px] text-ink-3 hover:text-ink rounded px-2 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(entry.id)}
                  className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-brand"
                >
                  <RotateCcw className="w-3 h-3" /> Restore to draft
                </button>
              )}
            </article>
          ))}
        </div>
      </aside>
    </>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
