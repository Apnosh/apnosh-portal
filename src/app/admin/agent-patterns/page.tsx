/**
 * Admin: cross-client patterns surface (AI-First Principle #7).
 *
 * Shows the cross_client_patterns materialized view -- "what
 * actually worked across all our clients" -- so strategists can
 * spot trends, tune playbooks, and feed signal back into prompts.
 *
 * The same data feeds the agent's per-turn context loader so the
 * agent can reference patterns like "restaurants similar to you
 * who posted to GBP saw +24% engagement."
 */

import Link from 'next/link'
import { Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { listAllPatterns } from '@/lib/agent/cross-client-patterns'

export default async function AgentPatternsPage() {
  await requireAdminUser()
  const patterns = await listAllPatterns()

  /* Group by tool for easier scanning. */
  const byTool = new Map<string, typeof patterns>()
  for (const p of patterns) {
    const arr = byTool.get(p.toolName) ?? []
    arr.push(p)
    byTool.set(p.toolName, arr)
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Admin
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-brand" />
          Cross-client patterns
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          What actually moved the needle across all clients, aggregated from every executed agent
          tool. The agent uses this same data to ground its recommendations. Refreshed nightly.
        </p>
      </div>

      {patterns.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Sparkles className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No patterns yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-md mx-auto">
            Patterns appear once at least 3 clients have executed the same tool and we've measured
            an outcome 7+ days later. Comes online as the agent gets used + the outcomes cron runs.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(byTool.entries()).map(([toolName, rows]) => (
            <div key={toolName} className="bg-white rounded-xl border border-ink-6 overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-6 bg-bg-2">
                <h2 className="text-sm font-semibold text-ink font-mono">{toolName}</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="text-ink-3">
                  <tr>
                    <th className="text-left py-2 px-4 font-medium text-[11px]">Metric</th>
                    <th className="text-left py-2 px-4 font-medium text-[11px]">Industry</th>
                    <th className="text-right py-2 px-4 font-medium text-[11px]">N</th>
                    <th className="text-right py-2 px-4 font-medium text-[11px]">Avg %</th>
                    <th className="text-right py-2 px-4 font-medium text-[11px]">Median %</th>
                    <th className="text-right py-2 px-4 font-medium text-[11px]">Strong / Weak / Noisy</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const TrendIcon = r.avgPctChange == null ? Minus
                      : r.avgPctChange > 0 ? TrendingUp : TrendingDown
                    const trendColor = r.avgPctChange == null ? 'text-ink-4'
                      : r.avgPctChange > 0 ? 'text-emerald-600' : 'text-rose-600'
                    return (
                      <tr key={i} className="border-t border-ink-6 hover:bg-bg-2/40">
                        <td className="py-2.5 px-4 text-[12.5px] font-mono text-ink-2">{r.metricName}</td>
                        <td className="py-2.5 px-4 text-[12.5px] text-ink-2 capitalize">{r.industry}</td>
                        <td className="py-2.5 px-4 text-right text-[12.5px] text-ink-2 tabular-nums">{r.sampleSize}</td>
                        <td className="py-2.5 px-4 text-right text-[12.5px] font-medium tabular-nums">
                          <span className={`inline-flex items-center gap-1 ${trendColor}`}>
                            <TrendIcon className="w-3 h-3" />
                            {r.avgPctChange == null ? '—' : `${r.avgPctChange > 0 ? '+' : ''}${r.avgPctChange}%`}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right text-[12.5px] text-ink-3 tabular-nums">
                          {r.medianPctChange == null ? '—' : `${r.medianPctChange > 0 ? '+' : ''}${r.medianPctChange}%`}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[12.5px] tabular-nums">
                          <span className="text-emerald-600 font-medium">{r.strongSignalCount}</span>
                          <span className="text-ink-4"> / </span>
                          <span className="text-amber-600">{r.weakSignalCount}</span>
                          <span className="text-ink-4"> / </span>
                          <span className="text-ink-4">{r.noisySignalCount}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] text-ink-4 text-center pt-4 border-t border-ink-6">
        Refreshed daily by <code className="font-mono">/api/cron/agent-patterns</code>. Patterns with N≥3 only.
        Anonymized — no client names ever surface here, only the vertical they belong to.
        <br />
        <Link href="/admin" className="text-brand hover:underline">← Back to admin</Link>
      </div>
    </div>
  )
}
