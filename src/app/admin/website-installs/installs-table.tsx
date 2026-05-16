'use client'

import { useState, useTransition } from 'react'
import {
  ExternalLink, Check, Clock, PlayCircle, XCircle, AlertCircle,
} from 'lucide-react'
import {
  updateInstallRequestStatus,
  type InstallRequest,
  type InstallStatus,
} from '@/lib/dashboard/install-requests'

const STATUS_META: Record<InstallStatus, { label: string; classes: string; icon: typeof Check }> = {
  open: { label: 'Open', classes: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertCircle },
  in_progress: { label: 'In progress', classes: 'bg-blue-50 text-blue-700 border-blue-200', icon: PlayCircle },
  done: { label: 'Done', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Check },
  cancelled: { label: 'Cancelled', classes: 'bg-ink-7 text-ink-3 border-ink-6', icon: XCircle },
}

function relTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function InstallRequestsTable({ initialRows }: { initialRows: InstallRequest[] }) {
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<'open' | 'all' | 'done'>('open')
  const [pending, startTransition] = useTransition()

  const visible = rows.filter(r => {
    if (filter === 'open') return r.status === 'open' || r.status === 'in_progress'
    if (filter === 'done') return r.status === 'done'
    return true
  })

  function setStatus(id: string, status: InstallStatus) {
    startTransition(async () => {
      const res = await updateInstallRequestStatus(id, status)
      if (res.success) {
        setRows(rs => rs.map(r => r.id === id ? {
          ...r,
          status,
          doneAt: status === 'done' ? new Date().toISOString() : r.doneAt,
        } : r))
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-ink-6">
        {([
          { id: 'open', label: `Open (${rows.filter(r => r.status === 'open' || r.status === 'in_progress').length})` },
          { id: 'done', label: `Done (${rows.filter(r => r.status === 'done').length})` },
          { id: 'all', label: 'All' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2',
              filter === t.id
                ? 'text-ink border-brand'
                : 'text-ink-3 border-transparent hover:text-ink-2',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Clock className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No install requests</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            When clients click &quot;Have us install it&quot; in the website setup wizard, they show up here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-2 text-ink-3">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Client</th>
                <th className="text-left py-3 px-4 font-medium">Tool</th>
                <th className="text-left py-3 px-4 font-medium">Site / platform</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Requested</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const meta = STATUS_META[row.status]
                const StatusIcon = meta.icon
                return (
                  <tr key={row.id} className="border-t border-ink-6 hover:bg-bg-2/50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-ink">{row.clientName}</div>
                    </td>
                    <td className="py-3 px-4 text-ink-2">{row.toolLabel}</td>
                    <td className="py-3 px-4">
                      {row.websiteUrl ? (
                        <a
                          href={row.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:underline inline-flex items-center gap-1 text-[13px]"
                        >
                          {row.websiteUrl.replace(/^https?:\/\//, '')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                      {row.platform && (
                        <div className="text-[11px] text-ink-3 mt-0.5 capitalize">
                          {row.platform === 'unknown' ? '— platform unknown' : row.platform}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.classes}`}>
                        <StatusIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-ink-3 text-[12px]">{relTime(row.createdAt)}</td>
                    <td className="py-3 px-4 text-right">
                      {row.status === 'open' && (
                        <button
                          disabled={pending}
                          onClick={() => setStatus(row.id, 'in_progress')}
                          className="text-[12px] font-medium text-blue-700 hover:text-blue-800 disabled:opacity-50 mr-3"
                        >
                          Start
                        </button>
                      )}
                      {(row.status === 'open' || row.status === 'in_progress') && (
                        <>
                          <button
                            disabled={pending}
                            onClick={() => setStatus(row.id, 'done')}
                            className="text-[12px] font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50 mr-3"
                          >
                            Mark done
                          </button>
                          <button
                            disabled={pending}
                            onClick={() => setStatus(row.id, 'cancelled')}
                            className="text-[12px] font-medium text-ink-3 hover:text-ink-2 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {row.status === 'done' && row.doneAt && (
                        <span className="text-[11px] text-ink-4">Done {relTime(row.doneAt)}</span>
                      )}
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
