/**
 * Top-of-page stepper for the /setup wizard.
 * Server component -- the parent page passes which step is current.
 */

import Link from 'next/link'
import { Check } from 'lucide-react'

const STEPS = [
  { num: 1, label: 'Your restaurant', href: '/setup/restaurant' },
  { num: 2, label: 'Pick goals', href: '/setup/goals' },
  { num: 3, label: 'Connect accounts', href: '/setup/connect' },
]

export default function SetupStepHeader({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <div className="border-b bg-white" style={{ borderColor: 'var(--db-border)' }}>
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <Link href="/" className="text-xl font-bold text-ink tracking-tight">
            Apn<em className="text-emerald-700 not-italic">osh</em>
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">
            Step {currentStep} of 3
          </span>
        </div>
        <div className="flex items-center gap-2">
          {STEPS.map((step, i) => {
            const isDone = step.num < currentStep
            const isCurrent = step.num === currentStep
            return (
              <div key={step.num} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-600'
                      : 'bg-ink-7 text-ink-4'
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : step.num}
                </div>
                <span
                  className={`text-[12px] font-medium whitespace-nowrap ${
                    isCurrent ? 'text-ink' : isDone ? 'text-ink-3' : 'text-ink-4'
                  }`}
                >
                  {step.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={`h-px flex-1 ml-2 ${isDone ? 'bg-emerald-300' : 'bg-ink-6'}`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
