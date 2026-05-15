'use client'

/**
 * Unified Performance page. Replaces the old split between
 * /social/performance (KPI summary) and /social/results (deep dive).
 *
 * Two stacked views behind a Summary / Deep dive tab strip:
 *   - Summary  → SummaryView (the old performance page)
 *   - Deep dive → DeepView   (the old results page)
 *
 * The view is controlled by ?view=summary|deep so AMs can deep-link
 * to either tab from a report or note. Defaults to Summary.
 *
 * /social/results still works -- it redirects here with ?view=deep.
 */

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { SummaryView } from './summary-view'
import { DeepView } from './deep-view'

type View = 'summary' | 'deep'

export default function SocialPerformancePage() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const view: View = params.get('view') === 'deep' ? 'deep' : 'summary'

  function setView(v: View) {
    const sp = new URLSearchParams(params.toString())
    if (v === 'summary') sp.delete('view')
    else sp.set('view', v)
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      {/* Page title */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Social
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-ink-4" />
          Performance
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          Your reach, engagement, and growth across platforms.
        </p>
      </div>

      {/* Summary / Deep dive toggle */}
      <div
        role="tablist"
        aria-label="Performance view"
        className="inline-flex p-1 rounded-full bg-bg-2 border border-ink-6"
      >
        <button
          role="tab"
          aria-selected={view === 'summary'}
          onClick={() => setView('summary')}
          className={`px-4 py-1.5 text-[12.5px] font-medium rounded-full transition-colors ${
            view === 'summary' ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          Summary
        </button>
        <button
          role="tab"
          aria-selected={view === 'deep'}
          onClick={() => setView('deep')}
          className={`px-4 py-1.5 text-[12.5px] font-medium rounded-full transition-colors ${
            view === 'deep' ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          Deep dive
        </button>
      </div>

      {/* Active view */}
      {view === 'summary' ? <SummaryView /> : <DeepView />}
    </div>
  )
}
