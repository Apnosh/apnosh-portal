/**
 * Strategist review queue. Lists agent conversations sorted by how
 * deserving they are of human review:
 *   - Owner 👎 ratings (×5)
 *   - Failed tool executions (×3)
 *   - Cancelled tool previews (×1)
 *   - Freshness boost (max +14 days back)
 *   - -1000 (sink) once a strategist has rated
 *
 * Reviewing a conversation is one of the leading indicators for
 * agent quality. The data this collects feeds prompt tuning,
 * playbook updates, and (eventually) per-client tool overrides.
 */

import Link from 'next/link'
import { Sparkles, ThumbsUp, ThumbsDown, AlertCircle, CheckCircle2, XCircle, MessageSquare } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { listAgentReviewQueue } from '@/lib/admin/agent-reviews'
import QueueFilters from './queue-filters'

export default async function AgentReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  await requireAdminUser()
  const params = await searchParams
  const filter = (params.filter === 'reviewed' || params.filter === 'all') ? params.filter : 'needs_review'
  const rows = await listAgentReviewQueue({ filter })

  const needsCount = rows.filter(r => !r.strategistRated).length
  const reviewedCount = rows.filter(r => r.strategistRated).length

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Admin
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-brand" />
          Agent review queue
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          Conversations the agent had with owners, sorted by how much they deserve a second look.
          Your ratings here close the loop: they feed prompt tuning and cross-client patterns.
        </p>
      </div>

      <QueueFilters
        current={filter}
        needsReview={needsCount}
        reviewed={reviewedCount}
      />

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">
            {filter === 'needs_review' ? 'Caught up! Nothing needs review right now.' : 'No conversations in this view.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-2 text-ink-3">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Client</th>
                <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Started</th>
                <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Status</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Turns</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Tools</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Signals</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Priority</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const started = new Date(r.startedAt)
                const ageHours = (Date.now() - started.getTime()) / 3_600_000
                const ageLabel = ageHours < 1 ? '<1h ago'
                  : ageHours < 24 ? `${Math.floor(ageHours)}h ago`
                  : `${Math.floor(ageHours / 24)}d ago`
                return (
                  <tr key={r.conversationId} className="border-t border-ink-6 hover:bg-bg-2/40">
                    <td className="py-2.5 px-4">
                      <Link
                        href={`/admin/agent-reviews/${r.conversationId}`}
                        className="text-ink font-medium hover:text-brand"
                      >
                        {r.clientName}
                      </Link>
                      {r.title && (
                        <div className="text-[11px] text-ink-3 truncate max-w-md">{r.title}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-[12px] text-ink-3">{ageLabel}</td>
                    <td className="py-2.5 px-4">
                      <StatusPill status={r.status} strategistRated={r.strategistRated} />
                    </td>
                    <td className="py-2.5 px-4 text-right text-[12px] text-ink-2 tabular-nums">{r.turnCount}</td>
                    <td className="py-2.5 px-4 text-right text-[12px] text-ink-2 tabular-nums">
                      {r.toolCount}
                      {r.failedToolCount > 0 && <span className="text-rose-600"> · {r.failedToolCount} fail</span>}
                      {r.cancelledToolCount > 0 && <span className="text-amber-600"> · {r.cancelledToolCount} cancel</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right text-[12px] tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {r.ownerThumbsUp > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700">
                            <ThumbsUp className="w-3 h-3" />{r.ownerThumbsUp}
                          </span>
                        )}
                        {r.ownerThumbsDown > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-rose-700">
                            <ThumbsDown className="w-3 h-3" />{r.ownerThumbsDown}
                          </span>
                        )}
                        {r.ownerThumbsUp === 0 && r.ownerThumbsDown === 0 && (
                          <span className="text-ink-4">—</span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums ${
                        r.strategistRated ? 'bg-ink-7 text-ink-4'
                        : r.priorityScore > 10 ? 'bg-rose-50 text-rose-700'
                        : r.priorityScore > 5 ? 'bg-amber-50 text-amber-700'
                        : 'bg-bg-2 text-ink-3'
                      }`}>
                        {r.strategistRated ? '✓ rated' : r.priorityScore.toFixed(0)}
                      </span>
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

function StatusPill({ status, strategistRated }: { status: string; strategistRated: boolean }) {
  const meta: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
    active:     { icon: MessageSquare, color: 'bg-blue-50 text-blue-700',     label: 'Active' },
    completed:  { icon: CheckCircle2,  color: 'bg-emerald-50 text-emerald-700', label: 'Completed' },
    escalated:  { icon: AlertCircle,   color: 'bg-amber-50 text-amber-700',   label: 'Escalated' },
    abandoned:  { icon: XCircle,       color: 'bg-ink-7 text-ink-4',          label: 'Abandoned' },
  }
  const m = meta[status] ?? { icon: MessageSquare, color: 'bg-ink-7 text-ink-3', label: status }
  const Icon = m.icon
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${m.color}`}>
        <Icon className="w-3 h-3" /> {m.label}
      </span>
      {strategistRated && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">
          ✓ rated
        </span>
      )}
    </span>
  )
}
