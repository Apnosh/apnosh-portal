/**
 * /marketplace — influencer / UGC creator discovery.
 *
 * Mobile-first feed of available campaign briefs. Each card: restaurant
 * card with cuisine, location, perks (free meal + $X fee), brief
 * snippet, deadline. Tap into full brief, apply with portfolio.
 *
 * Phase 0 ships the gated shell + the visual frame. The campaigns
 * table + apply flow land in Phase 5 proper when we onboard the
 * first creator cohort.
 */

import { Sparkles, MapPin, DollarSign, Clock } from 'lucide-react'
import { requireCapability } from '@/lib/auth/require-capability'

export const dynamic = 'force-dynamic'

export default async function MarketplaceIndex() {
  await requireCapability('influencer')
  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-pink-50 text-pink-700 ring-1 ring-pink-100">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Open campaigns
          </p>
        </div>
        <h1 className="text-[26px] leading-tight font-bold text-ink tracking-tight">
          Pick a restaurant
        </h1>
        <p className="text-[13px] text-ink-3 mt-1.5 leading-relaxed">
          Apply to any campaign. If accepted, you get a free meal plus a fee, and a private workspace with the brief.
        </p>
      </header>

      {/* Sample card — replaced by real campaigns in Phase 5 */}
      <SampleCard />

      <div
        className="rounded-2xl border-2 border-dashed p-8 text-center bg-white mt-4"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <p className="text-[14px] font-semibold text-ink leading-tight">More campaigns coming soon</p>
        <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
          We&rsquo;re onboarding our first wave of restaurants. New gigs drop every week.
        </p>
      </div>
    </div>
  )
}

function SampleCard() {
  return (
    <article
      className="rounded-2xl border bg-white p-4 mb-3"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 rounded-full bg-pink-50 text-pink-700 ring-1 ring-pink-100 flex items-center justify-center text-[12px] font-semibold">
          KB
        </div>
        <div>
          <p className="text-[14px] font-bold text-ink leading-tight">Do Si KBBQ</p>
          <p className="text-[11px] text-ink-3 leading-tight">Korean BBQ · Seattle, WA</p>
        </div>
      </div>
      <p className="text-[13px] text-ink-2 leading-snug mb-3">
        A short reel showing your favorite cuts and our banchan spread. Looking for warm, energetic, mouth-watering shots.
      </p>
      <div className="flex items-center gap-3 text-[11px] text-ink-3 mb-3">
        <span className="inline-flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5" />
          Free meal + $150
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          Reel in 7 days
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" />
          1.2 mi away
        </span>
      </div>
      <button
        type="button"
        disabled
        className="w-full rounded-xl bg-pink-600 text-white text-[14px] font-semibold py-3 opacity-60 cursor-not-allowed"
      >
        Apply (preview)
      </button>
      <p className="text-[10px] text-ink-4 text-center mt-2">
        Sample card. Live campaigns drop once we open the marketplace.
      </p>
    </article>
  )
}
