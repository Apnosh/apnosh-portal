'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { triggerCustomerEyeView } from './actions'

/**
 * Client button that calls the trigger action. Customer eye view runs
 * take ~30s (Claude reads through GBP, website, reviews) so we show a
 * loader and disable the button while pending.
 */
export default function RunButton({
  clientSlug,
  hasExisting,
}: {
  clientSlug?: string
  hasExisting: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onClick = () => {
    setError(null)
    startTransition(async () => {
      const r = await triggerCustomerEyeView(clientSlug)
      if (!r.ok) {
        setError(r.error ?? 'Something went wrong')
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 bg-brand text-white text-[13.5px] font-semibold rounded-full px-5 py-2.5 hover:bg-brand-dark transition disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Looking through your data...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {hasExisting ? 'Run a fresh look' : 'See how a customer sees you'}
          </>
        )}
      </button>
      {pending && (
        <p className="text-[12px] text-ink-3 mt-2">
          Takes about 30 seconds. We&apos;re reading your listing, website, and recent reviews.
        </p>
      )}
      {error && (
        <p className="text-[12.5px] text-rose-700 mt-2">{error}</p>
      )}
    </div>
  )
}
