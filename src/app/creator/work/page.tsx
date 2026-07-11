'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { WorkOrder, WorkOrderStatus } from '@/lib/campaigns/work-orders'
import type { CreatorEarnings } from '@/lib/campaigns/view'
import { safeHref } from '@/lib/campaigns/work-orders-core'

export default function CreatorWorkPage() {
  return (
    <Suspense fallback={<Centered>Loading your work…</Centered>}>
      <Inbox />
    </Suspense>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center text-sm text-neutral-500">{children}</div>
}

function Inbox() {
  const params = useSearchParams()
  const creator = params.get('creator') ?? '' // admin preview of any creator
  const [orders, setOrders] = useState<WorkOrder[] | null>(null)
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [earnings, setEarnings] = useState<CreatorEarnings | null>(null)
  const [ratingLabel, setRatingLabel] = useState<string | null>(null)
  const [orderStars, setOrderStars] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (creator) {
      const r = await fetch(`/api/creator/work?creator=${encodeURIComponent(creator)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({ orders: [] }))
      setOrders(j.orders ?? []); setResolvedId(creator); setEarnings(null); setRatingLabel(null); setOrderStars({})
      return
    }
    // No param: resolve the logged-in creator (creator_logins).
    const r = await fetch('/api/creator/me', { cache: 'no-store' })
    const j = await r.json().catch(() => ({ orders: [], creatorId: null }))
    setOrders(j.orders ?? []); setResolvedId(j.creatorId ?? null); setEarnings((j.earnings as CreatorEarnings) ?? null)
    setRatingLabel(typeof j.ratingLabel === 'string' ? j.ratingLabel : null)
    setOrderStars((j.ratingsByOrder as Record<string, number>) ?? {})
  }, [creator])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (id: string, patch: { status?: WorkOrderStatus; delivered_url?: string }) => {
    setBusy(id)
    try {
      await fetch('/api/creator/work', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
      await load()
    } finally { setBusy(null) }
  }, [load])

  if (orders === null) return <Centered>Loading your work…</Centered>
  if (!resolvedId) {
    return <Centered>You are not signed in as a creator. (Admins can preview with <code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5">?creator=&lt;id&gt;</code>.)</Centered>
  }

  const name = orders[0]?.creatorName ?? resolvedId
  const live = orders.filter((o) => o.status !== 'approved' && o.status !== 'declined')
  const done = orders.filter((o) => o.status === 'approved' || o.status === 'declined')

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Creator workspace</p>
            <h1 className="mt-0.5 text-lg font-semibold text-neutral-900">{name}</h1>
            {/* the creator's own honest track record: real ratings only, "No ratings yet" until one exists */}
            {ratingLabel && (
              <p className="mt-0.5 text-[12px] text-neutral-500">
                {ratingLabel === 'No ratings yet' ? ratingLabel : <><span className="text-amber-500">★</span> {ratingLabel}</>}
              </p>
            )}
          </div>
          {earnings && earnings.count > 0 && (
            <div className="text-right">
              <p className="text-base font-semibold text-emerald-700">${(earnings.netCents / 100).toFixed(earnings.netCents % 100 === 0 ? 0 : 2)}</p>
              <p className="text-[10.5px] text-neutral-400">{earnings.paidCents < earnings.netCents ? 'pending payout' : 'paid out'}</p>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-5 space-y-6">
        {orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            No work yet. When an owner ships a campaign that picks you, it lands here.
          </div>
        )}

        {live.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>To do · {live.length}</SectionLabel>
            {live.map((o) => <OrderCard key={o.id} o={o} busy={busy === o.id} onAct={act} />)}
          </section>
        )}

        {done.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>History · {done.length}</SectionLabel>
            {done.map((o) => <OrderCard key={o.id} o={o} busy={busy === o.id} onAct={act} stars={orderStars[o.id]} />)}
          </section>
        )}
      </main>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{children}</h2>
}

const STATUS_META: Record<WorkOrderStatus, { label: string; cls: string }> = {
  offered: { label: 'New offer', cls: 'bg-blue-50 text-blue-700' },
  accepted: { label: 'Accepted', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'In progress', cls: 'bg-amber-50 text-amber-700' },
  delivered: { label: 'Sent for review', cls: 'bg-violet-50 text-violet-700' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700' },
  revision: { label: 'Changes asked', cls: 'bg-rose-50 text-rose-700' },
  declined: { label: 'Declined', cls: 'bg-neutral-100 text-neutral-500' },
}

const DISC_ICON: Record<string, string> = { Video: '🎬', Photo: '📷', Social: '📱', Design: '🎨' }

function OrderCard({ o, busy, onAct, stars }: { o: WorkOrder; busy: boolean; onAct: (id: string, p: { status?: WorkOrderStatus; delivered_url?: string }) => void; stars?: number }) {
  const [url, setUrl] = useState(o.deliveredUrl ?? '')
  const meta = STATUS_META[o.status]
  const due = o.dueDate ? new Date(o.dueDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-base">{DISC_ICON[o.discipline] ?? '✨'}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{o.title}</p>
            {o.campaignName && <p className="truncate text-xs text-neutral-400">{o.campaignName}</p>}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
      </div>

      {o.brief && <p className="mt-3 text-[13px] leading-relaxed text-neutral-600">{o.brief}</p>}
      {o.note && (o.status === 'revision' || o.status === 'delivered' || o.conceptStatus === 'changes') && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">Owner: {o.note}</p>
      )}
      {due && <p className="mt-2 text-[12px] text-neutral-400">Due {due}</p>}

      <Link href={`/creator/work/${o.id}`} className="mt-2 inline-block text-[12px] font-semibold text-neutral-900 underline">Open full brief →</Link>

      {/* Actions by state */}
      {o.status === 'offered' && (
        <div className="mt-3 flex gap-2">
          <Btn primary busy={busy} onClick={() => onAct(o.id, { status: 'accepted' })}>Accept</Btn>
          <Btn busy={busy} onClick={() => onAct(o.id, { status: 'declined' })}>Decline</Btn>
        </div>
      )}
      {o.status === 'accepted' && (
        <div className="mt-3">{o.conceptStatus !== 'approved'
          ? <p className="text-[12px] text-amber-700">{o.conceptStatus === 'changes' ? 'Owner asked to rework the idea — start once they approve.' : 'Waiting on the owner to approve the concept.'}</p>
          : <Btn primary busy={busy} onClick={() => onAct(o.id, { status: 'in_progress' })}>Start work</Btn>}</div>
      )}
      {(o.status === 'in_progress' || o.status === 'revision') && (
        <div className="mt-3 space-y-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a link to the finished work"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <Btn primary busy={busy} disabled={!url.trim()} onClick={() => onAct(o.id, { status: 'delivered', delivered_url: url.trim() })}>Deliver</Btn>
        </div>
      )}
      {o.status === 'delivered' && (
        <p className="mt-3 text-[12px] text-neutral-500">Delivered. Waiting on the owner to review.</p>
      )}
      {o.status === 'approved' && safeHref(o.deliveredUrl) && (
        <a href={safeHref(o.deliveredUrl)!} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[12px] font-medium text-emerald-700 underline">View delivered work</a>
      )}
      {/* the owner's real rating for this delivery, when one exists */}
      {o.status === 'approved' && typeof stars === 'number' && stars >= 1 && (
        <p className="mt-2 text-[12px] text-neutral-500">Owner rated this <span className="text-amber-500">★</span> {stars}/5</p>
      )}
    </article>
  )
}

function Btn({ children, onClick, primary, busy, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
        primary ? 'bg-neutral-900 text-white hover:bg-neutral-700' : 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      {busy ? '…' : children}
    </button>
  )
}
