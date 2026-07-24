'use client'

/**
 * EarningsView — the creator's "Get paid" screen. Shows what they've earned (net of the platform fee)
 * and their Stripe payout status, with a Connect-your-bank button that opens Stripe's hosted
 * onboarding. Honest about the gated state: when payouts aren't turned on yet, it says so instead of
 * offering a button that can't work.
 */

import { useEffect, useState } from 'react'
import { Loader2, Check, Landmark, ExternalLink, RefreshCw } from 'lucide-react'
import type { VendorConnectStatus } from '@/lib/campaigns/vendor-connect'
import type { CreatorEarnings, CreatorPayoutLine } from '@/lib/campaigns/view'
import { startMyPayoutOnboarding, refreshMyPayoutStatus } from '@/app/creator/earnings/actions'

function money(cents: number): string {
  const d = (cents || 0) / 100
  return d % 1 === 0 ? `$${d.toLocaleString('en-US')}` : `$${d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null

const LINE_STATE: Record<CreatorPayoutLine['status'], { label: string; cls: string }> = {
  accrued: { label: 'On the way', cls: 'bg-neutral-100 text-neutral-600' },
  payable: { label: 'Ready to pay', cls: 'bg-amber-50 text-amber-700' },
  paid: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700' },
}

export default function EarningsView({ earnings, lines, connect, payoutsLive }: { earnings: CreatorEarnings; lines: CreatorPayoutLine[]; connect: VendorConnectStatus; payoutsLive: boolean }) {
  const [status, setStatus] = useState<VendorConnectStatus>(connect)
  const [busy, setBusy] = useState<'connect' | 'refresh' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pendingCents = Math.max(0, (earnings.netCents || 0) - (earnings.paidCents || 0))

  async function refresh() {
    setBusy('refresh'); setError(null)
    const s = await refreshMyPayoutStatus()
    setBusy(null)
    if (s) setStatus(s)
  }

  // If they just came back from Stripe onboarding (?connect=done), pull their fresh status once.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('connect=')) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connectBank() {
    setBusy('connect'); setError(null)
    const res = await startMyPayoutOnboarding(window.location.origin)
    if (res.ok) { window.location.href = res.url; return }
    setBusy(null); setError(res.error)
  }

  const connected = status.payoutsEnabled
  const started = status.hasAccount && !status.payoutsEnabled

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className="text-xl font-bold text-neutral-900">Get paid</h1>
      <p className="text-sm text-neutral-500 mt-1 mb-6">What you&apos;ve earned, and where it goes.</p>

      {/* The one number they came for: what is still owed to them. "Earned" and "on the way" used to
          sit side by side showing the SAME figure until a payout actually happened, which read like a
          bug. Paid out and all-time are the quieter supporting pair. */}
      <div className="rounded-2xl border border-neutral-200 p-5 mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">On the way to you</div>
        <div className="text-[34px] font-bold text-neutral-900 mt-0.5 tabular-nums leading-none">{money(pendingCents)}</div>
        <p className="text-[12.5px] text-neutral-500 mt-2">
          {earnings.count === 0
            ? 'Nothing yet. Finish a job and what you earn shows up here.'
            : `From ${earnings.count} ${earnings.count === 1 ? 'job' : 'jobs'} the restaurant has approved.`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl border border-neutral-200 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Paid out</div>
          <div className="text-[17px] font-bold text-emerald-700 mt-0.5 tabular-nums">{money(earnings.paidCents)}</div>
        </div>
        <div className="rounded-2xl border border-neutral-200 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">All time</div>
          <div className="text-[17px] font-bold text-neutral-900 mt-0.5 tabular-nums">{money(earnings.netCents)}</div>
        </div>
      </div>
      <p className="text-[12px] text-neutral-400 mb-6">
        {earnings.feeCents > 0
          ? `You keep your rate minus the Apnosh fee, which is ${money(earnings.feeCents)} so far. A piece is paid out after the restaurant approves it and their invoice clears.`
          : 'You keep your rate minus the Apnosh fee. A piece is paid out after the restaurant approves it and their invoice clears.'}
      </p>

      {/* Job by job, so the fee is a real number against real work rather than a policy sentence. */}
      {lines.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">Your jobs</h2>
          <div className="space-y-2">
            {lines.map((l) => {
              const st = LINE_STATE[l.status]
              const day = fmtDay(l.date)
              return (
                <div key={l.workOrderId} className="rounded-2xl border border-neutral-200 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[14px] font-semibold text-neutral-900">{l.title}</p>
                    <span className="shrink-0 text-[15px] font-bold text-neutral-900 tabular-nums">{money(l.netCents)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="truncate text-[12px] text-neutral-500">
                      {[l.restaurantName, day].filter(Boolean).join(' · ') || 'Booked work'}
                    </p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                  {l.grossCents > 0 && (
                    <p className="mt-1.5 text-[11.5px] text-neutral-400 tabular-nums">
                      {money(l.grossCents)} for the job, less {money(l.feeCents)} Apnosh fee
                      {l.feePercent > 0 ? ` (${Math.round(l.feePercent)}%)` : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Payout status */}
      <div className="rounded-2xl border border-neutral-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-4 h-4 text-neutral-500" />
          <h2 className="text-[15px] font-semibold text-neutral-900">Your bank</h2>
        </div>

        {!payoutsLive ? (
          <>
            <p className="text-[13px] text-neutral-500 leading-relaxed mt-1">
              Payouts are being set up. You&apos;ll connect your bank right here soon. Your earnings keep adding up in the meantime.
            </p>
            <span className="inline-block mt-3 text-[10px] font-bold uppercase tracking-wide bg-neutral-100 text-neutral-500 rounded-full px-2.5 py-1">Coming soon</span>
          </>
        ) : connected ? (
          <div className="mt-1">
            <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700"><Check className="w-4 h-4" /> Bank connected. Payouts are on.</div>
            <p className="text-[12px] text-neutral-500 mt-1">Approved work is transferred to your bank automatically.</p>
            <button onClick={refresh} disabled={busy === 'refresh'} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 hover:text-neutral-800">
              {busy === 'refresh' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh status
            </button>
          </div>
        ) : (
          <div className="mt-1">
            <p className="text-[13px] text-neutral-500 leading-relaxed">
              {started
                ? 'Almost there. Finish connecting your bank with Stripe so we can pay you.'
                : 'Connect your bank through Stripe so Apnosh can pay you. Stripe handles your details securely; we never see them.'}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button onClick={connectBank} disabled={busy === 'connect'}
                className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                {busy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                {started ? 'Finish connecting' : 'Connect your bank'}
              </button>
              {status.hasAccount && (
                <button onClick={refresh} disabled={busy === 'refresh'} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 hover:text-neutral-800">
                  {busy === 'refresh' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
                </button>
              )}
            </div>
          </div>
        )}

        {error && <div className="mt-3 text-[12px] text-rose-600">{error}</div>}
      </div>
    </div>
  )
}
