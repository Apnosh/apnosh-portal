'use client'

/**
 * Weekly site-audit results card for the Website Overview. Shows
 * the four audits (broken links, page speed, schema, stale content)
 * with status chips + summary. Click any audit to expand findings.
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, XCircle, Sparkles, ChevronDown, RefreshCw } from 'lucide-react'
import { getSiteAudits, type SiteAuditRow } from '@/lib/site-audit'

const AUDIT_LABELS: Record<string, { label: string; sub: string }> = {
  broken_links:  { label: 'Broken links',     sub: 'Internal + outbound link checks' },
  page_speed:    { label: 'Page speed',       sub: 'Mobile performance (Lighthouse)' },
  schema_markup: { label: 'Schema markup',    sub: 'Restaurant/LocalBusiness JSON-LD' },
  stale_content: { label: 'Content freshness', sub: 'Pages unchanged for 90+ days' },
}

export default function SiteAuditCard({ clientId }: { clientId: string }) {
  const [audits, setAudits] = useState<SiteAuditRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getSiteAudits(clientId)
      .then(d => { if (!cancelled) setAudits(d) })
      .catch(() => { if (!cancelled) setAudits([]) })
    return () => { cancelled = true }
  }, [clientId])

  if (audits === null) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="animate-pulse h-24" />
      </div>
    )
  }
  if (audits.length === 0) return null

  const ranAt = audits[0]?.ran_at
  const failCount = audits.filter(a => a.status === 'fail').length
  const warnCount = audits.filter(a => a.status === 'warn').length

  return (
    <div className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-ink-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">Weekly site audit</h2>
          {failCount > 0 && (
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
              {failCount} failing
            </span>
          )}
          {failCount === 0 && warnCount > 0 && (
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
              {warnCount} warning{warnCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {ranAt && (
          <span className="text-[10.5px] text-ink-4 inline-flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5" />
            Updated {new Date(ranAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <ul>
        {Object.keys(AUDIT_LABELS).map(type => {
          const row = audits.find(a => a.audit_type === type)
          if (!row) return null
          return (
            <AuditRow key={type} row={row} />
          )
        })}
      </ul>
    </div>
  )
}

function AuditRow({ row }: { row: SiteAuditRow }) {
  const [open, setOpen] = useState(false)
  const meta = AUDIT_LABELS[row.audit_type]
  const Icon = row.status === 'pass' ? CheckCircle2 : row.status === 'fail' ? XCircle : AlertCircle
  const color = row.status === 'pass' ? 'text-emerald-600'
    : row.status === 'fail' ? 'text-rose-500' : 'text-amber-500'
  const findings = Array.isArray(row.findings) ? row.findings : []
  const visibleFindings = findings
    .filter(f => 'message' in f && typeof (f as { message?: unknown }).message === 'string')
    .map(f => f as { url: string; message: string; severity?: string })
  return (
    <li className="border-b border-ink-7 last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={visibleFindings.length === 0}
        className={`w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-bg-2/40 transition-colors ${
          visibleFindings.length === 0 ? 'cursor-default' : ''
        }`}
      >
        <Icon className={`w-4 h-4 ${color} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-ink">{meta.label}</span>
            {row.score != null && (
              <span className="text-[11px] text-ink-3 tabular-nums">{row.score}/100</span>
            )}
          </div>
          <p className="text-[11.5px] text-ink-3 mt-0.5">{row.summary}</p>
        </div>
        {visibleFindings.length > 0 && (
          <ChevronDown className={`w-3.5 h-3.5 text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && visibleFindings.length > 0 && (
        <ul className="px-5 pb-3 space-y-1">
          {visibleFindings.slice(0, 10).map((f, i) => (
            <li key={i} className="text-[11.5px] flex items-start gap-2">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                f.severity === 'fail' ? 'bg-rose-500' : f.severity === 'warn' ? 'bg-amber-500' : 'bg-ink-5'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-ink-2">{f.message}</p>
                <p className="text-[10.5px] text-ink-4 truncate font-mono">{f.url}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
