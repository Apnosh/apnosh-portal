/**
 * item-status — the honest per-line-item status for the item detail page, derived with the SAME
 * rules the tracker (campaign-work.tsx) uses, so the two surfaces can never disagree:
 *  - a content piece's status is its REAL stage (content_drafts / creator orders);
 *  - a service's status comes from its turnaround class + its real service work order when one
 *    exists — a recurring service says "Live" only off a real started order or the tracker's own
 *    node math (setup + making stages behind us), never straight off the calendar;
 *  - service flips without a real order are window ESTIMATES and never claim "Done";
 *  - dropped pieces never count as out;
 *  - "Needs you" fires exactly when an OPEN required readiness ask (setupOwed) ties to this item,
 *    or a piece genuinely waits on the owner's OK (ready_for_you).
 * Pure + client-safe: no I/O.
 */
import { turnaroundFor } from '@/lib/campaigns/data/service-turnaround'
import { playbookNeedKeys } from '@/lib/campaigns/data/service-playbooks'
import { disciplineForType } from '@/lib/campaigns/creators'
import { setupOwed, type ReadinessReport, type ReadinessItem } from '@/lib/campaigns/readiness-types'
import { serviceClassWindowDays, type SavedCampaign, type ShippedPhase } from '@/lib/campaigns/view'
import type { ContentBeat, LineItem } from '@/lib/campaigns/types'
import type { TrackerPiece } from '@/lib/campaigns/tracker/types'

/** Slim, owner-safe view of a service work order (no operator internals), added to the campaign
 *  GET so per-service status is real where a row exists. */
export interface ItemServiceOrder {
  lineItemId: string | null
  serviceId: string
  status: string   // queued | claimed | in_progress | blocked_client | blocked_gate | ready_for_client | delivered
  dueDate: string | null
  deliveredAt: string | null
}

export type ItemStatusWord = 'Needs you' | 'Setting up' | 'Being made' | 'Live' | 'Done' | 'Stopped'

export interface ItemStatusResult {
  word: ItemStatusWord
  /** the OPEN required readiness asks tied to this item — drives the "Needs you" callout. */
  openAsks: ReadinessItem[]
  /** true when a piece of this item waits on the owner's OK (stage ready_for_you). */
  pieceAwaitsYou: boolean
}

const isContentLine = (it: LineItem) => /^content-/.test(it.serviceId ?? '')

/** This line's pieces. Menu lines mint pieces keyed by the line id ('L#0'); Walk/AI beats carry
 *  their own id ('b3') plus the lineId they came from; legacy campaigns key positionally
 *  ('Video:0' / 'email:0'), whose group also rides as the piece's channel. */
export function piecesForItem(item: LineItem, pieces: TrackerPiece[], beats?: ContentBeat[]): TrackerPiece[] {
  const m = /^content-(.+)$/.exec(item.serviceId ?? '')
  if (!m) return []
  // Beat ids that belong to this line (a beat's key is its own id when it has one).
  const beatIds = new Set((beats ?? []).filter((b) => b.lineId === item.id && b.id).map((b) => b.id!))
  const byId = pieces.filter((p) => !!p.pieceKey && (p.pieceKey === item.id || p.pieceKey.startsWith(`${item.id}#`) || beatIds.has(p.pieceKey)))
  if (byId.length) return byId
  // Legacy positional fallback only — never steal another line's id-keyed pieces.
  const group = disciplineForType(m[1]) ?? m[1]
  const positional = (k: string | null) => !k || /^[A-Za-z]+:\d+$/.test(k)
  return pieces.filter((p) => positional(p.pieceKey) && (p.channel === group || (p.pieceKey ?? '').startsWith(`${group}:`)))
}

// Mirrors service-needs.ts (server-only) — the ask ids each service implies. Used only to
// INTERSECT with the real open asks (setupOwed), so nothing here can invent an ask.
const MENU_SERVICES = new Set(['site-menu', 'menu-eng', 'catering-engine', 'menu-photo-refresh'])
const LIST_SERVICES = new Set(['crm-list', 'email-found'])
const SHOOT_ASKS = ['shootTimes', 'onSiteContact', 'filmStaff']

function askIdsForItem(item: LineItem): string[] {
  const out: string[] = []
  const sid = item.serviceId ?? ''
  const m = /^content-(.+)$/.exec(sid)
  if (m) {
    // A filmed piece shares the shoot asks; the "edit my footage" card's upload ask too.
    if (['reel', 'video', 'photo'].includes(m[1])) out.push(...SHOOT_ASKS, 'footage')
    return out
  }
  if (sid === 'gbp-setup' && item.producer === 'diy') out.push('gbp-fix')
  for (const key of playbookNeedKeys(sid)) {
    if (key === 'gbp-access') out.push('gbp-access')
    else if (key === 'listing-access') out.push('listing-access')
    else if (key === 'menu-source') out.push('menu-source')
    else if (key === 'pos-vendor') out.push(sid === 'delivery-opt' ? 'delivery-access' : 'pos-vendor')
    else if (key === 'gbp-photos') out.push('gbp-photos')
    else if (key === 'ad-access') out.push('ad-access', 'ad-targeting')
  }
  if (sid === 'review-responses') out.push('brand-voice')
  if (sid === 'site-menu') out.push('site-access')
  const t = turnaroundFor(sid)
  const gate = t && t.class === 'setup' ? t.gate : undefined
  if (gate) {
    if (gate.kind === 'gbp-verify') out.push('gbp-access')
    else if (gate.kind === 'listing-propagation') out.push('listing-access')
    else if (gate.kind === 'pos-vendor') out.push('pos-vendor')
    else if (gate.kind === 'sms-10dlc') out.push('sms-register')
    else if (gate.kind === 'print') out.push('print-address')
  }
  if (t?.class === 'creative' && t.needsShoot) out.push(...SHOOT_ASKS)
  if (MENU_SERVICES.has(sid)) out.push('menu-source')
  if (LIST_SERVICES.has(sid)) out.push('customer-list')
  return [...new Set(out)]
}

/** Is the tracker's "Live and running" node the CURRENT one? Same math as campaign-work.tsx:
 *  never while frozen (setup phase) or unconfirmed; setup + making stages must be behind us
 *  (real piece stages beat estimates; a posted piece proves production was reached). */
function runningNodeCurrent(camp: SavedCampaign, phase: ShippedPhase, pieces: TrackerPiece[], readiness: ReadinessReport | null, nowMs: number): boolean {
  if (phase === 'setup') return false
  const doneSet = new Set(readiness?.doneSetupIds ?? [])
  const services = (camp.draft.items ?? []).filter((it) => it.included && !it.optOut && it.producer !== 'diy' && !(it.serviceId && doneSet.has(it.serviceId)))
  const cls = (it: LineItem) => (it.serviceId ? turnaroundFor(it.serviceId)?.class : undefined) ?? 'other'
  const setupSvcs = services.filter((it) => cls(it) === 'setup')
  const creativeSvcs = services.filter((it) => cls(it) === 'creative')
  const unposted = pieces.filter((p) => p.stage !== 'posted' && p.stage !== 'gathering' && p.stage !== 'dropped')
  const postedCount = pieces.filter((p) => p.stage === 'posted' || p.stage === 'gathering').length
  // confirmed_at tri-state: null = still waiting on the team; undefined (pre-feature) = taken on.
  if (camp.confirmedAt === null && postedCount === 0) return false
  const shippedMs = camp.shippedAt ? new Date(camp.shippedAt).getTime() : NaN
  const haveClock = !isNaN(shippedMs)
  const elapsed = haveClock ? (nowMs - shippedMs) / 86400000 : 0
  const pastWindow = (d: number) => haveClock && d > 0 && elapsed >= d
  const setupDone = setupSvcs.length === 0 || pastWindow(serviceClassWindowDays(services, 'setup')) || postedCount > 0
  const makingDone = unposted.length === 0 && (creativeSvcs.length === 0 || pastWindow(serviceClassWindowDays(services, 'creative')) || !haveClock)
  return setupDone && makingDone
}

export function itemStatus(args: {
  item: LineItem
  camp: SavedCampaign
  phase: ShippedPhase
  pieces: TrackerPiece[]
  readiness: ReadinessReport | null
  serviceOrders: ItemServiceOrder[] | null
  nowMs?: number
}): ItemStatusResult {
  const { item, camp, phase, pieces, readiness, serviceOrders } = args
  const nowMs = args.nowMs ?? Date.now()
  const stopped = camp.status === 'stopped'
  const askIds = new Set(askIdsForItem(item))
  const openAsks = setupOwed(readiness).filter((i) => askIds.has(i.id))
  let pieceAwaitsYou = false
  // An open ask only demotes a pre-live status — it never un-claims real delivered/posted work.
  const done = (w: ItemStatusWord): ItemStatusResult => ({ word: w, openAsks, pieceAwaitsYou })
  const pending = (w: ItemStatusWord): ItemStatusResult =>
    done(openAsks.length > 0 && (w === 'Setting up' || w === 'Being made') ? 'Needs you' : w)

  // ── content piece: its REAL stage is the status ──
  if (isContentLine(item)) {
    const mine = piecesForItem(item, pieces, camp.draft.brief?.contentBeats)
    if (mine.length) {
      const alive = mine.filter((p) => p.stage !== 'dropped')
      if (!alive.length) return done('Stopped')   // dropped pieces never count as out
      if (alive.some((p) => p.stage === 'ready_for_you')) { pieceAwaitsYou = true; return done('Needs you') }
      if (alive.every((p) => p.stage === 'posted' || p.stage === 'gathering')) return done(phase === 'done' ? 'Done' : 'Live')
      // A real advance past 'making' (approved/scheduled/posted) beats the setup freeze.
      const advanced = alive.some((p) => ['approved', 'scheduled', 'posted', 'gathering'].includes(p.stage))
      if (phase === 'setup' && !advanced) return pending('Setting up')
      return pending('Being made')
    }
    // No matched piece row: fall back to the campaign's own honest phase — never overclaim.
    if (stopped) return done('Stopped')
    if (phase === 'done') return done('Done')
    return pending(phase === 'setup' ? 'Setting up' : 'Being made')
  }

  // ── owner-run line (producer 'diy'): the work IS the owner's; only the server-verified
  //    gbp completion stamp may claim Done ──
  if (item.producer === 'diy') {
    if (item.serviceId === 'gbp-setup' && (camp.execution?.gbpFixedAt ?? '').trim()) return done('Done')
    if (stopped) return done('Stopped')
    return done('Needs you')
  }

  // ── service line: the real work order first, then the tracker's class + node rules ──
  const order = (serviceOrders ?? []).find((o) => o.lineItemId === item.id)
    ?? (serviceOrders ?? []).find((o) => !o.lineItemId && o.serviceId === item.serviceId)
  if (order?.status === 'delivered') return done('Done')     // real, proof-gated
  if (phase === 'done') return done('Done')                  // a wrapped campaign has no unfinished work
  if (order && (order.status === 'ready_for_client' || order.status === 'blocked_client')) return done('Needs you')
  const cls = (item.serviceId ? turnaroundFor(item.serviceId)?.class : undefined) ?? 'other'
  if (cls === 'recurring' || cls === 'other') {
    if (stopped) return done('Stopped')   // nothing new starts or posts on a stopped campaign
    const started = !!order && ['claimed', 'in_progress', 'blocked_gate'].includes(order.status)
    if (order) return pending(started ? 'Live' : 'Setting up')
    // Legacy (no minted order): Live only when the tracker's own running node is current.
    return pending(runningNodeCurrent(camp, phase, pieces, readiness, nowMs) ? 'Live' : 'Setting up')
  }
  // setup / creative class: the same words the tracker rows show; a window estimate never claims Done.
  return pending(cls === 'creative' ? 'Being made' : 'Setting up')
}
