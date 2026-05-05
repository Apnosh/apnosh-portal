'use client'

/**
 * Reusable generation-progress modal for any AI design action.
 *
 * Pattern:
 *   - The action runs as a single async fetch (Claude can take 30-60s).
 *   - The modal animates through a list of step labels at fixed intervals
 *     so the user sees motion + an idea of what's happening.
 *   - When the action resolves, the modal jumps to the last step (success)
 *     or shows an error.
 *
 * Doesn't drive the request — caller passes `running` / `done` / `error`
 * and controls completion timing.
 */

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, X, Sparkles } from 'lucide-react'

interface Props {
  open: boolean
  /** Step labels shown in order. */
  steps: string[]
  /** Step interval in ms (default 1800). */
  stepIntervalMs?: number
  /** True while the network call is pending. */
  running: boolean
  /** True when the action completed successfully. */
  done: boolean
  /** Non-null = action failed. Modal shows the message. */
  error: string | null
  /** Title shown at the top. */
  title?: string
  /** Final success message. */
  successMessage?: string
  onClose: () => void
}

export default function GenerationProgressModal({
  open, steps, stepIntervalMs = 1800,
  running, done, error,
  title = 'Generating with Claude',
  successMessage = 'Done — reloading the site builder…',
  onClose,
}: Props) {
  const [step, setStep] = useState(0)

  // Reset on open + tick while running
  useEffect(() => {
    if (!open) return
    setStep(0)
    if (!running) return
    const interval = setInterval(() => {
      setStep(s => Math.min(steps.length - 1, s + 1))
    }, stepIntervalMs)
    return () => clearInterval(interval)
  }, [open, running, steps.length, stepIntervalMs])

  // Snap to final step on completion
  useEffect(() => {
    if (done) setStep(steps.length - 1)
  }, [done, steps.length])

  if (!open) return null

  // Compute fake-progress percentage based on step (last step = 95% if running, 100% if done)
  const totalSteps = steps.length
  const pct = error
    ? 0
    : done
      ? 100
      : Math.min(95, ((step + 1) / totalSteps) * 95)

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={done || error ? onClose : undefined}
      />
      <div className="fixed top-[18vh] left-1/2 -translate-x-1/2 w-[480px] max-w-[92vw] bg-white rounded-2xl shadow-2xl z-50 p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            {error ? (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            ) : done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Sparkles className="w-4 h-4 text-brand" />
            )}
            <h3 className="text-sm font-semibold text-ink">
              {error ? 'Something went wrong' : done ? 'Complete' : title}
            </h3>
          </div>
          {(done || error) && (
            <button onClick={onClose} className="text-ink-4 hover:text-ink p-1">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
            <p className="text-xs text-red-700 font-medium">{error}</p>
            <p className="text-[11px] text-red-600">
              Try a more focused prompt, fewer variants, or wait a moment and retry.
            </p>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="mb-4">
              <div className="h-1.5 bg-ink-6 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 ease-out ${done ? 'bg-emerald-500' : 'bg-brand'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-ink-4 mt-1">
                <span>{Math.round(pct)}%</span>
                {!done && running && <span className="italic">claude is working… typically 20–60s</span>}
              </div>
            </div>

            {/* Step list */}
            <div className="space-y-1.5">
              {steps.map((label, i) => {
                const isDone = done || i < step
                const isActive = !done && i === step
                return (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isActive
                            ? 'bg-brand text-white'
                            : 'bg-ink-6'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-3 h-3" /> :
                        isActive ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                    </span>
                    <span className={isDone || isActive ? 'text-ink' : 'text-ink-4'}>{label}</span>
                  </div>
                )
              })}
            </div>

            {done && (
              <p className="text-[11px] text-ink-3 mt-3 italic">{successMessage}</p>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Curated step lists per action type. */
export const PROGRESS_STEPS = {
  generate: [
    'Reading client profile + onboarding data',
    'Reasoning about audience + mood + voice',
    'Composing brand identity + design system',
    'Drafting hero + about story',
    'Tailoring locations, offerings, FAQs',
    'Polishing copy + SEO',
  ],
  recreate: [
    'Reading client profile + current draft',
    'Forming distinct design strategies',
    'Drafting variant A — full site composition',
    'Drafting variant B — distinct mood + voice',
    'Drafting variant C — alternate direction',
    'Finalizing options',
  ],
  refine: [
    'Reading current draft',
    'Interpreting your direction',
    'Composing the change',
    'Polishing language',
    'Returning the diff',
  ],
  source: [
    'Fetching pages',
    'Extracting structured content',
    'Reconciling across sources',
    'Merging into draft',
  ],
}
