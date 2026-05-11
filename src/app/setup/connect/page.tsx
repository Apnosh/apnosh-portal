/**
 * /setup/connect — step 3 of onboarding.
 *
 * Skippable. Owner can finish setup without connecting accounts and add
 * them later from /dashboard/connected-accounts. We don't gate the
 * dashboard on connections existing -- the goal layer works without them,
 * just with less data.
 */

import Link from 'next/link'
import { ArrowRight, Plug, SkipForward } from 'lucide-react'
import SetupStepHeader from '../setup-step-header'

export const dynamic = 'force-dynamic'

export default function SetupConnectStep() {
  return (
    <div>
      <SetupStepHeader currentStep={3} />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <Plug className="w-7 h-7 text-emerald-700" />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">Connect your accounts</h1>
          <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">
            Connect Google Business Profile, Instagram, and your website so we can
            track progress on your goals. You can do this now or later.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5" style={{ borderColor: 'var(--db-border)' }}>
          <p className="text-sm text-ink-2 leading-relaxed mb-4">
            For most owners, connecting Google Business Profile first unlocks the most
            data — reviews, search visibility, calls, directions. We recommend starting there.
          </p>
          <Link
            href="/dashboard/connected-accounts"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            Connect accounts <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="text-center pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"
          >
            <SkipForward className="w-3.5 h-3.5" />
            I&apos;ll do this later
          </Link>
        </div>
      </div>
    </div>
  )
}
