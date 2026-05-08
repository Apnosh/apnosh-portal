/**
 * /admin/console — strategist cross-client triage view (Q1 wk 7-8, 1.3).
 *
 * One row per assigned client. Sorted by "needs attention" score so the
 * 80% of the day that should be reactive lives at the top.
 *
 * Server-rendered: no spinner, no waterfall. The data layer (lib/admin/
 * console-data.ts) does five parallel reads and joins in memory.
 */

import Link from 'next/link'
import {
  AlertTriangle,
  Clock,
  MessageSquare,
  Plug,
  Sparkles,
  Star,
} from 'lucide-react'
import { getConsoleRows, type ConsoleRow } from '@/lib/admin/console-data'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function scoreTone(score: number): { bg: string; text: string; label: string } {
  if (score >= 6) return { bg: 'bg-red-50', text: 'text-red-700', label: 'High' }
  if (score >= 3) return { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Medium' }
  if (score >= 1) return { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Low' }
  return { bg: 'bg-ink-7', text: 'text-ink-3', label: 'Quiet' }
}

export default async function StrategistConsolePage({
  searchParams,
}: {
  searchParams?: Promise<{ strategist?: string }>
}) {
  const params = (await searchParams) ?? {}

  // ?strategist=me -> resolve to the current user's team_member id.
  let strategistId = params.strategist
  if (strategistId === 'me') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const admin = createAdminClient()
      const { data: tm } = await admin
        .from('team_members')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      strategistId = tm?.id
    }
  }

  const rows = await getConsoleRows({ strategistId })

  const totalScore = rows.reduce((s, r) => s + r.needsAttentionScore, 0)
  const needAttention = rows.filter(r => r.needsAttentionScore >= 3).length

  return (
    <div className="px-6 py-8 max-w-[1280px] mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Console</h1>
          <p className="text-sm text-ink-3 mt-1">
            {rows.length} client{rows.length === 1 ? '' : 's'} ·{' '}
            {needAttention} need attention · {totalScore} signal{totalScore === 1 ? '' : 's'} today
          </p>
        </div>
        <Link
          href="/admin/console?strategist=me"
          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-6 hover:bg-ink-7"
        >
          {params.strategist === 'me' ? 'Showing: my clients' : 'Filter: my clients'}
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="text-center py-20 text-ink-3 text-sm">
          No clients match this view.
        </div>
      ) : (
        <div className="border border-ink-6 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink-7 text-ink-3 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Client</th>
                <th className="text-left px-3 py-2.5 font-semibold">Last contact</th>
                <th className="text-left px-3 py-2.5 font-semibold w-[110px]">Due this wk</th>
                <th className="text-left px-3 py-2.5 font-semibold w-[110px]">Reviews</th>
                <th className="text-left px-3 py-2.5 font-semibold w-[110px]">Connections</th>
                <th className="text-left px-3 py-2.5 font-semibold w-[80px]">24h</th>
                <th className="text-left px-3 py-2.5 font-semibold w-[110px]">Attention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-6">
              {rows.map(row => (
                <ConsoleRowView key={row.clientId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-ink-4 mt-4">
        Score = (deliverables due × 3) + (bad reviews unanswered × 2) + (connection issues × 1).
        Updates on next page load.
      </p>
    </div>
  )
}

function ConsoleRowView({ row }: { row: ConsoleRow }) {
  const tone = scoreTone(row.needsAttentionScore)
  return (
    <tr className="hover:bg-ink-7/40 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/admin/today?clientId=${row.clientId}`}
          className="font-semibold text-ink hover:underline"
        >
          {row.name}
        </Link>
        <div className="text-[11px] text-ink-4 mt-0.5">
          {row.plan ?? 'No plan'} · {row.status ?? 'unknown'}
        </div>
      </td>
      <td className="px-3 py-3 text-ink-3 text-[12px]">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-ink-4" />
          {relativeTime(row.lastContactAt)}
        </div>
        {row.lastContactSummary && (
          <div className="text-ink-4 text-[11px] mt-0.5 line-clamp-1 max-w-[260px]">
            {row.lastContactSummary}
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <Cell value={row.deliverablesDueThisWeek} icon={<AlertTriangle className="w-3 h-3" />} accent={row.deliverablesDueThisWeek > 0 ? 'amber' : 'ink'} />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <Cell value={row.unansweredReviews} icon={<MessageSquare className="w-3 h-3" />} />
          {row.badReviewsUnanswered > 0 && (
            <span className="text-[10px] font-semibold text-red-700 inline-flex items-center gap-1">
              <Star className="w-2.5 h-2.5" />
              {row.badReviewsUnanswered} ≤3★
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <Cell value={row.connectionIssues} icon={<Plug className="w-3 h-3" />} accent={row.connectionIssues > 0 ? 'red' : 'ink'} />
      </td>
      <td className="px-3 py-3">
        <Cell value={row.events24h} icon={<Sparkles className="w-3 h-3" />} />
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${tone.bg} ${tone.text}`}>
          {tone.label} · {row.needsAttentionScore}
        </span>
      </td>
    </tr>
  )
}

function Cell({
  value,
  icon,
  accent = 'ink',
}: {
  value: number
  icon: React.ReactNode
  accent?: 'amber' | 'red' | 'ink'
}) {
  const cls =
    value === 0 ? 'text-ink-4' :
    accent === 'red' ? 'text-red-700' :
    accent === 'amber' ? 'text-amber-700' :
    'text-ink-2'
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${cls}`}>
      {icon}
      {value}
    </span>
  )
}
