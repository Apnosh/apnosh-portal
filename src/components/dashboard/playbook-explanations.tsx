'use client'

/**
 * Playbook explanations -- "what we're doing for each goal" surface
 * on the dashboard (Phase B5).
 *
 * Per docs/PRODUCT-SPEC.md: "For every goal, Apnosh has a recommended
 * service mix... Strategists know the playbook; clients don't." This
 * component makes it visible.
 *
 * Renders one expandable section per active goal, listing services
 * with high/medium/low emphasis and whether they're currently active.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, Circle } from 'lucide-react'
import type { PlaybookExplanation } from '@/lib/dashboard/get-playbook-explanations'

const EMPHASIS_LABEL: Record<string, string> = {
  high: 'Primary',
  medium: 'Supporting',
  low: 'Light touch',
}

const EMPHASIS_TONE: Record<string, string> = {
  high: 'text-emerald-700',
  medium: 'text-amber-700',
  low: 'text-ink-3',
}

export default function PlaybookExplanations({ explanations }: { explanations: PlaybookExplanation[] }) {
  if (explanations.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">
          What we're doing for each goal
        </h2>
      </div>
      <div className="space-y-2">
        {explanations.map(exp => <ExplanationRow key={exp.goalSlug} exp={exp} />)}
      </div>
    </section>
  )
}

function ExplanationRow({ exp }: { exp: PlaybookExplanation }) {
  const [open, setOpen] = useState(false)
  const activeCount = exp.services.filter(s => s.isActive).length
  const totalCount = exp.services.length

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: 'var(--db-border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-4 flex items-center gap-3"
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-ink-4 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">{exp.goalDisplayName}</p>
          <p className="text-[12px] text-ink-3 mt-0.5">
            {exp.goalRationale} {activeCount} of {totalCount} services active.
          </p>
        </div>
      </button>

      {open && exp.services.length > 0 && (
        <div className="px-4 pb-4 space-y-2 border-t border-ink-7 pt-3">
          {exp.services.map(s => (
            <div key={s.serviceSlug} className="flex items-start gap-2 text-[13px]">
              {s.isActive
                ? <Check className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                : <Circle className="w-4 h-4 text-ink-5 flex-shrink-0 mt-0.5" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`font-medium ${s.isActive ? 'text-ink' : 'text-ink-3'}`}>
                    {s.serviceName}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${EMPHASIS_TONE[s.emphasis]}`}>
                    {EMPHASIS_LABEL[s.emphasis]}
                  </span>
                  {!s.isActive && (
                    <span className="text-[10px] text-ink-4 italic">not in your current plan</span>
                  )}
                </div>
                {s.rationale && (
                  <p className="text-[11px] text-ink-3 mt-0.5 leading-relaxed">{s.rationale}</p>
                )}
              </div>
            </div>
          ))}
          {exp.shapeAware && (
            <p className="text-[11px] text-ink-4 italic pt-2 border-t border-ink-7">
              This mix is tailored to your restaurant shape.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
