'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { requestMarketplaceBooking } from './actions'

interface Props {
  vendorSlug: string
  listingSlug: string
  listingType: 'subscription' | 'one_off' | 'package' | 'quote'
  isApnosh: boolean
}

export default function BookButton({ vendorSlug, listingSlug, listingType, isApnosh }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; error?: string; needsLogin?: boolean } | null>(null)

  const label = listingType === 'subscription' ? 'Subscribe' : 'Request booking'

  const onClick = () => {
    setResult(null)
    startTransition(async () => {
      const r = await requestMarketplaceBooking({ vendorSlug, listingSlug })
      if (r.needsLogin) {
        router.push(`/login?next=/marketplace/${vendorSlug}`)
        return
      }
      setResult(r)
    })
  }

  if (result?.ok) {
    return (
      <div className="inline-flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 max-w-md">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-ink mb-0.5">
            {isApnosh && listingType === 'subscription'
              ? "You're in. Welcome to Apnosh."
              : 'Request sent'}
          </p>
          <p className="text-[12px] text-ink-2">
            {isApnosh && listingType === 'subscription'
              ? "Your Account Manager will reach out within 24 hours to set up your subscription, schedule your onboarding shoot, and start the work."
              : "Apnosh will coordinate with this vendor and follow up within 1-2 business days."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 bg-ink text-white text-[12.5px] font-semibold rounded-full px-4 py-2 hover:bg-ink-2 transition disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Calendar className="w-3.5 h-3.5" />
            {label}
          </>
        )}
      </button>
      {result?.error && (
        <div className="mt-2 inline-flex items-start gap-1.5 text-rose-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px]">{result.error}</p>
        </div>
      )}
    </div>
  )
}
