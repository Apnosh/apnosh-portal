'use client'

/** Confirm an order from the detail page. Same POST the queue uses; on success it refreshes the
 *  server component so the header flips to "Confirmed". */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ConfirmButton({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/admin/campaign-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Confirm failed')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confirm failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={confirm}
        disabled={busy}
        className="shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60"
      >
        {busy ? 'Confirming…' : 'Confirm order'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
