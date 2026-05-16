/**
 * Daily agent health page. The single dashboard you scan to know
 * if anything is regressing.
 *
 * Top: 4-tile snapshot (totals, thumbs-up rate, P95 latency, cost)
 * Middle: per-tool failure/cancel rates with recent error snippets
 * Bottom: daily trend (sparkline-style) + top cost spenders
 */

import Link from 'next/link'
import {
  Activity, MessageSquare, AlertTriangle, ThumbsUp, ThumbsDown, Clock,
  DollarSign, TrendingUp, Wrench,
} from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { getAgentHealth } from '@/lib/admin/agent-health'

export default async function AgentHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  await requireAdminUser()
  const params = await searchParams
  const windowDays = Math.max(1, Math.min(60, Number(params.window ?? '14')))
  const data = await getAgentHealth({ windowDays })
  if ('error' in data) {
    return <div className="p-6 text-rose-700">{data.error}</div>
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Admin
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand" />
            Agent health
          </h1>
          <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
            One-glance view of how the agent is performing across all clients in the last {windowDays} days.
            Check daily; investigate anything that's red.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-bg-2 rounded-full p-0.5">
          {[1, 7, 14, 30].map(d => (
            <Link
              key={d}
              href={`/admin/agent-health?window=${d}`}
              className={`px-3 py-1 text-[11.5px] font-medium rounded-full ${
                d === windowDays ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* Top-line tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          icon={MessageSquare}
          label="Conversations"
          value={data.totals.conversations.toString()}
          sub={`${data.totals.userMessages} owner messages · ${data.totals.activeClients} active clients`}
        />
        <Tile
          icon={ThumbsUp}
          label="Owner thumbs-up rate"
          value={data.feedback.ownerThumbsUp + data.feedback.ownerThumbsDown > 0
            ? `${Math.round(data.feedback.thumbsUpRate * 100)}%`
            : '—'}
          sub={`${data.feedback.ownerThumbsUp} 👍 · ${data.feedback.ownerThumbsDown} 👎 · ${data.feedback.strategistRatings} strategist`}
          tone={data.feedback.thumbsUpRate >= 0.85 ? 'good' : data.feedback.thumbsUpRate >= 0.6 ? 'warn' : 'bad'}
        />
        <Tile
          icon={Clock}
          label="Latency (P95 / P50)"
          value={data.latency.p95Ms != null
            ? `${(data.latency.p95Ms / 1000).toFixed(1)}s / ${(data.latency.p50Ms! / 1000).toFixed(1)}s`
            : '—'}
          sub={`${data.latency.samples} samples`}
          tone={data.latency.p95Ms != null && data.latency.p95Ms > 15000 ? 'bad'
            : data.latency.p95Ms != null && data.latency.p95Ms > 8000 ? 'warn' : 'good'}
        />
        <Tile
          icon={DollarSign}
          label="Cost / conversation"
          value={data.cost.avgPerConversationUsd != null ? `$${data.cost.avgPerConversationUsd.toFixed(3)}` : '—'}
          sub={`$${data.cost.totalUsd.toFixed(2)} total · ${data.totals.toolExecutions} tool calls`}
        />
      </div>

      {/* Tool health table */}
      <section className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-6 bg-bg-2 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-ink-3" />
          <h2 className="text-sm font-semibold text-ink">Per-tool health</h2>
        </div>
        {data.tools.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">No tool executions yet in this window.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-ink-3">
              <tr>
                <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Tool</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Total</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Executed</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Failed</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Cancelled</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Fail %</th>
                <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Recent errors</th>
              </tr>
            </thead>
            <tbody>
              {data.tools.map(t => (
                <tr key={t.toolName} className="border-t border-ink-6 hover:bg-bg-2/40">
                  <td className="py-2.5 px-4 text-[12.5px] font-mono text-ink-2">{t.toolName}</td>
                  <td className="py-2.5 px-4 text-right text-[12.5px] tabular-nums text-ink-2">{t.executions}</td>
                  <td className="py-2.5 px-4 text-right text-[12px] tabular-nums text-emerald-600">{t.executed}</td>
                  <td className={`py-2.5 px-4 text-right text-[12px] tabular-nums ${t.failed > 0 ? 'text-rose-600 font-medium' : 'text-ink-4'}`}>{t.failed}</td>
                  <td className="py-2.5 px-4 text-right text-[12px] tabular-nums text-amber-600">{t.cancelled}</td>
                  <td className="py-2.5 px-4 text-right text-[12px] tabular-nums">
                    {t.failureRate >= 0.1 ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-medium">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {(t.failureRate * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-ink-3">{(t.failureRate * 100).toFixed(0)}%</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-rose-700 max-w-md">
                    {t.recentErrors.length === 0 ? (
                      <span className="text-ink-4">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {t.recentErrors.map(e => (
                          <div key={e.executionId} className="truncate" title={e.reason}>
                            {e.reason}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Daily trend + top spenders side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-white rounded-xl border border-ink-6 overflow-hidden lg:col-span-2">
          <div className="px-4 py-3 border-b border-ink-6 bg-bg-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-ink-3" />
            <h2 className="text-sm font-semibold text-ink">Daily trend</h2>
          </div>
          {data.dailyTrend.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">No daily data yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-ink-3">
                <tr>
                  <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Date</th>
                  <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Convos</th>
                  <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Thumbs-up</th>
                  <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Escalation</th>
                  <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Avg $</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyTrend.slice(-14).reverse().map(d => (
                  <tr key={d.date} className="border-t border-ink-6">
                    <td className="py-2 px-4 text-[12px] text-ink-3 font-mono">{d.date}</td>
                    <td className="py-2 px-4 text-right text-[12px] text-ink-2 tabular-nums">{d.conversations}</td>
                    <td className="py-2 px-4 text-right text-[12px] tabular-nums">
                      {d.thumbsUpRate != null
                        ? <span className={d.thumbsUpRate >= 0.85 ? 'text-emerald-600' : d.thumbsUpRate >= 0.5 ? 'text-amber-600' : 'text-rose-600'}>
                            {(d.thumbsUpRate * 100).toFixed(0)}%
                          </span>
                        : <span className="text-ink-4">—</span>}
                    </td>
                    <td className="py-2 px-4 text-right text-[12px] tabular-nums text-ink-3">
                      {(d.escalationRate * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-4 text-right text-[12px] tabular-nums text-ink-3">
                      {d.avgCostUsd != null ? `$${d.avgCostUsd.toFixed(3)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-6 bg-bg-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-ink-3" />
            <h2 className="text-sm font-semibold text-ink">Top spenders</h2>
          </div>
          {data.cost.topSpenders.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">No cost yet.</div>
          ) : (
            <div className="divide-y divide-ink-6">
              {data.cost.topSpenders.map(s => (
                <div key={s.clientId} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink truncate">{s.clientName}</div>
                    <div className="text-[10px] text-ink-4">{s.convs} conv{s.convs === 1 ? '' : 's'}</div>
                  </div>
                  <div className="text-[13px] font-semibold text-ink tabular-nums">
                    ${s.usd.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="text-[11px] text-ink-4 text-center">
        Generated {new Date(data.generatedAt).toLocaleString('en-US')} · Window: last {windowDays} days
      </div>
    </div>
  )
}

function Tile({ icon: Icon, label, value, sub, tone }: {
  icon: typeof Activity
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  const toneClass = tone === 'good' ? 'border-emerald-200 bg-emerald-50/30'
    : tone === 'warn' ? 'border-amber-200 bg-amber-50/30'
    : tone === 'bad' ? 'border-rose-200 bg-rose-50/30'
    : 'border-ink-6 bg-white'
  return (
    <div className={`rounded-xl border ${toneClass} p-3`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-[20px] font-semibold text-ink tabular-nums">{value}</div>
      {sub && <div className="text-[10.5px] text-ink-3 mt-0.5">{sub}</div>}
    </div>
  )
}

// Mute unused-import lint when ThumbsDown isn't conditionally rendered
void ThumbsDown
