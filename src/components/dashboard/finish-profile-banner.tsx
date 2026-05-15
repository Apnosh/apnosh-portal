'use client'

/**
 * Surface a "Complete your profile" banner on the dashboard when the
 * client used "Save and explore portal" mid-onboarding. We don't
 * want to block them from poking around -- they got into the portal
 * exactly because we promised them they could -- but we do want a
 * persistent nudge to finish the data capture that strategists need.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function FinishProfileBanner() {
  const [show, setShow] = useState(false)
  const [stepLeftOff, setStepLeftOff] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: biz } = await supabase
        .from('businesses')
        .select('onboarding_paused, onboarding_step')
        .eq('owner_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (biz?.onboarding_paused) {
        setShow(true)
        setStepLeftOff(biz.onboarding_step ?? null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (!show || dismissed) return null

  return (
    <div className="mx-4 lg:mx-8 mt-4 rounded-2xl bg-gradient-to-r from-amber-50 via-amber-50 to-rose-50 ring-1 ring-amber-200/60 px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-ink">
          Finish your profile so your strategist can do their best work
        </p>
        <p className="text-[11.5px] text-ink-3 mt-0.5">
          We saved your progress. A few more questions = better content from day one.
          {stepLeftOff && stepLeftOff > 1 && (
            <span className="text-ink-4"> · You left off on step {stepLeftOff}.</span>
          )}
        </p>
      </div>
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-full px-3 py-1.5 flex-shrink-0"
      >
        Continue
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="text-ink-4 hover:text-ink-2 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
