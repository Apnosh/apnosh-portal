'use client'

/**
 * Creator payouts — the money-out half of the campaign ledger, on the admin
 * billing page. Shows what each maker is owed and, when Stripe Connect payouts
 * are enabled, pays a vendor with one click.
 *
 * Status vocabulary (creator_payouts, migration 181):
 *   accrued — the owner approved the piece; Apnosh owes the maker.
 *   payable — the CLIENT's invoice was paid (invoice bridge) — safe to pay out.
 *   paid    — a real Stripe transfer went out (stripe_transfer_id on the row).
 * Internal-team rows have no Pay button: the margin is Apnosh's, there is no
 * external account to pay.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { listCreatorPayouts, payCreatorPayout, type PayoutListRow } from '@/app/admin/billing/payout-actions'

const STATUS_STYLE: Record<string, string> = {
  accrued: 'bg-amber-50 text-amber-700 border-amber-200',
  payable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid: 'bg-ink-6/40 text-ink-3 border-ink-6',
}

export function CreatorPayoutsCard() {
  const [payouts, setPayouts] = useState<PayoutListRow[]>([])
  const [connectEnabled, setConnectEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listCreatorPayouts()
    if (res.ok) { setPayouts(res.payouts); setConnectEnabled(res.connectEnabled) }
    else setError(res.error)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function onPay(p: PayoutListRow) {
    if (!confirm(`Send $${(p.netCents / 100).toFixed(2)} to ${p.creatorName}? This is a real Stripe transfer.`)) return
    setBusyId(p.id); setError(null); setNotice(null)
    const res = await payCreatorPayout(p.id)
    setBusyId(null)
    if (!res.ok) { setError(res.error); load(); return }   // reload — another admin may have just paid it
    setNotice(`Paid ${p.creatorName} $${(p.netCents / 100).toFixed(2)}.`)
    load()
  }

  // Only vendor rows are money that leaves — internal-team net is Apnosh margin.
  const owed = payouts.filter((p) => p.isVendor && p.status !== 'paid').reduce((s, p) => s + p.netCents, 0)

  if (loading) {
    return (
      <div className="bg-white border border-ink-6 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">Creator payouts</h3>
        <div className="flex items-center gap-2 text-sm text-ink-3"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      </div>
    )
  }
  if (!payouts.length) return null   // nothing owed, nothing paid — no empty furniture

  return (
    <div className="bg-white border border-ink-6 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Creator payouts</h3>
        {owed > 0 && <span className="text-[12px] text-ink-3">${(owed / 100).toFixed(2)} owed to vendors</span>}
      </div>

      {error && <div className="mb-2 text-[12px] text-red-600">{error}</div>}
      {notice && <div className="mb-2 text-[12px] text-emerald-700">{notice}</div>}
      {!connectEnabled && (
        <div className="mb-2 text-[11px] text-ink-3">
          Stripe Connect payouts are off — the ledger tracks what is owed; transfers turn on with STRIPE_CONNECT_PAYOUTS.
        </div>
      )}

      <div className="space-y-1.5">
        {payouts.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-ink-6 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink truncate">{p.creatorName}</div>
              <div className="text-[11px] text-ink-3 truncate">{p.clientName} · {p.campaignName}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[13px] font-medium text-ink">${(p.netCents / 100).toFixed(2)}</div>
              <div className="text-[10px] text-ink-4">of ${(p.grossCents / 100).toFixed(2)} gross</div>
            </div>
            <span className={`shrink-0 text-[10px] font-medium border rounded-full px-2 py-0.5 ${STATUS_STYLE[p.status] ?? STATUS_STYLE.accrued}`}>
              {p.status}
            </span>
            {/* Pay only when PAYABLE: accrued means the client's invoice hasn't
                been paid yet — money-out strictly follows money-in. */}
            {p.isVendor && p.status === 'payable' && (
              <button
                onClick={() => onPay(p)}
                disabled={busyId === p.id || !connectEnabled}
                title={connectEnabled ? undefined : 'Enable STRIPE_CONNECT_PAYOUTS to pay vendors'}
                className="shrink-0 bg-white hover:bg-bg-2 border border-ink-6 text-ink text-[11px] font-medium rounded-lg px-2.5 py-1 inline-flex items-center gap-1 disabled:opacity-40"
              >
                {busyId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Pay
              </button>
            )}
            {p.isVendor && p.status === 'accrued' && (
              <span className="shrink-0 text-[10px] text-ink-4" title="Becomes payable when the client pays their invoice">awaits client payment</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
