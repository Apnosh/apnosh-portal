'use client'

/**
 * Build sheet — the "+" is the single front door to building a campaign.
 *
 * Redesigned to mirror the campaign builder's start screen (outcome-first:
 * "what result do you want?"). Same outcomes + wording as the builder so the
 * portal and the builder feel like one product. Picking an outcome opens the
 * live request flow today; "build it yourself" opens the campaign builder.
 *
 * Maintenance actions that used to live here (reply to reviews, update
 * business) were moved out — they belong in Review and Settings, not Build.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { X, ArrowRight, Sparkles } from 'lucide-react'

/* The team's campaign builder (work in progress, separate deploy). Until it's
   mounted under the portal shell (multi-zone) and reads real business context,
   this opens the standalone builder. Swap for the stable URL / same-domain
   path when it lands. */
const BUILDER_URL = 'https://apnosh-flow-builder-git-claude-mobile-friendly-op-b11c7e-apnosh.vercel.app/v2/start'

interface ActionSheetProps {
  open: boolean
  onClose: () => void
  strategistId?: string | null
}

interface Outcome {
  key: string
  emoji: string
  label: string
  description: string
}

/* The four results an owner can chase — identical to the builder's. */
const OUTCOMES: Outcome[] = [
  { key: 'new_customers', emoji: '📣', label: 'Get more new customers', description: 'Be found by people who’ve never been in.' },
  { key: 'regulars',      emoji: '💛', label: 'Turn visitors into regulars', description: 'Bring first-timers back, again and again.' },
  { key: 'slow_nights',   emoji: '🌙', label: 'Fill the slow nights', description: 'Drive covers on your quiet days.' },
  { key: 'reviews',       emoji: '⭐', label: 'Fix reviews & rating', description: 'More fresh reviews and a higher rating.' },
]

export default function ActionSheet({ open, onClose }: ActionSheetProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /* Open the live request flow on the current page, preserving existing
     params (e.g. ?clientId for admins) and seeding the chosen goal. */
  const outcomeHref = (goal: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('request', 'open')
    params.set('goal', goal)
    return `${pathname}?${params.toString()}`
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close build"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/40 sheet-backdrop lg:hidden"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Build a campaign"
        className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl sheet-up safe-bottom lg:hidden max-h-[85vh] flex flex-col"
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-6" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-2">
          <div>
            <h2 className="text-[19px] font-semibold text-ink leading-tight">Build a campaign</h2>
            <p className="text-[13px] text-ink-3 mt-0.5">Pick the result you’re after. We handle the rest.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-ink-7 text-ink-3 flex items-center justify-center active:bg-ink-6 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3 pb-3 pt-1 overflow-y-auto touch-scroll">
          <ul>
            {OUTCOMES.map(o => (
              <li key={o.key}>
                <Link
                  href={outcomeHref(o.key)}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl active:bg-ink-7 transition-colors min-h-[64px]"
                >
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl flex-shrink-0 bg-ink-7 text-[22px] leading-none">
                    {o.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-ink leading-tight">{o.label}</p>
                    <p className="text-[12.5px] text-ink-3 mt-0.5">{o.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Build-it-yourself: hands off to the campaign builder. */}
          <div className="mt-2 pt-3 border-t border-ink-7">
            <a
              href={BUILDER_URL}
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-3 rounded-2xl active:bg-ink-7 transition-colors"
            >
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl flex-shrink-0 bg-brand-tint text-brand-dark">
                <Sparkles className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-ink leading-tight">Build it yourself</p>
                <p className="text-[12.5px] text-ink-3 mt-0.5">Open the campaign builder and design every step.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
