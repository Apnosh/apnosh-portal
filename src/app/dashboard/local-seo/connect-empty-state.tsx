'use client'

/**
 * Shared empty state shown on any Local SEO sub-page when no Google
 * Business Profile is connected. Replaces raw API errors with a
 * friendly CTA to connect.
 */

import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'

export default function ConnectEmptyState({
  context = 'this page',
  back = '/dashboard/local-seo',
}: {
  /** What this page needs the connection for — e.g. "your listing", "your menu". */
  context?: string
  /** Where the back link goes. */
  back?: string
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6">
        <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to Local SEO
      </Link>
      <div className="rounded-2xl border border-ink-6 bg-white p-8 sm:p-10 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 grid place-items-center mb-4">
          <MapPin className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-semibold text-ink">Connect your Google Business Profile</h2>
        <p className="text-sm text-ink-3 mt-2 max-w-md mx-auto leading-relaxed">
          To edit {context}, link the Google account that manages your business
          listing. We only request the permissions Apnosh needs to read metrics,
          edit your listing, and reply to reviews on your behalf.
        </p>
        <Link
          href="/dashboard/connected-accounts"
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark"
        >
          Connect Google Business Profile
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}
