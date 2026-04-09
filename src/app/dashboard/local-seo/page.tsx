'use client'

import Link from 'next/link'
import { MapPin, Plus, Star, TrendingUp, Search } from 'lucide-react'

export default function LocalSeoComingSoonPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-3">
          <MapPin className="w-7 h-7 text-ink-4" />
          Local Business & SEO
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          Google Business Profile, local rankings, review management, and citations.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
          <MapPin className="w-6 h-6 text-ink-4" />
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Coming Soon</h2>
        <p className="text-sm text-ink-3 mt-1 max-w-md mx-auto">
          Full Local SEO management coming soon. Your GBP analytics are already available under Reports.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Link
            href="/dashboard/analytics"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <TrendingUp className="w-4 h-4" />
            View GBP Analytics
          </Link>
          <Link
            href="/dashboard/local-seo/reviews"
            className="inline-flex items-center gap-2 bg-white border border-ink-6 hover:border-ink-4 text-ink text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <Star className="w-4 h-4" />
            View Reviews
          </Link>
        </div>
      </div>

      {/* Quick links to real features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/dashboard/analytics"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">GBP Analytics</div>
              <div className="text-xs text-ink-4">Impressions, calls, directions</div>
            </div>
          </div>
        </Link>
        <Link
          href="/dashboard/local-seo/reviews"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <Star className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">Reviews</div>
              <div className="text-xs text-ink-4">Google, Yelp, and more</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
