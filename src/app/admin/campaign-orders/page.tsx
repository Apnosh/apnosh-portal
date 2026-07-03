'use client'

/**
 * /admin/campaign-orders — the orders ledger. Every campaign an owner ships lands here. Built as a
 * true sibling of /admin/orders: a 4-card stats bar, lifecycle tab pills, search, and a dense
 * sortable table (short id, dates, price, status, progress). The one upgrade: awaiting-confirm orders
 * are pinned into a "Needs you" band at the top (oldest ship first, so the stalest never rots), with
 * an inline Confirm. A row opens the order detail page; Confirm stamps confirmed_at + notifies.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Clock, Loader2, CheckCircle2, PlayCircle, Search, ArrowUpDown, Check, ChevronRight } from 'lucide-react'

type OrderStatus = 'awaiting' | 'production' | 'live' | 'done'
interface OrderRow {
  id: string
  shortId: string
  name: string
  clientName: string
  shippedAt: string | null
  confirmedAt: string | null
  status: OrderStatus
  monthly: number
  oneTime: number
  pieceCount: number
  live: number
  total: number
}

type Tab = 'all' | OrderStatus
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Awaiting confirm' },
  { key: 'production', label: 'In production' },
  { key: 'live', label: 'Live' },
  { key: 'done', label: 'Done' },
]
const STATUS_PILL: Record<OrderStatus, string> = {
  awaiting: 'bg-amber-50 text-amber-700',
  production: 'bg-blue-50 text-blue-600',
  live: 'bg-brand-tint text-brand-dark',
  done: 'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting: 'Awaiting confirm', production: 'In production', live: 'Live', done: 'Done',
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function priceMain(o: OrderRow): string {
  if (o.monthly > 0) return `$${o.monthly.toLocaleString()}/mo`
  if (o.oneTime > 0) return `$${o.oneTime.toLocaleString()}`
  return '—'
}
function priceSub(o: OrderRow): string {
  const bits: string[] = []
  if (o.monthly > 0 && o.oneTime > 0) bits.push(`+ $${o.oneTime.toLocaleString()} once`)
  else if (o.monthly === 0 && o.oneTime > 0) bits.push('one time')
  if (o.pieceCount > 0) bits.push(`${o.pieceCount} ${o.pieceCount === 1 ? 'item' : 'items'}`)
  return bits.join(' · ')
}
function firstMonth(o: OrderRow): number {
  return o.monthly + o.oneTime
}

export default function CampaignOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  // False while confirmed_at is not live yet (pre-migration 189): list still loads, confirm disabled.
  const [confirmationsReady, setConfirmationsReady] = useState(true)
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'shipped' | 'price'>('shipped')
  const [sortAsc, setSortAsc] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/campaign-orders', { cache: 'no-store' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`)
      const j = await r.json()
      setOrders(j.orders as OrderRow[])
      setConfirmationsReady(j.confirmationsReady !== false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
  }, [])
  useEffect(() => { load() }, [load])

  async function confirm(id: string) {
    setConfirming(id)
    try {
      const r = await fetch('/api/admin/campaign-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Confirm failed')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Confirm failed') }
    finally { setConfirming(null) }
  }

  const all = useMemo(() => orders ?? [], [orders])
  const counts = useMemo(() => ({
    awaiting: all.filter((o) => o.status === 'awaiting').length,
    production: all.filter((o) => o.status === 'production').length,
    live: all.filter((o) => o.status === 'live').length,
    done: all.filter((o) => o.status === 'done').length,
  }), [all])

  const sortRows = useCallback((rows: OrderRow[]) => {
    return [...rows].sort((a, b) => {
      const va = sortKey === 'price' ? firstMonth(a) : new Date(a.shippedAt ?? 0).getTime()
      const vb = sortKey === 'price' ? firstMonth(b) : new Date(b.shippedAt ?? 0).getTime()
      return sortAsc ? va - vb : vb - va
    })
  }, [sortKey, sortAsc])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((o) => o.shortId.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q) || o.name.toLowerCase().includes(q))
  }, [all, search])

  // The "All" tab pins awaiting orders (oldest ship first) into their own band; the rest sort by the
  // chosen column. Any specific tab is a plain filtered + sorted list, no band.
  const showBand = tab === 'all'
  const awaiting = useMemo(() => showBand ? [...searched.filter((o) => o.status === 'awaiting')].sort((a, b) => new Date(a.shippedAt ?? 0).getTime() - new Date(b.shippedAt ?? 0).getTime()) : [], [searched, showBand])
  const tableRows = useMemo(() => {
    const base = tab === 'all' ? searched.filter((o) => o.status !== 'awaiting') : searched.filter((o) => o.status === tab)
    return sortRows(base)
  }, [searched, tab, sortRows])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-brand-dark" /> Campaign orders</h1>
        <p className="text-ink-3 text-sm mt-1">Every campaign your clients have shipped. Confirm the new ones, then track them to live.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Awaiting confirm" value={counts.awaiting} Icon={Clock} color="bg-amber-50 text-amber-600" onClick={() => setTab('awaiting')} />
        <StatCard label="In production" value={counts.production} Icon={Loader2} color="bg-blue-50 text-blue-600" onClick={() => setTab('production')} />
        <StatCard label="Live" value={counts.live} Icon={PlayCircle} color="bg-brand-tint text-brand-dark" onClick={() => setTab('live')} />
        <StatCard label="Done" value={counts.done} Icon={CheckCircle2} color="bg-gray-100 text-gray-500" onClick={() => setTab('done')} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
      {!confirmationsReady && orders !== null && (
        <div className="rounded-xl bg-amber-50 text-amber-800 text-sm px-4 py-3">Confirmations turn on after the next update. You can still see every order below.</div>
      )}

      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        {/* Tabs + search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 border-b border-ink-6">
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${tab === t.key ? 'bg-brand-tint text-brand-dark font-medium' : 'text-ink-3 hover:bg-bg-2'}`}
              >
                {t.label}{t.key !== 'all' && counts[t.key] > 0 ? ` ${counts[t.key]}` : ''}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
            <input
              type="text"
              placeholder="Search id or client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-2 border-b border-ink-6">
                <Th>Order</Th>
                <Th>
                  <button onClick={() => { setSortKey('shipped'); setSortAsc(sortKey === 'shipped' ? !sortAsc : false) }} className="inline-flex items-center gap-1 hover:text-ink-2">Shipped <ArrowUpDown className="w-3 h-3" /></button>
                </Th>
                <Th>Confirmed</Th>
                <Th right>
                  <button onClick={() => { setSortKey('price'); setSortAsc(sortKey === 'price' ? !sortAsc : false) }} className="inline-flex items-center gap-1 hover:text-ink-2">Price <ArrowUpDown className="w-3 h-3" /></button>
                </Th>
                <Th>Status</Th>
                <Th>Progress</Th>
                <Th right>Action</Th>
              </tr>
            </thead>

            {orders === null ? (
              <tbody><tr><td colSpan={7} className="px-4 py-12 text-center text-ink-4 text-sm"><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…</td></tr></tbody>
            ) : (
              <>
                {/* Needs-you band (All tab only) */}
                {showBand && awaiting.length > 0 && (
                  <tbody>
                    <tr className="bg-amber-50/70 border-b border-amber-200">
                      <td colSpan={7} className="px-4 py-2">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Needs you
                          <span className="bg-white/80 text-amber-700 rounded-full px-1.5 py-0.5 text-[10px]">{awaiting.length}</span>
                        </span>
                      </td>
                    </tr>
                    {awaiting.map((o) => <OrderTr key={o.id} o={o} awaiting onOpen={() => router.push(`/admin/campaign-orders/${o.id}`)} onConfirm={() => confirm(o.id)} confirming={confirming === o.id} confirmationsReady={confirmationsReady} />)}
                  </tbody>
                )}

                {/* Main list */}
                <tbody>
                  {tableRows.length === 0 && awaiting.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-ink-4 text-sm">{tab === 'awaiting' ? 'All caught up. Nothing awaiting confirm.' : all.length === 0 ? 'No campaign orders yet. New orders show up here the moment a client ships.' : 'No orders match this filter.'}</td></tr>
                  ) : (
                    tableRows.map((o) => <OrderTr key={o.id} o={o} awaiting={o.status === 'awaiting'} onOpen={() => router.push(`/admin/campaign-orders/${o.id}`)} onConfirm={() => confirm(o.id)} confirming={confirming === o.id} confirmationsReady={confirmationsReady} />)
                  )}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`${right ? 'text-right' : 'text-left'} px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide`}>{children}</th>
}

function StatCard({ label, value, Icon, color, onClick }: { label: string; value: number; Icon: typeof Clock; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-white rounded-xl border border-ink-6 p-5 hover:border-ink-5 transition-colors">
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-3`}><Icon className="w-4 h-4" /></div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{value}</div>
      <div className="text-xs text-ink-4 mt-0.5">{label}</div>
    </button>
  )
}

function OrderTr({ o, awaiting, onOpen, onConfirm, confirming, confirmationsReady }: { o: OrderRow; awaiting: boolean; onOpen: () => void; onConfirm: () => void; confirming: boolean; confirmationsReady: boolean }) {
  return (
    <tr onClick={onOpen} className={`border-b border-ink-6 last:border-0 cursor-pointer transition-colors ${awaiting ? 'border-l-2 border-l-amber-400 bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-bg-2'}`}>
      <td className="px-4 py-3">
        <div className="font-mono text-[11px] text-ink-4">#{o.shortId}</div>
        <div className="font-medium text-ink truncate max-w-[220px]">{o.name}</div>
        <div className="text-xs text-ink-3 truncate max-w-[220px]">{o.clientName}</div>
      </td>
      <td className="px-4 py-3 text-ink-3 whitespace-nowrap">{fmtDate(o.shippedAt) || '—'}</td>
      <td className="px-4 py-3 text-ink-4 whitespace-nowrap">{o.confirmedAt ? fmtDate(o.confirmedAt) : 'Not yet'}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="text-ink-2 font-medium tabular-nums">{priceMain(o)}</div>
        {priceSub(o) && <div className="text-[11px] text-ink-4">{priceSub(o)}</div>}
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_PILL[o.status]}`}>{STATUS_LABEL[o.status]}</span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {o.total > 0 ? (
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 rounded-full bg-ink-6 overflow-hidden"><div className="h-full bg-brand" style={{ width: `${Math.min(100, (o.live / o.total) * 100)}%` }} /></div>
            <span className="text-[11px] text-ink-3">{o.live} of {o.total}</span>
          </div>
        ) : <span className="text-ink-4 text-xs">Not tracked</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {awaiting ? (
          <button
            onClick={(e) => { e.stopPropagation(); onConfirm() }}
            disabled={confirming || !confirmationsReady}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-dark bg-brand-tint px-2.5 py-1 rounded-md hover:bg-brand/20 transition-colors disabled:opacity-60"
          >
            {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Confirm
          </button>
        ) : (
          <ChevronRight className="w-4 h-4 text-ink-5 inline" />
        )}
      </td>
    </tr>
  )
}
