'use client'

import { useState, useTransition } from 'react'
import {
  BarChart3, Search, History, RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Loader2,
} from 'lucide-react'
import {
  adminBackfillSearchHistory,
  adminBackfillAnalytics,
  type ClientWebsiteRow,
} from '@/lib/admin/website-data-tools'

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function WebsiteToolsTable({ initialRows }: { initialRows: ClientWebsiteRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [busy, setBusy] = useState<{ [clientId: string]: 'gsc' | 'ga' | null }>({})
  const [msg, setMsg] = useState<{ [clientId: string]: string | null }>({})
  const [filter, setFilter] = useState<'all' | 'connected' | 'errors'>('all')
  const [, startTransition] = useTransition()

  const visible = rows.filter(r => {
    if (filter === 'connected') return r.ga.connected || r.gsc.connected
    if (filter === 'errors') return r.ga.syncError || r.gsc.syncError
    return true
  })

  async function runBackfillGSC(clientId: string) {
    setBusy(b => ({ ...b, [clientId]: 'gsc' }))
    setMsg(m => ({ ...m, [clientId]: null }))
    const res = await adminBackfillSearchHistory(clientId, 480)
    setBusy(b => ({ ...b, [clientId]: null }))
    if (res.success) {
      setMsg(m => ({ ...m, [clientId]: `Pulled ${res.daysWritten} days` }))
      // Optimistically update the row's last_sync_at and counts.
      startTransition(() => {
        setRows(rs => rs.map(r => r.clientId === clientId ? {
          ...r,
          gsc: { ...r.gsc, lastSyncAt: new Date().toISOString(), rowsInDb: r.gsc.rowsInDb + res.daysWritten, syncError: null },
        } : r))
      })
    } else {
      setMsg(m => ({ ...m, [clientId]: `Error: ${res.error}` }))
    }
    setTimeout(() => setMsg(m => ({ ...m, [clientId]: null })), 8000)
  }

  async function runResyncGA(clientId: string) {
    setBusy(b => ({ ...b, [clientId]: 'ga' }))
    setMsg(m => ({ ...m, [clientId]: null }))
    const res = await adminBackfillAnalytics(clientId, 90)
    setBusy(b => ({ ...b, [clientId]: null }))
    if (res.success) {
      setMsg(m => ({ ...m, [clientId]: `Synced ${res.daysWritten} days` }))
      startTransition(() => {
        setRows(rs => rs.map(r => r.clientId === clientId ? {
          ...r,
          ga: { ...r.ga, lastSyncAt: new Date().toISOString(), syncError: null },
        } : r))
      })
    } else {
      setMsg(m => ({ ...m, [clientId]: `Error: ${res.error}` }))
    }
    setTimeout(() => setMsg(m => ({ ...m, [clientId]: null })), 8000)
  }

  const errorCount = rows.filter(r => r.ga.syncError || r.gsc.syncError).length
  const connectedCount = rows.filter(r => r.ga.connected || r.gsc.connected).length

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-ink-6">
        {([
          { id: 'all', label: `All (${rows.length})` },
          { id: 'connected', label: `Connected (${connectedCount})` },
          { id: 'errors', label: `Errors (${errorCount})` },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2',
              filter === t.id ? 'text-ink border-brand' : 'text-ink-3 border-transparent hover:text-ink-2',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <p className="text-sm font-medium text-ink-2">No clients in this view</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-2 text-ink-3">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Client</th>
                <th className="text-left py-3 px-4 font-medium">
                  <span className="inline-flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Analytics</span>
                </th>
                <th className="text-left py-3 px-4 font-medium">
                  <span className="inline-flex items-center gap-1"><Search className="w-3 h-3" /> Search Console</span>
                </th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const rowBusy = busy[row.clientId]
                const rowMsg = msg[row.clientId]
                return (
                  <tr key={row.clientId} className="border-t border-ink-6 hover:bg-bg-2/40">
                    <td className="py-3 px-4 align-top">
                      <div className="font-medium text-ink">{row.clientName}</div>
                      {row.websiteUrl && (
                        <a
                          href={row.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-brand mt-0.5"
                        >
                          {row.websiteUrl.replace(/^https?:\/\//, '')}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <ChannelCell
                        connected={row.ga.connected}
                        label={row.ga.accountName}
                        lastSyncAt={row.ga.lastSyncAt}
                        syncError={row.ga.syncError}
                        rowsInDb={row.ga.rowsInDb}
                      />
                    </td>
                    <td className="py-3 px-4 align-top">
                      <ChannelCell
                        connected={row.gsc.connected}
                        label={row.gsc.siteUrl}
                        lastSyncAt={row.gsc.lastSyncAt}
                        syncError={row.gsc.syncError}
                        rowsInDb={row.gsc.rowsInDb}
                        rangeLabel={
                          row.gsc.earliestRow && row.gsc.latestRow
                            ? `${row.gsc.earliestRow.slice(0, 7)} → ${row.gsc.latestRow.slice(0, 7)}`
                            : null
                        }
                      />
                    </td>
                    <td className="py-3 px-4 align-top text-right">
                      <div className="inline-flex flex-col items-end gap-1.5">
                        {row.gsc.connected && (
                          <button
                            disabled={!!rowBusy}
                            onClick={() => runBackfillGSC(row.clientId)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
                            title="Pull the full 16 months of search history Google retains (~60-90s)"
                          >
                            {rowBusy === 'gsc' ? <Loader2 className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
                            {rowBusy === 'gsc' ? 'Pulling 16mo...' : 'Backfill 16mo GSC'}
                          </button>
                        )}
                        {row.ga.connected && (
                          <button
                            disabled={!!rowBusy}
                            onClick={() => runResyncGA(row.clientId)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold text-ink-2 bg-ink-7 hover:bg-ink-6 disabled:opacity-50"
                            title="Re-run the 90-day GA sync for this client"
                          >
                            {rowBusy === 'ga' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            {rowBusy === 'ga' ? 'Syncing...' : 'Re-sync 90d GA'}
                          </button>
                        )}
                        {rowMsg && (
                          <span className={`text-[11px] ${rowMsg.startsWith('Error') ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {rowMsg}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ChannelCell({
  connected, label, lastSyncAt, syncError, rowsInDb, rangeLabel,
}: {
  connected: boolean
  label: string | null
  lastSyncAt: string | null
  syncError: string | null
  rowsInDb: number
  rangeLabel?: string | null
}) {
  if (!connected) {
    return <span className="text-[12px] text-ink-4">— not connected</span>
  }
  return (
    <div className="text-[12px] space-y-0.5">
      <div className="flex items-center gap-1 text-ink-2">
        {syncError ? (
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
        )}
        <span className="truncate max-w-[200px]">{label ?? 'Connected'}</span>
      </div>
      <div className="text-ink-3 text-[11px]">
        {rowsInDb} rows · synced {relTime(lastSyncAt)}
        {rangeLabel && <span className="ml-1">· {rangeLabel}</span>}
      </div>
      {syncError && (
        <div className="text-[11px] text-rose-700 max-w-[300px] truncate" title={syncError}>
          {syncError}
        </div>
      )}
    </div>
  )
}
