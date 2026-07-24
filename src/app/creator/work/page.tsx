'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { WorkOrder, WorkOrderStatus } from '@/lib/campaigns/work-orders'
import type { CreatorEarnings } from '@/lib/campaigns/view'
import type { CalendarItem } from '@/lib/marketplace/creator-schedule-types'
import { safeHref } from '@/lib/campaigns/work-orders-core'
import { briefLines } from '@/lib/marketplace/booking-brief'
import CreatorCalendar from '@/components/creator/creator-calendar'

/** '09:00' → '9:00 AM'. Returns the raw value if it is not a wall-clock time. */
function fmtTime(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '')
  if (!m) return hhmm ?? ''
  const h = Number(m[1]), ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}

/** Whole dollars unless there are cents. */
function money(cents: number): string {
  const d = cents / 100
  return d % 1 === 0 ? `$${d.toLocaleString('en-US')}` : `$${d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

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
  const [calendar, setCalendar] = useState<CalendarItem[]>([])
  const [view, setView] = useState<'todo' | 'calendar'>('todo')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (creator) {
      const r = await fetch(`/api/creator/work?creator=${encodeURIComponent(creator)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({ orders: [] }))
      setOrders(j.orders ?? []); setResolvedId(creator); setEarnings(null); setRatingLabel(null); setOrderStars({}); setCalendar([])
      return
    }
    // No param: resolve the logged-in creator (creator_logins).
    const r = await fetch('/api/creator/me', { cache: 'no-store' })
    const j = await r.json().catch(() => ({ orders: [], creatorId: null }))
    setOrders(j.orders ?? []); setResolvedId(j.creatorId ?? null); setEarnings((j.earnings as CreatorEarnings) ?? null)
    setRatingLabel(typeof j.ratingLabel === 'string' ? j.ratingLabel : null)
    setOrderStars((j.ratingsByOrder as Record<string, number>) ?? {})
    setCalendar((j.calendar as CalendarItem[]) ?? [])
  }, [creator])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (id: string, patch: { status?: WorkOrderStatus; delivered_url?: string }) => {
    setBusy(id); setErr(null)
    try {
      const r = await fetch('/api/creator/work', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setErr(typeof j.error === 'string' ? j.error : 'That did not go through. Try again.')
        return
      }
      await load()
    } catch {
      setErr('Something went wrong. Check your connection and try again.')
    } finally { setBusy(null) }
  }, [load])

  if (orders === null) return <Centered>Loading your work…</Centered>
  if (!resolvedId) {
    return <Centered>You are not signed in as a creator. (Admins can preview with <code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5">?creator=&lt;id&gt;</code>.)</Centered>
  }

  const name = orders[0]?.creatorName ?? resolvedId
  // To do keeps the list's soonest-due-first order (the next thing they owe is at the top);
  // History reads the other way, most recently finished first.
  const live = orders.filter((o) => o.status !== 'approved' && o.status !== 'declined')
  const done = orders.filter((o) => o.status === 'approved' || o.status === 'declined')
    .slice().sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''))

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

      {/* To do (the inbox) vs Calendar (the master schedule — same one as the Bookings tab). */}
      <div className="flex gap-1.5 px-4 pt-3 pb-1">
        {(['todo', 'calendar'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 rounded-[10px] py-2 text-[13.5px] border ${view === v ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold' : 'border-neutral-200 bg-white text-neutral-500 font-medium'}`}>
            {v === 'todo' ? 'To do' : 'Calendar'}
          </button>
        ))}
      </div>

      {view === 'calendar' ? (
        <CreatorCalendar items={calendar} />
      ) : (
      <main className="mx-auto max-w-xl px-4 py-5 space-y-6">
        {err && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>
        )}
        {orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            No work yet. Jobs land here when a restaurant books you or an owner picks you for a campaign.
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
      )}
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
  const due = o.dueDate ? new Date(o.dueDate + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
  // An on-site booking has a start time, so the day line reads "Mon, Jul 27 · 9:00 AM" and they know
  // when to show up. Remote work has only a deadline, so it says so.
  const when = due ? `${o.slotTime ? '' : 'Due '}${due}${o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ''}` : null
  const answers = briefLines(o.brief)
  // Who reviews their work: the restaurant that booked them, or the owner who assigned a campaign
  // piece. Saying "the owner" on a booking card is confusing when the card names the restaurant.
  const reviewer = o.restaurantName ?? 'the owner'

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-base">{DISC_ICON[o.discipline] ?? '✨'}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{o.title}</p>
            {/* Who it is for: the restaurant for a booking, the campaign for owner-assigned work. */}
            {(o.restaurantName || o.campaignName) && (
              <p className="truncate text-xs text-neutral-500">{o.restaurantName ?? o.campaignName}</p>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
      </div>

      {/* When and what it pays — the two things they scan a list for. */}
      {(when || o.amountCents > 0) && (
        <div className="mt-2.5 flex items-center gap-2 text-[12.5px]">
          {when && <span className="font-medium text-neutral-700">{when}</span>}
          {when && o.amountCents > 0 && <span className="text-neutral-300">·</span>}
          {o.amountCents > 0 && <span className="font-semibold text-emerald-700">{money(o.amountCents)}</span>}
        </div>
      )}

      {/* What the restaurant asked for, as their own words rather than a paragraph. */}
      {answers.length > 0 && (
        <dl className="mt-3 space-y-1.5">
          {answers.map((a, i) => (
            <div key={i}>
              {a.label && <dt className="text-[11.5px] text-neutral-400">{a.label}</dt>}
              <dd className="text-[13px] leading-snug text-neutral-700">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {o.note && (o.status === 'revision' || o.status === 'delivered' || o.conceptStatus === 'changes') && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{reviewer === 'the owner' ? 'Owner' : reviewer}: {o.note}</p>
      )}

      {/* Campaign pieces have a full AI brief page; a marketplace booking's brief is the card itself
          (title + notes), so it delivers inline with no separate brief to open. */}
      {o.campaignId && <Link href={`/creator/work/${o.id}`} className="mt-2 inline-block text-[12px] font-semibold text-neutral-900 underline">Open full brief →</Link>}

      {/* Actions by state */}
      {o.status === 'offered' && (
        <div className="mt-3 flex gap-2">
          <Btn primary busy={busy} onClick={() => onAct(o.id, { status: 'accepted' })}>Accept</Btn>
          <Btn busy={busy} onClick={() => onAct(o.id, { status: 'declined' })}>Decline</Btn>
        </div>
      )}
      {o.status === 'accepted' && (
        <div className="mt-3">{o.conceptStatus !== 'approved'
          ? <p className="text-[12px] text-amber-700">{o.conceptStatus === 'changes' ? 'They asked to rework the idea. Start once they approve.' : `Waiting on ${reviewer} to approve the idea.`}</p>
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
        <p className="mt-3 text-[12px] text-neutral-500">Sent. Waiting on {reviewer} to review it.</p>
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
