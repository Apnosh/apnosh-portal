/**
 * /admin/campaign-orders/[id] — the admin cockpit for ONE shipped campaign order. "Where It's At"
 * design: a status HERO, one adaptive ACTION BAND (color = does-it-need-me), then an always-open
 * Plan + Production where EVERY service and piece is a click-to-expand <details> row that blooms open
 * in place to show exactly where it is at — services get an honest 3-node phase path (Confirmed ->
 * Being set up -> Live) with their turnaround window, external gates, and expected-ready date; content
 * pieces get the REAL 5-node tracked lifecycle lit by their live stage (amber when it is the client's
 * turn). Setup/Support/Activity are collapsible counted cards in the rail. Pure server component: all
 * expand/animation is native <details> + CSS, no client JS. Sibling of /admin/orders/[id] tokens.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Package, Wrench, ListChecks, MessageSquare, Clock, ExternalLink, CheckCircle2, ChevronDown, User, AlertCircle, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAdminOrderDetail } from '@/lib/campaigns/admin-order-detail'
import { STAGE_LABEL } from '@/lib/campaigns/tracker/stages'
import { turnaroundFor, etaLabelFor } from '@/lib/campaigns/data/service-turnaround'
import { classifySteps, pileCounts } from '@/lib/gbp-apply/piles'
import type { WorkOrderStep } from '@/lib/campaigns/data/service-playbooks'
import type { ServiceWorkOrder } from '@/lib/campaigns/service-work-orders'
import type { LineItem } from '@/lib/campaigns/types'
import type { TrackerPiece } from '@/lib/campaigns/tracker/types'
import { getBookingForCampaign } from '@/lib/campaigns/gates/booking-server'
import ConfirmButton from './confirm-button'
import LineStatusControl from './line-status-control'
import AdminBookingControl from './booking-control'
import CancelRequestControl from './cancel-request-control'

type OrderStatus = 'awaiting' | 'production' | 'live' | 'done'
const STATUS_PILL: Record<OrderStatus, string> = {
  awaiting: 'bg-amber-50 text-amber-700', production: 'bg-blue-50 text-blue-600', live: 'bg-brand-tint text-brand-dark', done: 'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting: 'Awaiting confirm', production: 'In production', live: 'Live', done: 'Done',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function money(n: number): string { return `$${Math.round(n).toLocaleString()}` }
function cadenceLabel(cad: { kind: string; every?: string; unit?: string } | undefined): string {
  if (!cad) return ''
  if (cad.kind === 'recurring') return cad.every === 'weekly' ? 'per week' : 'per month'
  if (cad.kind === 'per-occurrence') return cad.unit ? `per ${cad.unit}` : 'per use'
  return 'one time'
}
/** Add N business days (skip weekends) — for the honest "expected ready by" estimate. */
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from); let added = 0
  while (added < days) { d.setDate(d.getDate() + 1); const wd = d.getDay(); if (wd !== 0 && wd !== 6) added++ }
  return d
}
/** Expected-ready date for a service: ship + its work window (+ any external gate slack). Recurring
 *  services have no finish window, so return null (they show a "starts in" pill instead). */
function expectedReadyBy(shippedISO: string | null, serviceId: string): string | null {
  if (!shippedISO) return null
  const t = turnaroundFor(serviceId)
  if (!t || !('business' in t)) return null
  const gateMax = 'gate' in t && t.gate ? t.gate.addDays.max : 0
  const d = addBusinessDays(new Date(shippedISO), t.business.max + gateMax)
  return isNaN(d.getTime()) ? null : fmtShort(d.toISOString())
}

const EXEC_LABELS: Record<string, string> = {
  featuring: 'Featuring', offerText: 'Offer', mustSay: 'Must say', avoid: 'Avoid',
  postNotes: 'Post notes', shootTimes: 'Shoot times', blackoutDates: 'Blackout dates',
  onSiteContact: 'On-site contact', accessNotes: 'Access notes', bestReach: 'Best way to reach',
  filmStaff: 'Filming staff', socialHandles: 'Social handles', orderingLink: 'Ordering link',
  setupNotes: 'Setup notes', vendorInfo: 'Vendor info', menuSource: 'Menu source',
}

type LineKind = 'setup' | 'content' | 'ongoing'
function lineKind(it: LineItem): LineKind {
  const t = turnaroundFor(it.serviceId)
  if (t?.class === 'setup') return 'setup'
  if (t?.class === 'recurring') return 'ongoing'
  if (t?.class === 'creative') return 'content'
  if (it.stage === 'foundation') return 'setup'
  return (it.cadence as { kind?: string })?.kind === 'recurring' ? 'ongoing' : 'content'
}
function assigneeOf(it: LineItem): string {
  if (it.producer === 'creator') return 'A creator'
  if (it.producer === 'diy') return 'Owner (DIY)'
  if (it.producer === 'ai' || it.handler === 'ai') return 'AI'
  if (it.handler === 'hybrid') return 'Team + AI'
  return 'Apnosh team'
}
function gateNoteOf(it: LineItem): { note: string; delta: string } | null {
  const t = turnaroundFor(it.serviceId)
  if (t && 'gate' in t && t.gate) return { note: t.gate.note, delta: `+${t.gate.addDays.min}-${t.gate.addDays.max} days` }
  return null
}
const KIND_META: Record<LineKind, { label: string; chip: string; band: string }> = {
  setup: { label: 'Setup', chip: 'bg-amber-50 text-amber-700', band: 'border-l-amber-400' },
  content: { label: 'Content', chip: 'bg-violet-50 text-violet-700', band: 'border-l-violet-400' },
  ongoing: { label: 'Ongoing', chip: 'bg-sky-50 text-sky-700', band: 'border-l-sky-400' },
}
function lineStatus(kind: LineKind, awaitingConfirm: boolean): string {
  if (awaitingConfirm) return 'Waiting on confirm'
  if (kind === 'setup') return 'Being set up'
  if (kind === 'ongoing') return 'Running'
  return 'In production'
}

// Pill tints, dot inherits text color via bg-current.
const PILL: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-600', sky: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700', brand: 'bg-brand-tint text-brand-dark', gray: 'bg-gray-100 text-gray-500',
}

// Collapsed where-it-is pill DERIVED from the pile classifier (the same truth the inbox shows).
// swo.status only decides the terminal Delivered state; everything else comes from where the steps
// actually sit, so this pill can never contradict the counts printed next to it.
function swoPill(swo: ServiceWorkOrder): { label: string; tone: keyof typeof PILL } {
  if (swo.status === 'delivered') return { label: 'Delivered', tone: 'brand' }
  const c = pileCounts(classifySteps(swo.serviceId, swo.steps as unknown as WorkOrderStep[]))
  if (c.yourTurn > 0) return { label: 'Needs us', tone: 'blue' }
  if (c.waiting > 0) return { label: 'Waiting', tone: 'amber' }
  if (c.done > 0) return { label: 'Ready to deliver', tone: 'sky' }
  return { label: 'Not started', tone: 'gray' }
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') redirect('/admin')

  const detail = await getAdminOrderDetail(id)
  if (!detail) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <Link href="/admin/campaign-orders" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"><ArrowLeft className="w-4 h-4" /> Back to campaign orders</Link>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">Order not found.</div>
      </div>
    )
  }

  const { campaign, clientName, progress, pieces, activity, readiness, threads, serviceWorkOrders } = detail
  const c = campaign
  // The shoot booking (Checkout Gates), so the operator can move/assign it. Best-effort.
  const booking = await getBookingForCampaign(id).catch(() => null)
  const items = (c.draft.items ?? []).filter((it) => it.included)
  const swoByLine = new Map<string, ServiceWorkOrder>()
  for (const w of serviceWorkOrders) if (w.lineItemId) swoByLine.set(w.lineItemId, w)
  const shipped = c.status === 'shipped'
  const awaitingConfirm = shipped && c.confirmedAt === null
  const confirmed = !!c.confirmedAt

  let monthly = 0, oneTime = 0
  for (const it of items) {
    const cad = (it.cadence ?? {}) as { kind?: string; every?: string }
    if (cad.kind === 'recurring') monthly += cad.every === 'weekly' ? it.price * 4 : it.price
    else if (cad.kind === 'one-time') oneTime += it.price
  }

  const mix = { setup: 0, content: 0, ongoing: 0 }
  for (const it of items) mix[lineKind(it)]++
  const mixLabel = [mix.setup && `${mix.setup} setup`, mix.content && `${mix.content} content`, mix.ongoing && `${mix.ongoing} ongoing`].filter(Boolean).join(' · ')

  let status: OrderStatus = 'awaiting'
  if (!awaitingConfirm) {
    const t = progress?.total ?? 0, l = progress?.live ?? 0
    status = t > 0 && l >= t ? 'done' : l > 0 ? 'live' : 'production'
  }
  const total = progress?.total ?? 0, live = progress?.live ?? 0
  const pct = total > 0 ? Math.min(100, (live / total) * 100) : 0

  const exec = (c.execution ?? {}) as Record<string, string>
  const execSet = Object.entries(EXEC_LABELS).filter(([k]) => (exec[k] ?? '').trim().length > 0)
  const openNeeds = (readiness?.items ?? []).filter((i) => !i.done && !i.optional && !i.skipped)
  const readyForClient = pieces.filter((p) => p.stage === 'ready_for_you').length

  const actionKind: 'confirm' | 'waiting-client' | 'on-track' =
    awaitingConfirm ? 'confirm' : (openNeeds.length > 0 || readyForClient > 0) ? 'waiting-client' : 'on-track'
  const waitingBits = [openNeeds.length > 0 && `${openNeeds.length} setup ${openNeeds.length === 1 ? 'answer' : 'answers'}`, readyForClient > 0 && `${readyForClient} ${readyForClient === 1 ? 'piece' : 'pieces'} to approve`].filter(Boolean).join(' and ')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/admin/campaign-orders" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"><ArrowLeft className="w-4 h-4" /> Back to campaign orders</Link>
        <Link href={`/dashboard/campaigns/${c.draft.id}`} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-brand-dark">Open client view <ExternalLink className="w-3.5 h-3.5" /></Link>
      </div>

      {/* Status hero */}
      <section className={`bg-white rounded-xl border p-5 ${awaitingConfirm ? 'border-amber-200 border-l-4 border-l-amber-400' : 'border-ink-6'}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink truncate">{c.draft.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[status]}`}>{STATUS_LABEL[status]}</span>
            </div>
            <p className="text-sm text-ink-3 mt-1"><span className="font-mono text-ink-4">#{id.slice(0, 8)}</span> · {clientName}{c.shippedAt ? ` · Shipped ${fmtDate(c.shippedAt)}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3 lg:justify-end">
            <Chip label="Price">{monthly > 0 ? <span className="font-medium tabular-nums">{money(monthly)}/mo</span> : null}{monthly > 0 && oneTime > 0 ? ' · ' : ''}{oneTime > 0 ? <span className="tabular-nums">{money(oneTime)} once</span> : (monthly === 0 ? '—' : '')}</Chip>
            {mixLabel && <Chip label="Work mix">{mixLabel}</Chip>}
            <div className="min-w-[130px]">
              <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Progress</div>
              <div className="text-sm text-ink mb-1 tabular-nums">{total > 0 ? `${live} of ${total} live` : 'Not tracked'}</div>
              {total > 0 && <div className="h-1.5 w-full rounded-full bg-ink-6 overflow-hidden"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>}
            </div>
          </div>
        </div>
      </section>

      {/* Owner asked to cancel (Amazon-style request). Leads the cockpit so an
          operator resolves it before other work. Approve = the real terminal
          stop; decline = it keeps running. */}
      {c.cancelState === 'requested' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-900">Owner asked to cancel this order</div>
              <div className="text-xs text-red-800">{c.cancelReason ? `"${c.cancelReason}"` : 'No reason given.'} Approving stops it now and cancels monthly billing; declining keeps it running. The owner is told either way.</div>
            </div>
          </div>
          <CancelRequestControl id={c.draft.id} />
        </div>
      )}

      {/* Shoot booking control (Checkout Gates): move a confirmed shoot, or assign a slot for a
          needs-reschedule / request-mode order. Only shown when this order has a shoot booking. */}
      {booking && <AdminBookingControl bookingId={booking.id} status={booking.status} label={booking.label} />}

      {/* Adaptive action band */}
      {actionKind === 'confirm' ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-900">Confirm this order</div>
              <div className="text-xs text-amber-800">A human needs to take it on. Confirming stamps the timeline and notifies the owner.</div>
            </div>
          </div>
          <div className="shrink-0"><ConfirmButton id={c.draft.id} /></div>
        </div>
      ) : actionKind === 'waiting-client' ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-amber-900">Waiting on the client</div>
            <div className="text-xs text-amber-800">This order needs {waitingBits} before it can move. Nudge them in Support if it is stalling.</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-ink-6 bg-brand-tint/40 px-5 py-4">
          <CheckCircle2 className="w-5 h-5 text-brand-dark shrink-0" />
          <div className="text-sm text-ink-2">Confirmed {fmtDate(c.confirmedAt)}. Nothing needs you right now{total > 0 ? ` · ${live} of ${total} live` : ''}.</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: plan + production, each row a click-to-expand trace */}
        <div className="lg:col-span-2 space-y-6">

          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <SectionHead icon={<Package className="w-5 h-5 text-ink-4" />} title={`The plan (${items.length})`} />
            <p className="text-[11px] text-ink-4 mb-4">Click any item to see where it is at and mark it in progress or complete. Content pieces track their own status in Production below.</p>
            {items.length === 0 ? (
              <Empty>No line items on this order.</Empty>
            ) : (
              <div className="space-y-5">
                {(['setup', 'content', 'ongoing'] as LineKind[]).map((kind) => {
                  const group = items.filter((it) => lineKind(it) === kind)
                  if (!group.length) return null
                  return (
                    <div key={kind}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_META[kind].chip}`}>{KIND_META[kind].label}</span>
                        <span className="text-[11px] text-ink-4">{group.length} {group.length === 1 ? 'item' : 'items'}</span>
                      </div>
                      <div className="space-y-2">
                        {group.map((it) => <ServiceRow key={it.id} it={it} kind={kind} awaitingConfirm={awaitingConfirm} confirmed={confirmed} shippedAt={c.shippedAt} campaignId={c.draft.id} swo={swoByLine.get(it.id)} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <SectionHead icon={<Wrench className="w-5 h-5 text-ink-4" />} title={`Production (${pieces.length})`} />
            {pieces.length === 0 ? (
              <Empty>No content pieces on this order. Service-only plans are run from the work queues, not tracked as pieces here.</Empty>
            ) : (
              <div className="space-y-2 mt-1">
                {pieces.map((p) => <PieceRow key={p.id} p={p} />)}
              </div>
            )}
          </div>
        </div>

        {/* Rail */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Order</h2>
            <div className="space-y-3">
              <Field label="Shipped">{c.shippedAt ? fmtDate(c.shippedAt) : '—'}</Field>
              <Field label="Confirmed">{c.confirmedAt ? fmtDate(c.confirmedAt) : 'Not yet'}</Field>
              <Field label="Client">{clientName}</Field>
              <Field label="Order ID"><span className="font-mono">{id.slice(0, 8).toUpperCase()}</span></Field>
            </div>
          </div>

          {openNeeds.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Still waiting on the client ({openNeeds.length})</div>
              <ul className="text-xs text-amber-900 list-disc pl-4 space-y-0.5">
                {openNeeds.slice(0, 8).map((i) => <li key={i.id}>{i.title}</li>)}
              </ul>
            </div>
          )}

          <Collapsible icon={<ListChecks className="w-5 h-5 text-ink-4" />} title="Setup answers" count={execSet.length}>
            {execSet.length === 0 ? <Empty>Nothing captured yet.</Empty> : (
              <div className="grid grid-cols-1 gap-3">
                {execSet.map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">{EXEC_LABELS[k]}</div>
                    <div className="text-sm text-ink whitespace-pre-wrap">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </Collapsible>

          <Collapsible icon={<MessageSquare className="w-5 h-5 text-ink-4" />} title="Support" count={threads.length}>
            {threads.length === 0 ? (
              <p className="text-sm text-ink-4">No messages from this client yet. <Link href="/admin/messages" className="text-brand-dark hover:underline">Open Messages</Link></p>
            ) : (
              <div className="space-y-1">
                {threads.map((t) => (
                  <Link key={t.id} href="/admin/messages" className="block rounded-lg px-3 py-2 hover:bg-bg-2 transition-colors">
                    <div className="text-sm font-medium text-ink truncate">{t.subject}</div>
                    {t.lastPreview && <div className="text-xs text-ink-4 truncate">{t.lastSenderRole === 'client' ? '' : 'You: '}{t.lastPreview}</div>}
                    <div className="text-[11px] text-ink-4 mt-0.5">{fmtDate(t.lastMessageAt)}</div>
                  </Link>
                ))}
                <Link href="/admin/messages" className="text-xs text-brand-dark hover:underline mt-1 inline-flex items-center gap-0.5">Open all in Messages <ExternalLink className="w-3 h-3" /></Link>
              </div>
            )}
          </Collapsible>

          {activity.length > 0 && (
            <Collapsible icon={<Clock className="w-5 h-5 text-ink-4" />} title="Activity" count={activity.length}>
              <div className="space-y-4">
                {activity.slice(0, 12).map((e) => (
                  <div key={e.id} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-bg-2"><Clock className="w-3 h-3 text-ink-3" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink">{e.text}{e.piece ? ` · ${e.piece}` : ''}</div>
                      <div className="text-[11px] text-ink-4 mt-0.5">{fmtDate(e.atISO)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── The lifecycle stepper (the "you are here" hero of every drill-down) ─────────────────────────
 * Nodes before `active` render filled brand with a check; `active` is a ringed dot with a soft
 * pulsing halo (amber when tone='amber', e.g. a piece waiting on the client); nodes after are hollow.
 * muted paints the whole thing gray (a stopped piece), never asserting progress. Pure CSS + markup. */
function Stepper({ nodes, active, tone = 'brand', muted }: { nodes: { label: string; sub?: string }[]; active: number; tone?: 'brand' | 'amber'; muted?: boolean }) {
  const ringColor = tone === 'amber' ? 'ring-amber-500' : 'ring-brand'
  const dotColor = tone === 'amber' ? 'bg-amber-500' : 'bg-brand'
  const haloColor = tone === 'amber' ? 'bg-amber-400/30' : 'bg-brand/30'
  return (
    <div className="flex">
      {nodes.map((node, i) => {
        const done = !muted && i < active
        const current = !muted && i === active
        return (
          <div key={i} className="flex-1 flex flex-col items-center min-w-0">
            <div className="flex items-center w-full">
              <div className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : (!muted && i <= active ? 'bg-brand' : 'bg-ink-6')}`} />
              <span className="relative shrink-0">
                {current && <span className={`absolute -inset-1 rounded-full animate-pulse ${haloColor}`} />}
                <span className={`relative grid place-items-center h-7 w-7 rounded-full ${done ? 'bg-brand text-white' : current ? `bg-white ring-2 ${ringColor}` : muted ? 'bg-gray-100 border border-gray-200' : 'bg-white border border-ink-5'}`}>
                  {done ? <Check className="w-3.5 h-3.5" /> : current ? <span className={`h-2 w-2 rounded-full ${dotColor}`} /> : null}
                </span>
              </span>
              <div className={`h-0.5 flex-1 ${i === nodes.length - 1 ? 'bg-transparent' : (!muted && i < active ? 'bg-brand' : 'bg-ink-6')}`} />
            </div>
            <div className={`text-[10.5px] leading-tight text-center mt-1.5 px-1 ${current ? (tone === 'amber' ? 'text-amber-700 font-semibold' : 'text-ink font-medium') : done ? 'text-ink' : 'text-ink-4'}`}>
              {node.label}{node.sub && <div className="text-ink-4 tabular-nums">{node.sub}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function WherePill({ label, tone }: { label: string; tone: keyof typeof PILL }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL[tone]}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{label}</span>
}

/** One plan line as a click-to-expand trace. Collapsed = compact row with a family accent band and a
 *  where-it-is pill; open = a 3-node phase path (Confirmed -> being made -> live/running, the last node
 *  never asserted) plus the honest window / gate / expected-ready / assignee facts. */
function ServiceRow({ it, kind, awaitingConfirm, confirmed, shippedAt, campaignId, swo }: { it: LineItem; kind: LineKind; awaitingConfirm: boolean; confirmed: boolean; shippedAt: string | null; campaignId: string; swo?: ServiceWorkOrder }) {
  const node1 = kind === 'setup' ? 'Being set up' : kind === 'content' ? 'In production' : 'Getting started'
  const node2 = kind === 'ongoing' ? 'Running' : 'Live'
  const nodes = [{ label: 'Confirmed' }, { label: node1 }, { label: node2 }]
  // When a service has a real work order, IT is the source of truth (status derived from the operator's
  // playbook progress). The lock override remains the fallback for lines with no work order yet.
  const lock = (it.lock as 'editable' | 'in-production' | 'delivered' | undefined) ?? 'editable'
  const complete = swo ? swo.status === 'delivered' : lock === 'delivered'
  const active = complete ? 3 : confirmed ? 1 : 0
  const stepTone: 'brand' | 'amber' = awaitingConfirm && !complete && (swo ? swo.status === 'queued' : lock === 'editable') ? 'amber' : 'brand'
  const pill = swo
    ? swoPill(swo)
    : complete
      ? { label: 'Complete', tone: 'brand' as keyof typeof PILL }
      : lock === 'in-production'
        ? { label: 'In progress', tone: 'blue' as keyof typeof PILL }
        : { label: lineStatus(kind, awaitingConfirm), tone: (awaitingConfirm ? 'amber' : kind === 'ongoing' ? 'sky' : 'blue') as keyof typeof PILL }
  const window = etaLabelFor(it.serviceId)
  const readyBy = expectedReadyBy(shippedAt, it.serviceId)
  const gate = gateNoteOf(it)
  return (
    <details className="group rounded-lg border border-ink-6 border-l-4 bg-bg-2 open:bg-white open:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] open:ring-1 open:ring-ink-6 transition-shadow [&_summary::-webkit-details-marker]:hidden ${KIND_META[kind].band}">
      <summary className="flex items-start justify-between gap-3 p-3 cursor-pointer list-none">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink">{it.plain || it.name}</div>
          <div className="text-xs text-ink-3">{it.does}{it.qty ? ` · x${it.qty}` : ''}</div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <WherePill label={pill.label} tone={pill.tone} />
            <span className="text-[11px] text-ink-4 inline-flex items-center gap-1"><User className="w-3 h-3" />{assigneeOf(it)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right flex items-start gap-2">
          <div>
            <div className="text-sm font-medium text-ink tabular-nums">{money(it.price)}</div>
            <div className="text-[11px] text-ink-4">{cadenceLabel(it.cadence as { kind: string; every?: string; unit?: string })}</div>
          </div>
          <ChevronDown className="w-4 h-4 text-ink-4 mt-0.5 transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="grid grid-rows-[0fr] group-open:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out">
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1">
            <div className="rounded-lg bg-bg-2/70 border border-ink-6/60 p-3.5">
              <Stepper nodes={nodes} active={active} tone={stepTone} />
              <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 text-[11px]">
                <span><span className="text-ink-4 uppercase tracking-wide font-medium">Window</span> <span className="text-ink ml-1">{window}</span></span>
                {readyBy && <span><span className="text-ink-4 uppercase tracking-wide font-medium">Ready by</span> <span className="text-ink ml-1">about {readyBy}</span></span>}
                <span><span className="text-ink-4 uppercase tracking-wide font-medium">Who</span> <span className="text-ink ml-1">{assigneeOf(it)}</span></span>
              </div>
              {gate && (
                <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-800">{gate.note} <span className="font-semibold whitespace-nowrap">{gate.delta}</span></div>
                </div>
              )}
              {swo ? (
                <WorkOrderSummary swo={swo} />
              ) : (
                <div className="mt-3 pt-3 border-t border-ink-6/60">
                  <LineStatusControl campaignId={campaignId} lineId={it.id} current={lock} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </details>
  )
}

/** One content piece as a click-to-expand trace. Collapsed = compact row; open = the REAL 5-node
 *  tracked lifecycle lit by the piece's live stage (amber on the client-turn node), plus the lane,
 *  go-live date, delivery / live-post buttons, and the numeric readout once live. */
function PieceRow({ p }: { p: TrackerPiece }) {
  const goLive = p.goLiveISO ? fmtShort(p.goLiveISO) : ''
  const nodes = [
    { label: 'Brief in' },
    { label: 'In production' },
    { label: 'Ready for OK' },
    { label: 'Goes live', sub: goLive || undefined },
    { label: 'First numbers' },
  ]
  const STEP: Record<string, number> = { making: 1, ready_for_you: 2, approved: 3, scheduled: 3, posted: 4, gathering: 4 }
  const dropped = p.stage === 'dropped'
  const active = dropped ? -1 : p.readoutValue ? nodes.length : (STEP[p.stage] ?? 1)
  const tone = p.stage === 'ready_for_you' ? 'amber' as const : 'brand' as const
  const laneTone: keyof typeof PILL = p.lane === 'creator' ? 'violet' : 'sky'
  const band = p.lane === 'creator' ? 'border-l-violet-400' : 'border-l-sky-400'
  const pillTone: keyof typeof PILL = dropped ? 'gray' : p.stage === 'ready_for_you' ? 'amber' : (p.stage === 'posted' || p.stage === 'gathering') ? 'brand' : 'blue'
  const pillLabel = p.readoutValue ?? STAGE_LABEL[p.stage]
  return (
    <details className={`group rounded-lg border border-ink-6 border-l-4 bg-bg-2 open:bg-white open:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] open:ring-1 open:ring-ink-6 transition-shadow [&_summary::-webkit-details-marker]:hidden ${band}`}>
      <summary className="flex items-start justify-between gap-3 p-3 cursor-pointer list-none">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink truncate">{p.label}</div>
          <div className="text-xs text-ink-3">
            <span className={`inline-block rounded px-1.5 py-0.5 mr-1.5 text-[10px] font-semibold ${PILL[laneTone]}`}>{p.lane === 'creator' ? 'Creator' : 'Team'}</span>
            {p.who}{p.goLiveISO ? ` · goes live ${goLive}` : ''}
          </div>
          <div className="mt-1.5"><WherePill label={pillLabel} tone={pillTone} /></div>
        </div>
        <ChevronDown className="w-4 h-4 text-ink-4 mt-0.5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid grid-rows-[0fr] group-open:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out">
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1">
            <div className="rounded-lg bg-bg-2/70 border border-ink-6/60 p-3.5">
              {dropped ? (
                <div className="text-sm text-ink-4 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-gray-400" /> Stopped. This piece was dropped and needs a new maker.</div>
              ) : (
                <Stepper nodes={nodes} active={active} tone={tone} />
              )}
              <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
                <span><span className="text-ink-4 uppercase tracking-wide font-medium">Made by</span> <span className="text-ink ml-1">{p.who}</span></span>
                {p.goLiveISO && <span><span className="text-ink-4 uppercase tracking-wide font-medium">Goes live</span> <span className="text-ink ml-1">{goLive}</span></span>}
                {p.stageAtISO && <span className="text-ink-4">Updated {p.stageAtPrecise ? '' : 'about '}{fmtShort(p.stageAtISO)}</span>}
              </div>
              {(p.previewUrl || p.postLink || p.readoutValue) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {p.previewUrl && <a href={p.previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 bg-white border border-ink-6 px-2.5 py-1 rounded-md hover:bg-bg-2 transition-colors">View delivery <ExternalLink className="w-3 h-3" /></a>}
                  {p.postLink && <a href={p.postLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-white bg-brand px-2.5 py-1 rounded-md hover:bg-brand-dark transition-colors">See it live <ExternalLink className="w-3 h-3" /></a>}
                  {p.readoutValue && <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${p.readoutVerdict === 'working' ? 'bg-brand-tint text-brand-dark' : p.readoutVerdict === 'drop' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700'}`}>{p.readoutValue}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </details>
  )
}

/** The one-line gateway to the focused "Your Turn" inbox: pile counts + Open. The heavy servicing UI
 *  lives on /admin/work-orders/[id]; this row just says where the work stands. */
function WorkOrderSummary({ swo }: { swo: ServiceWorkOrder }) {
  const counts = pileCounts(classifySteps(swo.serviceId, swo.steps as unknown as WorkOrderStep[]))
  return (
    <div className="mt-3 pt-3 border-t border-ink-6/60 flex items-center justify-between gap-3">
      <div className="text-[12px] text-ink-3 tabular-nums">
        <span className={counts.yourTurn > 0 ? 'text-brand-dark font-semibold' : ''}>{counts.yourTurn} your turn</span>
        <span className="text-ink-5"> · </span>{counts.waiting} waiting<span className="text-ink-5"> · </span>{counts.done} done
      </div>
      <Link href={`/admin/work-orders/${swo.id}`} className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-dark transition-colors">
        Open <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  )
}

function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-ink-4">{children}</div>
}
function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-1">
      <h2 className="font-[family-name:var(--font-display)] text-lg text-ink flex items-center gap-2">{icon} {title}</h2>
      <div className="h-px mt-2 bg-gradient-to-r from-brand/40 to-transparent" />
    </div>
  )
}
function Collapsible({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <details className="group bg-white rounded-xl border border-ink-6 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex items-center justify-between gap-2 p-5 cursor-pointer list-none">
        <span className="font-[family-name:var(--font-display)] text-lg text-ink flex items-center gap-2">{icon} {title}
          {count > 0 && <span className="bg-bg-2 text-ink-3 rounded-full px-2 py-0.5 text-xs font-medium">{count}</span>}
        </span>
        <ChevronDown className="w-4 h-4 text-ink-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5 -mt-1">{children}</div>
    </details>
  )
}
