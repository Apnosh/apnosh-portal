'use client'
/**
 * ConnectPayouts — the admin control for a vendor's Stripe Connect payout onboarding (G5). Start the
 * Stripe-hosted onboarding (opens the link), then refresh to see when payouts are enabled. Honest by
 * construction: shows the real Stripe account status, and says plainly when the flag is off.
 */
import { useState, useTransition } from 'react'
import { startVendorOnboarding, refreshVendorConnectStatus } from './connect-actions'
import type { VendorConnectStatus } from '@/lib/campaigns/vendor-connect'

export default function ConnectPayouts({ vendorId, initial }: { vendorId: string; initial: VendorConnectStatus }) {
  const [status, setStatus] = useState<VendorConnectStatus>(initial)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [pending, start] = useTransition()

  const onStart = () => start(async () => {
    setMsg(null)
    const r = await startVendorOnboarding(vendorId)
    if (!r.ok) { setMsg({ text: r.error, bad: true }); return }
    window.open(r.url, '_blank', 'noopener')
    setMsg({ text: 'Onboarding opened in a new tab. Complete it, then tap Refresh.' })
  })

  const onRefresh = () => start(async () => {
    setMsg(null)
    const r = await refreshVendorConnectStatus(vendorId)
    if (!r.ok) { setMsg({ text: r.error, bad: true }); return }
    setStatus(r.status)
  })

  const pill = status.payoutsEnabled
    ? { label: 'Payouts enabled', cls: 'bg-emerald-100 text-emerald-800' }
    : status.hasAccount
    ? { label: status.detailsSubmitted ? 'Onboarding submitted — pending' : 'Onboarding not finished', cls: 'bg-amber-100 text-amber-800' }
    : { label: 'Not onboarded', cls: 'bg-ink-7 text-ink-3' }

  return (
    <div className="bg-white border border-ink-6 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1">Payouts (Stripe Connect)</p>
          <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${pill.cls}`}>{pill.label}</span>
          {status.accountId && <span className="ml-2 text-[10.5px] text-ink-4 font-mono">{status.accountId}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onStart} disabled={pending} className="text-[12.5px] font-semibold rounded-lg px-3 py-1.5 bg-ink text-white disabled:opacity-50">{status.hasAccount ? 'Continue onboarding' : 'Start payout onboarding'}</button>
          {status.hasAccount && <button onClick={onRefresh} disabled={pending} className="text-[12.5px] font-medium rounded-lg px-3 py-1.5 border border-ink-6 text-ink-3">Refresh</button>}
        </div>
      </div>
      <p className="text-[11.5px] text-ink-3 mt-2">A vendor must finish Stripe onboarding before a payout can be sent. Test mode only, gated by STRIPE_CONNECT_PAYOUTS.</p>
      {msg && <p className={`text-[12px] mt-2 ${msg.bad ? 'text-red-600' : 'text-emerald-700'}`}>{msg.text}</p>}
    </div>
  )
}
