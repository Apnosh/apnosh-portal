/**
 * Admin: Insights source-of-truth board.
 *
 * Lists EVERY metric source across the 5 funnel stages with its provider,
 * whether the metric is wired today, and its honest status. Apnosh sells
 * outcome accountability — this board is the internal ground-truth of what
 * we can actually show a client vs. what is a stub or not-yet-connected.
 *
 * Pick a client (?clientId=) to resolve each source's live status against
 * that client's real channel_connections. With no client picked, the board
 * shows the static registry (baseStatus) so the whole map is always visible.
 *
 * PHASE 1: read-only. Changes no client-facing number.
 */

import Link from 'next/link'
import { Database, Circle } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SOURCES,
  STAGE_NAMES,
  sourceActionVerb,
  type FunnelStage,
  type SourceStatus,
  type SourceDef,
  type ResolvedSource,
} from '@/lib/insights/source-registry'
import { resolveSourceStatuses } from '@/lib/insights/resolve-source-statuses'

const STATUS_STYLE: Record<SourceStatus, { label: string; chip: string; dot: string }> = {
  CONNECTED: { label: 'Connected', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'text-emerald-500' },
  AVAILABLE_NOT_CONNECTED: { label: 'Not connected', chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'text-amber-500' },
  ERROR: { label: 'Error', chip: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'text-rose-500' },
  COMING_SOON: { label: 'Coming soon', chip: 'bg-ink-6/40 text-ink-3 border-ink-6', dot: 'text-ink-4' },
  MANUAL_ENTRY: { label: 'Manual entry', chip: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'text-violet-500' },
}

function StatusChip({ status, verb }: { status: SourceStatus; verb?: string | null }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${s.chip}`}>
      <Circle className={`w-2 h-2 fill-current ${s.dot}`} />
      {s.label}
      {verb && <span className="opacity-60 font-medium">· {verb}</span>}
    </span>
  )
}

export default async function InsightsSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  await requireAdminUser()
  const params = await searchParams
  const clientId = params.clientId ?? null

  const admin = createAdminClient()
  const { data: clientRows } = await admin
    .from('clients')
    .select('id, name, slug')
    .order('name') as { data: Array<{ id: string; name: string; slug: string }> | null }
  const clients = clientRows ?? []
  const activeClient = clientId ? clients.find(c => c.id === clientId) ?? null : null

  const resolved = clientId ? await resolveSourceStatuses(clientId) : null

  // Tally counts (resolved when a client is picked, else baseStatus).
  const statusOf = (src: SourceDef): SourceStatus => resolved?.[src.id]?.status ?? src.baseStatus
  const counts = SOURCES.reduce<Record<SourceStatus, number>>((acc, s) => {
    const st = statusOf(s)
    acc[st] = (acc[st] ?? 0) + 1
    return acc
  }, { CONNECTED: 0, AVAILABLE_NOT_CONNECTED: 0, ERROR: 0, COMING_SOON: 0, MANUAL_ENTRY: 0 })

  const stages: FunnelStage[] = [1, 2, 3, 4, 5]

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-24 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Database className="w-6 h-6 text-brand" />
          Insights source-of-truth
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          Every number in the funnel, and exactly where it comes from. A source only reads
          &ldquo;Connected&rdquo; when a real adapter, an active connection, and a wired metric all line up.
          Anything not flowing is shown honestly — never faked into a number.
        </p>
      </div>

      {/* Client picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Client:</span>
        <Link
          href="/admin/insights-sources"
          className={`px-2.5 py-1 rounded-full text-[12px] font-medium border ${!clientId ? 'bg-brand text-white border-brand' : 'bg-white text-ink-2 border-ink-6 hover:border-ink-4'}`}
        >
          Registry only
        </Link>
        {clients.slice(0, 40).map(c => (
          <Link
            key={c.id}
            href={`/admin/insights-sources?clientId=${c.id}`}
            className={`px-2.5 py-1 rounded-full text-[12px] font-medium border ${clientId === c.id ? 'bg-brand text-white border-brand' : 'bg-white text-ink-2 border-ink-6 hover:border-ink-4'}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {/* Legend / counts */}
      <div className="bg-bg-2 rounded-xl border border-ink-6 p-3 flex items-center gap-4 flex-wrap text-[12px]">
        <span className="text-ink-3 font-medium">
          {activeClient ? <>Resolved for <strong className="text-ink">{activeClient.name}</strong></> : 'Static registry (best-case)'}
        </span>
        <span className="text-ink-4">·</span>
        {(Object.keys(STATUS_STYLE) as SourceStatus[]).map(st => (
          <span key={st} className="inline-flex items-center gap-1.5 text-ink-2">
            <Circle className={`w-2.5 h-2.5 fill-current ${STATUS_STYLE[st].dot}`} />
            {STATUS_STYLE[st].label}
            <span className="text-ink-4 font-semibold">{counts[st]}</span>
          </span>
        ))}
      </div>

      {/* Stages */}
      {stages.map(stage => {
        const rows = SOURCES.filter(s => s.stage === stage)
        return (
          <div key={stage} className="space-y-2">
            <h2 className="text-[14px] font-semibold text-ink-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-tint text-brand-dark text-[11px] font-bold">{stage}</span>
              {STAGE_NAMES[stage]}
              <span className="text-ink-4 font-normal text-[12px]">({rows.length})</span>
            </h2>
            <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead className="bg-bg-2 text-ink-3">
                    <tr>
                      <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Source</th>
                      <th className="text-left py-2 px-3 font-medium text-[11px] uppercase tracking-wider">Provider</th>
                      <th className="text-left py-2 px-3 font-medium text-[11px] uppercase tracking-wider">Wired</th>
                      <th className="text-left py-2 px-3 font-medium text-[11px] uppercase tracking-wider">{activeClient ? 'Status (client)' : 'Base status'}</th>
                      <th className="text-left py-2 px-3 font-medium text-[11px] uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(src => {
                      const r: ResolvedSource | undefined = resolved?.[src.id]
                      const status = r?.status ?? src.baseStatus
                      const verb = sourceActionVerb(status)
                      return (
                        <tr key={src.id} className="border-t border-ink-6 align-top">
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[13px] font-medium text-ink">{src.displayName}</span>
                              {src.isHero && <Tag label="hero" tone="bg-blue-50 text-blue-600" />}
                              {src.isStageNumber && <Tag label="stage #" tone="bg-emerald-50 text-emerald-600" />}
                              {src.isDrilldown && <Tag label="drill-down" tone="bg-ink-6/50 text-ink-3" />}
                            </div>
                            <div className="text-[11px] font-mono text-ink-4 mt-0.5">{src.id}</div>
                          </td>
                          <td className="py-2.5 px-3 text-[12px] text-ink-3 font-mono whitespace-nowrap">{src.provider}</td>
                          <td className="py-2.5 px-3 text-[12px]">
                            {src.wired
                              ? <span className="text-emerald-600 font-semibold">yes</span>
                              : <span className="text-ink-4">no</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusChip status={status} verb={verb} />
                            {r?.status === 'CONNECTED' && r.hasData === false && (
                              <div className="text-[10.5px] text-ink-4 mt-1">connected · no data yet</div>
                            )}
                            {r?.errorReason && (
                              <div className="text-[10.5px] text-rose-600 mt-1 max-w-[200px] truncate" title={r.errorReason}>{r.errorReason}</div>
                            )}
                            {r?.lastUpdated && (
                              <div className="text-[10.5px] text-ink-4 mt-1">synced {new Date(r.lastUpdated).toLocaleDateString()}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[11.5px] text-ink-3 max-w-[360px]">{src.notes}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Tag({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide ${tone}`}>{label}</span>
  )
}
