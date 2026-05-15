'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cancelService } from '@/lib/dashboard/subscribe-to-service'

export default function CancelServiceButton({
  clientServiceId, serviceName,
}: { clientServiceId: string; serviceName: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function doCancel() {
    setError(null)
    startTransition(async () => {
      const r = await cancelService(clientServiceId)
      if (!r.success) { setError(r.error); return }
      setConfirmOpen(false)
      router.refresh()
    })
  }

  if (confirmOpen) {
    return (
      <div className="rounded-xl bg-rose-50 ring-1 ring-rose-100 p-3 space-y-2">
        <p className="text-[12px] text-rose-800">
          Cancel <span className="font-semibold">{serviceName}</span>? Your strategist stops new work
          immediately. You&apos;re billed for the remainder of the current period.
        </p>
        <div className="flex items-center gap-2">
          <button
            disabled={pending}
            onClick={doCancel}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded-full px-3 py-1.5"
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin" />}
            Yes, cancel
          </button>
          <button
            disabled={pending}
            onClick={() => setConfirmOpen(false)}
            className="text-[12px] text-rose-800 hover:text-rose-900 px-2 py-1.5"
          >
            Keep it
          </button>
        </div>
        {error && <p className="text-[11px] text-rose-700">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmOpen(true)}
      className="w-full text-[12px] text-ink-3 hover:text-rose-600 hover:bg-rose-50 px-3 py-2 rounded transition-colors"
    >
      Cancel this service
    </button>
  )
}
