/**
 * Admin: agent cost dashboard. Daily + monthly Anthropic spend per
 * client, with at-risk highlighting when a client is approaching their
 * monthly cost cap.
 *
 * This is the page you check daily. If a row is red, intervene before
 * the bill arrives.
 */

import Link from 'next/link'
import { DollarSign, AlertTriangle, TrendingUp, Users } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { getCostDashboard, type ClientCostRow } from '@/lib/admin/agent-cost'

export default async function AgentCostPage() {
  await requireAdminUser()
  const data = await getCostDashboard()
  if ('error' in data) {
    return <div className="p-6 text-rose-700">{data.error}</div>
  }
  const { rows, totals, generatedAt } = data

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Admin
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-brand" />
          Agent cost dashboard
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          Anthropic spend per client. Red rows are within 25% of their monthly cap -- intervene
          before they exceed it.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={DollarSign} label="Spend today" value={`$${totals.todayUsd.toFixed(2)}`} />
        <StatTile icon={TrendingUp} label="Last 30 days" value={`$${totals.last30DaysUsd.toFixed(2)}`} />
        <StatTile icon={Users} label="Active clients (30d)" value={`${totals.activeClientCount}`} />
        <StatTile icon={DollarSign} label="Avg / active client" value={
          totals.activeClientCount > 0
            ? `$${(totals.last30DaysUsd / totals.activeClientCount).toFixed(2)}`
            : '—'
        } />
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <p className="text-sm font-medium text-ink-2">No client activity yet</p>
          <p className="text-xs text-ink-4 mt-1">As clients use the agent, their spend will show here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-2 text-ink-3">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Client</th>
                <th className="text-left py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Tier</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Today</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Last 30d</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Msgs / Convs</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Cap</th>
                <th className="text-right py-3 px-4 font-medium text-[11px] uppercase tracking-wider">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => <CostRow key={r.clientId} row={r} />)}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] text-ink-4 text-center">
        Generated {new Date(generatedAt).toLocaleString('en-US')}.
        Caps + tier limits live in <code className="font-mono">src/lib/agent/tiers.ts</code>.
        <br />
        <Link href="/admin" className="text-brand hover:underline mt-1 inline-block">← Back to admin</Link>
      </div>
    </div>
  )
}

function CostRow({ row }: { row: ClientCostRow }) {
  const util = row.capUtilization
  const utilPct = util != null ? Math.round(util * 100) : null
  return (
    <tr className={`border-t border-ink-6 ${row.isAtRisk ? 'bg-rose-50/30' : 'hover:bg-bg-2/40'}`}>
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-1.5">
          {row.isAtRisk && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
          <span className="font-medium text-ink">{row.clientName}</span>
        </div>
      </td>
      <td className="py-2.5 px-4 text-[12px] text-ink-2">{row.tierLabel}</td>
      <td className="py-2.5 px-4 text-right text-[12.5px] tabular-nums text-ink-3">
        ${row.costToday.toFixed(2)}
      </td>
      <td className={`py-2.5 px-4 text-right text-[12.5px] tabular-nums font-medium ${
        row.isAtRisk ? 'text-rose-700' : 'text-ink-2'
      }`}>
        ${row.costLast30Days.toFixed(2)}
      </td>
      <td className="py-2.5 px-4 text-right text-[12px] text-ink-3 tabular-nums">
        {row.messagesLast30Days} / {row.conversationCount}
      </td>
      <td className="py-2.5 px-4 text-right text-[12px] text-ink-3 tabular-nums">
        {row.monthlyCostCap != null ? `$${row.monthlyCostCap.toFixed(0)}` : '—'}
      </td>
      <td className="py-2.5 px-4 text-right text-[12px] tabular-nums">
        {utilPct != null ? (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
            utilPct >= 100 ? 'bg-rose-100 text-rose-800'
            : utilPct >= 75 ? 'bg-amber-50 text-amber-700'
            : utilPct >= 50 ? 'bg-bg-2 text-ink-2'
            : 'bg-emerald-50 text-emerald-700'
          }`}>
            {utilPct}%
          </span>
        ) : (
          <span className="text-ink-4">no cap</span>
        )}
      </td>
    </tr>
  )
}

function StatTile({ icon: Icon, label, value }: {
  icon: typeof DollarSign
  label: string
  value: string
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-[20px] font-semibold text-ink tabular-nums">{value}</div>
    </div>
  )
}
