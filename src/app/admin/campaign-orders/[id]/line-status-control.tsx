'use client'

/** Admin override for one plan line's status: a compact segmented control (Not started / In progress /
 *  Complete). Writes via PATCH and refreshes the server component so the row's pill + stepper reflect
 *  the new status. Optimistic: the clicked option lights immediately, reverting if the write fails. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

type Lock = 'editable' | 'in-production' | 'delivered'
const OPTS: { key: Lock; label: string; active: string }[] = [
  { key: 'editable', label: 'Not started', active: 'bg-white text-ink shadow-sm' },
  { key: 'in-production', label: 'In progress', active: 'bg-blue-50 text-blue-600 shadow-sm' },
  { key: 'delivered', label: 'Complete', active: 'bg-brand-tint text-brand-dark shadow-sm' },
]

export default function LineStatusControl({ campaignId, lineId, current }: { campaignId: string; lineId: string; current: Lock }) {
  const router = useRouter()
  const [val, setVal] = useState<Lock>(current)
  const [busy, setBusy] = useState<Lock | null>(null)
  const [error, setError] = useState(false)

  async function set(lock: Lock) {
    if (lock === val || busy) return
    const prev = val
    setVal(lock)
    setBusy(lock)
    setError(false)
    try {
      const r = await fetch(`/api/admin/campaign-orders/${campaignId}/line`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineId, lock }),
      })
      if (!r.ok) throw new Error()
      router.refresh()
    } catch {
      setVal(prev)
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-ink-4 uppercase tracking-wide font-medium">Mark</span>
      <div className="inline-flex rounded-lg bg-bg-2 p-0.5 border border-ink-6">
        {OPTS.map((o) => {
          const on = val === o.key
          return (
            <button
              key={o.key}
              onClick={() => set(o.key)}
              disabled={!!busy}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${on ? o.active : 'text-ink-3 hover:text-ink'} disabled:opacity-60`}
            >
              {busy === o.key && <Loader2 className="w-3 h-3 animate-spin" />}
              {o.label}
            </button>
          )
        })}
      </div>
      {error && <span className="text-[11px] text-red-600">Did not save</span>}
    </div>
  )
}
