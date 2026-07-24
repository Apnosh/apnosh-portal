'use client'

/**
 * Pending review queue — the admin side of the review gate. Self-serve creators sign up out of the
 * store (bookable=false); they show here until an admin approves them in. Approve puts them live and
 * tells them. Sits at the top of the creators list so new signups are the first thing seen.
 */

import { useState } from 'react'
import Link from 'next/link'
import { UserCheck, Loader2 } from 'lucide-react'
import { setCreatorLive } from '@/app/admin/vendor-applications/actions'

export interface PendingCreator {
  id: string
  slug: string
  name: string
  craft: string | null
}

export default function PendingReview({ initial }: { initial: PendingCreator[] }) {
  const [pending, setPending] = useState<PendingCreator[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)

  if (pending.length === 0) return null

  async function approve(id: string) {
    setBusy(id)
    const res = await setCreatorLive(id, true)
    setBusy(null)
    if (res.ok) setPending((p) => p.filter((x) => x.id !== id))
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Waiting for review</h2>
        <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{pending.length}</span>
      </div>
      <p className="text-[12px] text-ink-3 mt-1 mb-3">Creators who signed up and aren&apos;t in the store yet. Approve to publish them.</p>
      <div className="space-y-2">
        {pending.map((v) => (
          <div key={v.id} className="bg-white rounded-xl border border-amber-200 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-ink truncate">{v.name}</p>
                {v.craft && <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{v.craft}</span>}
              </div>
              <Link href={`/admin/vendors/${v.slug}`} className="text-[11px] text-brand-dark hover:underline">Review profile →</Link>
            </div>
            <button onClick={() => approve(v.id)} disabled={busy === v.id}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ink text-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-40">
              {busy === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />} Approve
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
