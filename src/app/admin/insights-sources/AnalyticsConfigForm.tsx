'use client'

/**
 * Admin form to set a client's EXACT GA4 event config (Phase 1.5).
 * These exact values (owner-set, no auto-detect) decide whether the two GA4
 * event sources resolve CONNECTED for this client. Shows current values with
 * an honest empty state.
 */

import { useState, useTransition } from 'react'
import { Save, Check } from 'lucide-react'
import { saveClientAnalyticsConfig } from './actions'

export function AnalyticsConfigForm({
  clientId,
  clientName,
  menuPath,
  orderDomain,
}: {
  clientId: string
  clientName: string
  menuPath: string | null
  orderDomain: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await saveClientAnalyticsConfig(fd)
      if (res.ok) setSaved(true)
      else setError(res.error ?? 'Could not save')
    })
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[14px] font-semibold text-ink-2">
          Google Analytics settings for <span className="text-ink">{clientName}</span>
        </h2>
        <p className="text-[11px] text-ink-4">Exact values, set by hand. No guessing.</p>
      </div>
      <p className="text-[12px] text-ink-3 mt-1 max-w-2xl">
        These turn on two funnel numbers: menu page views and clicks to the ordering site. Both
        need Google Analytics connected AND the exact value below. Leave a box empty to keep that
        number off.
      </p>

      <form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="clientId" value={clientId} />

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Menu page path
          </span>
          <input
            name="ga4_menu_path"
            defaultValue={menuPath ?? ''}
            placeholder="/menu"
            className="mt-1 w-full rounded-lg border border-ink-6 px-3 py-2 text-sm font-mono text-ink focus:border-brand focus:outline-none"
          />
          <span className="text-[10.5px] text-ink-4 mt-1 block">
            The path of your menu page, like <code className="font-mono">/menu</code>. Sub-pages
            count too.
          </span>
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Ordering site
          </span>
          <input
            name="ga4_order_domain"
            defaultValue={orderDomain ?? ''}
            placeholder="order.toasttab.com"
            className="mt-1 w-full rounded-lg border border-ink-6 px-3 py-2 text-sm font-mono text-ink focus:border-brand focus:outline-none"
          />
          <span className="text-[10.5px] text-ink-4 mt-1 block">
            The website people go to when they order, like{' '}
            <code className="font-mono">order.toasttab.com</code>.
          </span>
        </label>

        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            {pending ? 'Saving…' : 'Save settings'}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          {error && <span className="text-[12px] font-medium text-rose-600">{error}</span>}
        </div>
      </form>

      {!menuPath && !orderDomain && (
        <p className="mt-3 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Nothing set yet. Until you add these, the two menu/order numbers stay off for this client
          even if Google Analytics is connected.
        </p>
      )}
    </div>
  )
}
