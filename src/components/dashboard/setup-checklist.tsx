'use client'

/**
 * First-run / setup checklist surface.
 *
 * Pulls onboarding state from getMySetupState(), shows progress + the next
 * action. Hides itself once all steps are done so returning clients don't
 * see it forever.
 *
 * Designed to be the FIRST thing a brand-new client sees on /dashboard --
 * gives them a clear path forward instead of an empty metrics screen.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, Loader2, X } from 'lucide-react'
import { getMySetupState, type SetupState } from '@/lib/dashboard/setup-state'

const DISMISS_KEY = 'apnosh:setup-checklist:dismissed'

export default function SetupChecklist() {
  const [state, setState] = useState<SetupState | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Returning clients who've finished setup once shouldn't see the
    // checklist again even if a future feature flips a step back to
    // not-done. We persist the dismiss in localStorage.
    if (typeof window !== 'undefined') {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
    }
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const res = await getMySetupState()
    if (res.success) setState(res.data)
    setLoading(false)
  }

  function dismiss() {
    setDismissed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1')
    }
  }

  // Hide while loading -- don't flash a half-rendered checklist.
  if (loading) return null
  if (!state || state.isComplete || dismissed) return null

  const next = state.steps.find(s => !s.done)

  return (
    <section className="rounded-xl border border-ink-6 bg-white p-5 mb-6 relative">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 text-ink-4 hover:text-ink-2"
        aria-label="Dismiss setup checklist"
        title="Hide this for now"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start justify-between gap-4 pr-6">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink mb-1">
            Welcome to Apnosh.
          </div>
          <p className="text-sm text-ink-3">
            A few quick steps to get your business set up.
          </p>
        </div>
        <div className="text-xs text-ink-3 font-medium shrink-0">
          {state.completed} of {state.total} done
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-bg-2 rounded-full overflow-hidden">
        <div
          className="h-full bg-ink transition-[width] duration-500"
          style={{ width: `${(state.completed / state.total) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <ul className="mt-4 space-y-2">
        {state.steps.map(step => (
          <li
            key={step.key}
            className="flex items-start gap-3 text-sm"
          >
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                step.done
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-white border-ink-6 text-ink-4'
              }`}
              aria-hidden
            >
              {step.done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`font-medium ${step.done ? 'text-ink-3 line-through' : 'text-ink'}`}>
                {step.label}
              </div>
              {!step.done && (
                <div className="text-xs text-ink-3 mt-0.5">{step.hint}</div>
              )}
            </div>
            {step === next && (
              <Link
                href={step.ctaHref}
                className="px-3 py-1.5 rounded-md bg-ink text-white text-xs font-medium hover:bg-ink/90 inline-flex items-center gap-1 shrink-0"
              >
                {step.ctaLabel}
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// Skeleton variant: render this while page-level data loads so layout
// doesn't shift when the checklist appears.
export function SetupChecklistSkeleton() {
  return (
    <div className="rounded-xl border border-ink-6 bg-white p-5 mb-6 flex items-center justify-center min-h-[120px]">
      <Loader2 className="w-4 h-4 text-ink-4 animate-spin" />
    </div>
  )
}
