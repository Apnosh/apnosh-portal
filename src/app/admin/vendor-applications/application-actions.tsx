'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Eye, Loader2 } from 'lucide-react'
import { approveApplication, declineApplication, markReviewing } from './actions'

interface Props {
  applicationId: string
  status: 'pending' | 'reviewing'
}

export default function ApplicationActions({ applicationId, status }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onApprove = () => {
    setError(null)
    startTransition(async () => {
      const r = await approveApplication(applicationId, notes || undefined)
      if (!r.ok) setError(r.error ?? 'Failed')
      else router.refresh()
    })
  }

  const onDecline = () => {
    setError(null)
    startTransition(async () => {
      const r = await declineApplication(applicationId, notes || undefined)
      if (!r.ok) setError(r.error ?? 'Failed')
      else router.refresh()
    })
  }

  const onMarkReviewing = () => {
    setError(null)
    startTransition(async () => {
      const r = await markReviewing(applicationId)
      if (!r.ok) setError(r.error ?? 'Failed')
      else router.refresh()
    })
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-7 space-y-2">
      {showNotes && (
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Internal notes (optional)..."
          rows={2}
          className="w-full bg-white border border-ink-6 rounded-lg px-3 py-2 text-[12.5px] focus:outline-none focus:border-brand resize-none"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onApprove}
          disabled={pending}
          className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[12px] font-semibold rounded-full px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Approve
        </button>
        <button
          onClick={onDecline}
          disabled={pending}
          className="inline-flex items-center gap-1 bg-rose-600 text-white text-[12px] font-semibold rounded-full px-3 py-1.5 hover:bg-rose-700 disabled:opacity-60"
        >
          <X className="w-3 h-3" />
          Decline
        </button>
        {status === 'pending' && (
          <button
            onClick={onMarkReviewing}
            disabled={pending}
            className="inline-flex items-center gap-1 bg-white border border-ink-6 text-ink-2 text-[12px] font-semibold rounded-full px-3 py-1.5 hover:border-ink-4 disabled:opacity-60"
          >
            <Eye className="w-3 h-3" />
            Mark reviewing
          </button>
        )}
        <button
          onClick={() => setShowNotes(s => !s)}
          className="text-[11.5px] text-ink-3 hover:text-ink-2 underline ml-2"
        >
          {showNotes ? 'Hide notes' : 'Add note'}
        </button>
      </div>
      {error && <p className="text-[11.5px] text-rose-700">{error}</p>}
    </div>
  )
}
