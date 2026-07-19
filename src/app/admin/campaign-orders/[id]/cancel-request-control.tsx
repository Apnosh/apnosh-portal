'use client'

/** Approve or decline an owner's cancellation request. Approve runs the real
 *  terminal stop (void un-started work, cancel subscriptions); decline keeps the
 *  order running. Either way the owner is notified by the server. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelRequestControl({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(action: 'approve' | 'decline') {
    if (busy) return
    if (action === 'approve' && typeof window !== 'undefined' &&
      !window.confirm('Approve cancellation? This stops the order now: no new work or posts, un-started work is voided, and monthly billing is canceled. Work already in flight still finishes and bills.')) return
    const note = action === 'decline' && typeof window !== 'undefined'
      ? (window.prompt('Optional note to the owner on why it could not be canceled:') ?? '')
      : ''
    setBusy(action); setError(null)
    try {
      const r = await fetch(`/api/admin/campaign-orders/${id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pl-7">
      <button onClick={() => act('approve')} disabled={!!busy}
        className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60">
        {busy === 'approve' ? 'Canceling…' : 'Approve cancellation'}
      </button>
      <button onClick={() => act('decline')} disabled={!!busy}
        className="rounded-lg border border-ink-6 hover:bg-ink-7 text-ink text-sm font-semibold px-4 py-2 disabled:opacity-60">
        {busy === 'decline' ? 'Declining…' : 'Decline (keep running)'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
