'use client'

/**
 * /admin/referrals — the whole loop on one page: every code, every referral, every credit.
 *
 * Staff-only (the route behind it re-checks profiles.role on the server; hiding a page is not a
 * lock). The one action is VOID, and it takes a reason because a ledger with unexplained holes in
 * it is not a ledger. A void kills the referral and whatever is UNSPENT of its credits — money
 * already taken off a bill the owner paid stays taken off, always.
 *
 * English only, like the rest of /admin. The owner-facing surfaces are the translated ones.
 */

import { useCallback, useEffect, useState } from 'react'
import { Ban, RefreshCw } from 'lucide-react'

interface Referral {
  id: string; referrer_client_id: string; referred_client_id: string; code: string; status: string
  credit_cents_referrer: number; credit_cents_referred: number
  created_at: string; credited_at: string | null; voided_at: string | null; void_reason: string | null
}
interface Credit {
  id: string; client_id: string; cents: number; reason: string; referral_id: string | null
  consumed_cents: number; consumed_at: string | null; voided_at: string | null; created_at: string
}
interface CodeRow { client_id: string; code: string; created_at: string }
interface Payload { enabled: boolean; codes: CodeRow[]; referrals: Referral[]; credits: Credit[]; names: Record<string, string>; note?: string }

const money = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

const STATUS_CLASS: Record<string, string> = {
  signed_up: 'bg-gray-50 text-gray-600',
  first_order_paid: 'bg-amber-50 text-amber-700',
  credited: 'bg-emerald-50 text-emerald-700',
  void: 'bg-red-50 text-red-600',
}

export default function AdminReferralsPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/referrals/admin')
      setData(r.ok ? await r.json() : null)
    } catch { setData(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const voidOne = async (id: string) => {
    const reason = window.prompt('Why is this void? It goes in the ledger.')
    if (!reason || !reason.trim()) return
    setBusy(id)
    try {
      const res = await fetch('/api/referrals/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralId: id, reason: reason.trim() }),
      })
      // A credit whose checkout is still open at Stripe survives the void on purpose (the intent
      // already has the discount inside its amount). Say so, or staff think it worked.
      const out = await res.json().catch(() => null) as { creditsStuck?: number } | null
      if (out?.creditsStuck) {
        window.alert(`${out.creditsStuck} credit(s) are still live: their checkout is open at Stripe and could not be cancelled. Void again once it settles.`)
      }
      await load()
    } finally { setBusy('') }
  }

  const name = (id: string) => data?.names[id] || id.slice(0, 8)

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Referrals</h1>
          <p className="text-sm text-gray-500">
            {data
              ? data.enabled
                ? 'The loop is open. Owners can see it.'
                : 'The loop is shut (REFERRALS_ENABLED is not true). Nothing here is visible to an owner.'
              : 'Loading…'}
          </p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {data?.note && <div className="mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm px-4 py-3">Not set up yet: {data.note}</div>}
      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {data && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-2">Referrals ({data.referrals.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Sent by</th>
                  <th className="text-left px-3 py-2 font-medium">Friend</th>
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Started</th>
                  <th className="text-left px-3 py-2 font-medium">Credited</th>
                  <th className="text-left px-3 py-2 font-medium">Why void</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.referrals.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-gray-900">{name(r.referrer_client_id)}</td>
                    <td className="px-3 py-2 text-gray-900">{name(r.referred_client_id)}</td>
                    <td className="px-3 py-2 font-mono text-gray-600">{r.code}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLASS[r.status] ?? 'bg-gray-50 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{day(r.created_at)}</td>
                    <td className="px-3 py-2 text-gray-500">{day(r.credited_at)}</td>
                    <td className="px-3 py-2 text-gray-500">{r.void_reason ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {!r.voided_at && (
                        <button
                          onClick={() => void voidOne(r.id)}
                          disabled={busy === r.id}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          <Ban size={13} /> Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.referrals.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Nobody has sent a friend yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-semibold text-gray-700 mt-8 mb-2">Credits ({data.credits.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Client</th>
                  <th className="text-left px-3 py-2 font-medium">Amount</th>
                  <th className="text-left px-3 py-2 font-medium">Spent</th>
                  <th className="text-left px-3 py-2 font-medium">Why</th>
                  <th className="text-left px-3 py-2 font-medium">Made</th>
                  <th className="text-left px-3 py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.credits.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 text-gray-900">{name(c.client_id)}</td>
                    <td className="px-3 py-2 text-gray-900">{money(c.cents)}</td>
                    <td className="px-3 py-2 text-gray-500">{money(c.consumed_cents)}</td>
                    <td className="px-3 py-2 text-gray-500">{c.reason}</td>
                    <td className="px-3 py-2 text-gray-500">{day(c.created_at)}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {c.voided_at ? 'void' : c.consumed_at ? 'spent' : 'open'}
                    </td>
                  </tr>
                ))}
                {data.credits.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No credits yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-semibold text-gray-700 mt-8 mb-2">Codes ({data.codes.length})</h2>
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            {data.codes.map((c) => (
              <div key={c.code} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-gray-900">{name(c.client_id)}</span>
                <span className="font-mono text-gray-600">{c.code}</span>
              </div>
            ))}
            {data.codes.length === 0 && <div className="px-3 py-6 text-center text-gray-400 text-sm">No codes made yet.</div>}
          </div>
        </>
      )}
    </div>
  )
}
