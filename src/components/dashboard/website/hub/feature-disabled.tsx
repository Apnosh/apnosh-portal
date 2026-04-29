/**
 * Empty state shown on a focused editor page when the corresponding feature
 * isn't enabled in the customer's apnosh-content.json `features` array.
 *
 * Why a dedicated component: the same shell renders for every disabled
 * feature, and we want the message + CTA to feel consistent.
 */

import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface Props {
  featureLabel: string  // e.g. "Menu", "Daily specials"
}

export default function FeatureDisabled({ featureLabel }: Props) {
  return (
    <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20">
      <Link
        href="/dashboard/website/manage"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to my website
      </Link>

      <div className="rounded-xl border border-ink-6 bg-white p-8 text-center">
        <div className="text-base font-semibold text-ink mb-1">
          {featureLabel} isn&apos;t enabled for your site
        </div>
        <p className="text-sm text-ink-3 max-w-[460px] mx-auto mb-5">
          Your site hasn&apos;t declared this content area in its schema.
          If you&apos;d like to add it, send a quick request and we&apos;ll wire it up.
        </p>
        <Link
          href="/dashboard/website/requests/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-ink text-white text-xs font-medium hover:bg-ink/90"
        >
          Send a request <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}
