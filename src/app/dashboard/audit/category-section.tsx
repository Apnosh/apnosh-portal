'use client'

import { useState } from 'react'
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ArrowRight,
  Search, MessageCircle, Megaphone,
} from 'lucide-react'
import type { Finding } from '@/lib/audit'

const ICONS = {
  search: <Search className="w-4 h-4 text-brand" />,
  engage: <MessageCircle className="w-4 h-4 text-brand" />,
  active: <Megaphone className="w-4 h-4 text-brand" />,
}

export default function AuditCategorySection({
  icon, title, subtitle, score, findings, clientSlug,
}: {
  icon: keyof typeof ICONS
  title: string
  subtitle: string
  score: number
  findings: Finding[]
  clientSlug?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-2/30 text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {ICONS[icon]}
          <div>
            <div className="text-[13.5px] font-semibold text-ink">{title}</div>
            <div className="text-[11.5px] text-ink-3">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[13px] font-bold text-ink tabular-nums">
              {score}<span className="text-[10px] text-ink-4"> / 100</span>
            </div>
            <div className="text-[10px] text-ink-3">{findings.length} finding{findings.length === 1 ? '' : 's'}</div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-ink-4" /> : <ChevronDown className="w-4 h-4 text-ink-4" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-ink-6 p-4 space-y-3 bg-bg-2/20">
          {findings.map(f => <FindingRow key={f.id} finding={f} clientSlug={clientSlug} />)}
        </div>
      )}
    </div>
  )
}

function FindingRow({ finding, clientSlug }: { finding: Finding; clientSlug?: string }) {
  const params = new URLSearchParams()
  if (finding.ctaPrompt) params.set('ask', finding.ctaPrompt)
  if (clientSlug) params.set('client', clientSlug)
  const ctaHref = finding.ctaPrompt ? `/dashboard/audit?${params.toString()}` : null
  const icon = finding.severity === 'critical' ? <AlertCircle className="w-4 h-4 text-rose-600" />
    : finding.severity === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-600" />
    : <CheckCircle2 className="w-4 h-4 text-emerald-600" />
  const impact = finding.scoreImpact ?? 0
  return (
    <div className="bg-white rounded-lg border border-ink-7 p-3 flex items-start gap-2.5">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <h4 className="text-[13px] font-semibold text-ink">{finding.headline}</h4>
          {impact > 0 && (
            <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex-shrink-0">
              +{impact} pts
            </span>
          )}
        </div>
        <p className="text-[12px] text-ink-3 mt-0.5">{finding.evidence}</p>
        <p className="text-[11px] text-ink-4 mt-0.5 italic">{finding.benchmark}</p>
        {finding.whyItMatters && (
          <details className="mt-1.5">
            <summary className="text-[10.5px] text-ink-3 hover:text-ink cursor-pointer font-medium">
              Why this matters →
            </summary>
            <p className="text-[11px] text-ink-2 mt-1 leading-relaxed pl-1">{finding.whyItMatters}</p>
          </details>
        )}
        {(finding.ctaPrimary || finding.ctaSecondary) && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {finding.ctaPrimary && (
              ctaHref ? (
                <a
                  href={ctaHref}
                  className={[
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold',
                    finding.severity === 'strength' ? 'text-ink-2 bg-ink-7 hover:bg-ink-6' : 'text-white bg-brand hover:bg-brand-dark',
                  ].join(' ')}
                >
                  {finding.ctaPrimary}
                  <ArrowRight className="w-3 h-3" />
                </a>
              ) : (
                <button className={[
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold',
                  finding.severity === 'strength' ? 'text-ink-2 bg-ink-7 hover:bg-ink-6' : 'text-white bg-brand hover:bg-brand-dark',
                ].join(' ')}>
                  {finding.ctaPrimary}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )
            )}
            {finding.ctaSecondary && (
              <button className="text-[11px] text-ink-3 hover:text-ink px-1">
                {finding.ctaSecondary}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
