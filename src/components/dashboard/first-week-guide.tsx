'use client'

/**
 * First-week guide -- a single ordered checklist that replaces the
 * scattered "connect accounts" CTAs on the dashboard for new clients
 * (Phase C3).
 *
 * Hidden once the client has completed all 4 setup steps.
 */

import Link from 'next/link'
import { Check, Circle, ArrowRight, Sparkles } from 'lucide-react'

export interface FirstWeekStep {
  id: string
  label: string
  description: string
  href: string
  done: boolean
}

export default function FirstWeekGuide({ steps }: { steps: FirstWeekStep[] }) {
  const totalSteps = steps.length
  const doneCount = steps.filter(s => s.done).length
  if (totalSteps === 0 || doneCount === totalSteps) return null

  const nextStep = steps.find(s => !s.done)

  return (
    <section className="mb-6 db-fade db-d1">
      <div
        className="rounded-xl p-5 border bg-white"
        style={{ borderColor: 'var(--db-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-ink">Getting set up</h2>
          </div>
          <span className="text-[12px] text-ink-3 font-semibold">
            {doneCount} of {totalSteps}
          </span>
        </div>

        <div className="space-y-2 mb-4">
          {steps.map(s => (
            <Link
              key={s.id}
              href={s.href}
              className="flex items-start gap-2.5 text-sm hover:bg-bg-2 -mx-2 px-2 py-1.5 rounded-md transition-colors"
            >
              {s.done
                ? <Check className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                : <Circle className="w-4 h-4 text-ink-5 flex-shrink-0 mt-0.5" />
              }
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${s.done ? 'text-ink-3 line-through' : 'text-ink'}`}>
                  {s.label}
                </p>
                {!s.done && (
                  <p className="text-[12px] text-ink-3 mt-0.5 leading-snug">{s.description}</p>
                )}
              </div>
              {!s.done && <ArrowRight className="w-3.5 h-3.5 text-ink-4 flex-shrink-0 mt-1" />}
            </Link>
          ))}
        </div>

        {nextStep && (
          <Link
            href={nextStep.href}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            {doneCount === 0 ? 'Get started' : 'Continue'} →
          </Link>
        )}
      </div>
    </section>
  )
}
