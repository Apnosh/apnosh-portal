'use client'

/**
 * Bulk multi-location operations for owners of chains.
 * One change, every linked location at once.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle, Calendar, Tag, ExternalLink, Layers, Check,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'
import { bulkSetSpecialHours, bulkSetAttributes, bulkSetMenuLink, type BulkResult } from '@/lib/gbp-bulk'

type Tab = 'holiday' | 'attribute' | 'menu'

const ATTRIBUTE_QUICK: Array<{ id: string; label: string }> = [
  { id: 'has_dine_in', label: 'Dine-in' },
  { id: 'has_takeout', label: 'Takeout' },
  { id: 'has_delivery', label: 'Delivery' },
  { id: 'has_curbside_pickup', label: 'Curbside pickup' },
  { id: 'has_outdoor_seating', label: 'Outdoor seating' },
  { id: 'accepts_reservations', label: 'Accepts reservations' },
  { id: 'serves_vegetarian_food', label: 'Vegetarian options' },
  { id: 'accepts_credit_cards', label: 'Accepts credit cards' },
  { id: 'accepts_nfc_mobile_payments', label: 'Mobile payments' },
]

export default function BulkOpsPage() {
  const { client } = useClient()
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('holiday')

  useEffect(() => {
    if (!client?.id) return
    getClientLocations(client.id).then(locs => {
      setLocations(locs)
      setSelected(new Set(locs.map(l => l.id)))
    })
  }, [client?.id])

  function toggleLocation(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAll() { setSelected(new Set(locations.map(l => l.id))) }
  function clearAll() { setSelected(new Set()) }

  if (!client?.id) return null
  if (locations.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/dashboard/local-seo" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Local SEO
        </Link>
        <div className="rounded-2xl border border-ink-6 bg-white p-8 text-center">
          <Layers className="w-8 h-8 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink">No locations linked yet</p>
          <p className="text-xs text-ink-3 mt-1">
            Connect Google Business Profile first. Bulk operations work across linked locations.
          </p>
        </div>
      </div>
    )
  }
  if (locations.length === 1) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/dashboard/local-seo" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Local SEO
        </Link>
        <div className="rounded-2xl border border-ink-6 bg-white p-8 text-center">
          <Layers className="w-8 h-8 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink">Only one location linked</p>
          <p className="text-xs text-ink-3 mt-1 max-w-md mx-auto">
            Bulk operations are for businesses with multiple locations. Use Your Listing to edit your single location.
          </p>
          <Link href="/dashboard/local-seo/listing" className="inline-block mt-4 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark">
            Go to Your Listing
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      <div>
        <Link href="/dashboard/local-seo" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Local SEO
        </Link>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center ring-1 ring-emerald-100">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink">Bulk update</h1>
            <p className="text-sm text-ink-3 mt-1">
              One change, every location at once. {locations.length} locations linked.
            </p>
          </div>
        </div>
      </div>

      {/* Location chooser */}
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Apply to</h2>
          <div className="flex gap-3 text-xs">
            <button onClick={selectAll} className="text-brand-dark hover:underline">Select all</button>
            <button onClick={clearAll} className="text-ink-3 hover:text-ink">Clear</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {locations.map(loc => {
            const checked = selected.has(loc.id)
            return (
              <button
                key={loc.id}
                onClick={() => toggleLocation(loc.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left ${
                  checked
                    ? 'bg-brand-tint/40 border-brand ring-1 ring-brand'
                    : 'bg-white border-ink-6 hover:border-ink-4'
                }`}
              >
                <div className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${
                  checked ? 'bg-brand border-brand' : 'bg-white border-ink-5'
                }`}>
                  {checked && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-[13px] text-ink-2 truncate">{loc.location_name}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-ink-4">{selected.size} of {locations.length} selected</p>
      </div>

      {/* Action picker */}
      <div className="rounded-2xl border border-ink-6 bg-white p-1.5 inline-flex gap-1 w-full">
        {([
          { key: 'holiday' as Tab, label: 'Holiday hours', icon: Calendar },
          { key: 'attribute' as Tab, label: 'Attributes', icon: Tag },
          { key: 'menu' as Tab, label: 'Menu link', icon: ExternalLink },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium ${
              tab === t.key ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'holiday' && <HolidayForm clientId={client.id} locationIds={Array.from(selected)} />}
      {tab === 'attribute' && <AttributeForm clientId={client.id} locationIds={Array.from(selected)} />}
      {tab === 'menu' && <MenuLinkForm clientId={client.id} locationIds={Array.from(selected)} />}
    </div>
  )
}

function HolidayForm({ clientId, locationIds }: { clientId: string; locationIds: string[] }) {
  const [date, setDate] = useState('')
  const [closed, setClosed] = useState(true)
  const [open, setOpen] = useState('11:00')
  const [close, setClose] = useState('20:00')
  return (
    <ActionCard
      title="Set special hours for one date"
      hint="Closes or opens with custom hours for the selected date on every chosen location."
      disabled={!date || locationIds.length === 0}
      run={() => bulkSetSpecialHours(clientId, locationIds, { date, closed, open, close })}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-[12px] text-ink-3 flex flex-col gap-1">
          <span>Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="text-[13px] p-2 rounded-md border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </label>
        <label className="text-[12px] text-ink-3 flex flex-col gap-1">
          <span>Status</span>
          <select value={closed ? 'closed' : 'open'} onChange={e => setClosed(e.target.value === 'closed')} className="text-[13px] p-2 rounded-md border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30">
            <option value="closed">Closed</option>
            <option value="open">Custom hours</option>
          </select>
        </label>
        {!closed && (
          <div className="text-[12px] text-ink-3 flex flex-col gap-1">
            <span>Hours</span>
            <div className="flex items-center gap-2">
              <input type="time" value={open} onChange={e => setOpen(e.target.value)} className="text-[13px] p-2 rounded-md border border-ink-6 bg-white" />
              <span>–</span>
              <input type="time" value={close} onChange={e => setClose(e.target.value)} className="text-[13px] p-2 rounded-md border border-ink-6 bg-white" />
            </div>
          </div>
        )}
      </div>
    </ActionCard>
  )
}

function AttributeForm({ clientId, locationIds }: { clientId: string; locationIds: string[] }) {
  const [values, setValues] = useState<Record<string, boolean>>({})
  function toggle(id: string) {
    setValues(prev => ({ ...prev, [id]: !prev[id] }))
  }
  return (
    <ActionCard
      title="Set attributes"
      hint="Each toggle here will be applied as that exact value to every chosen location."
      disabled={Object.keys(values).length === 0 || locationIds.length === 0}
      run={() => bulkSetAttributes(clientId, locationIds, values)}
    >
      <div className="flex flex-wrap gap-2">
        {ATTRIBUTE_QUICK.map(a => {
          const set = a.id in values
          const on = values[a.id]
          return (
            <button
              key={a.id}
              onClick={() => toggle(a.id)}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border ${
                !set ? 'bg-white border-ink-6 text-ink-3 hover:border-ink-4'
                  : on ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {set ? (on ? '✓ ' : '✗ ') : ''}
              {a.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-4">Click once to set ON, click again to set OFF. Untoggled attributes are left as-is per location.</p>
    </ActionCard>
  )
}

function MenuLinkForm({ clientId, locationIds }: { clientId: string; locationIds: string[] }) {
  const [url, setUrl] = useState('')
  return (
    <ActionCard
      title="Set menu link"
      hint="Replaces the Menu URL on every chosen location."
      disabled={!url || locationIds.length === 0}
      run={() => bulkSetMenuLink(clientId, locationIds, url)}
    >
      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://yourrestaurant.com/menu"
        className="w-full text-[13px] p-2.5 rounded-md border border-ink-6 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </ActionCard>
  )
}

function ActionCard({
  title, hint, disabled, run, children,
}: {
  title: string
  hint: string
  disabled: boolean
  run: () => Promise<BulkResult>
  children: React.ReactNode
}) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const r = await run()
      setResult(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="text-xs text-ink-3 mt-0.5">{hint}</p>
      </div>
      {children}
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-rose-700">{error}</span>}
        <button
          onClick={apply}
          disabled={disabled || running}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {running ? 'Applying…' : 'Apply to selected'}
        </button>
      </div>
      {result && (
        <div className="rounded-xl border border-ink-6 bg-bg-2/40 p-3 text-[12.5px]">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-medium text-ink">
              {result.succeeded.length} succeeded
            </span>
            {result.failed.length > 0 && (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 ml-3" />
                <span className="font-medium text-ink">
                  {result.failed.length} failed
                </span>
              </>
            )}
          </div>
          {result.failed.length > 0 && (
            <ul className="text-[11.5px] text-rose-700 space-y-0.5 mt-1">
              {result.failed.map((f, i) => (
                <li key={i}>· {f.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
