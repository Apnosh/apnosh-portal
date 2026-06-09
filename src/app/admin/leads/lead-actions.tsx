'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Phone, CheckCircle2, Archive, RotateCcw, Loader2, UserPlus, ArrowRight } from 'lucide-react'
import { setLeadStatus, convertLeadToClient } from './actions'
import type { FeatureIntakeStatus } from '@/types/database'

interface Props {
  leadId: string
  status: FeatureIntakeStatus
  clientSlug?: string | null
}

export default function LeadActions({ leadId, status, clientSlug }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const move = (next: FeatureIntakeStatus) => {
    setError(null)
    startTransition(async () => {
      const r = await setLeadStatus(leadId, next)
      if (!r.ok) setError(r.error ?? 'Failed')
      else router.refresh()
    })
  }

  const convert = () => {
    setError(null)
    startTransition(async () => {
      const r = await convertLeadToClient(leadId)
      if (!r.ok) setError(r.error ?? 'Failed')
      else router.refresh()
    })
  }

  /* Converted leads are done — show a link into the CRM instead of actions. */
  if (status === 'converted') {
    return (
      <div className="mt-3 pt-3 border-t border-ink-7 flex items-center gap-3">
        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          In CRM as a lead
        </span>
        {clientSlug && (
          <Link
            href={`/admin/clients/${clientSlug}`}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-dark hover:underline"
          >
            View client <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-7 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={convert}
          disabled={pending}
          className="inline-flex items-center gap-1 bg-brand text-white text-[12px] font-semibold rounded-full px-3 py-1.5 hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
          Convert to CRM
        </button>
        {status !== 'contacted' && status !== 'qualified' && (
          <button
            onClick={() => move('contacted')}
            disabled={pending}
            className="inline-flex items-center gap-1 bg-white border border-ink-6 text-ink-2 text-[12px] font-semibold rounded-full px-3 py-1.5 hover:border-ink-4 disabled:opacity-60"
          >
            <Phone className="w-3 h-3" />
            Mark contacted
          </button>
        )}
        {status !== 'qualified' && (
          <button
            onClick={() => move('qualified')}
            disabled={pending}
            className="inline-flex items-center gap-1 bg-white border border-ink-6 text-ink-2 text-[12px] font-semibold rounded-full px-3 py-1.5 hover:border-ink-4 disabled:opacity-60"
          >
            <CheckCircle2 className="w-3 h-3" />
            Qualify
          </button>
        )}
        {status !== 'archived' ? (
          <button
            onClick={() => move('archived')}
            disabled={pending}
            className="inline-flex items-center gap-1 bg-white border border-ink-6 text-ink-3 text-[12px] font-semibold rounded-full px-3 py-1.5 hover:border-ink-4 disabled:opacity-60"
          >
            <Archive className="w-3 h-3" />
            Archive
          </button>
        ) : (
          <button
            onClick={() => move('new')}
            disabled={pending}
            className="inline-flex items-center gap-1 bg-white border border-ink-6 text-ink-2 text-[12px] font-semibold rounded-full px-3 py-1.5 hover:border-ink-4 disabled:opacity-60"
          >
            <RotateCcw className="w-3 h-3" />
            Reopen
          </button>
        )}
      </div>
      {error && <p className="text-[11.5px] text-rose-700">{error}</p>}
    </div>
  )
}
