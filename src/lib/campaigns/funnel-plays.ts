/**
 * funnel-plays — the bridge between the CampaignFunnel visualization and the
 * REAL priced catalog.
 *
 * The funnel has five owner-facing stages (saw → clicked → reserved → turned up
 * → would return). Each maps to one or more of the catalog's growth-loop
 * StageId sections, so a stage's "plays" are actual PricedService / content
 * pieces with real names and real prices — not hand-authored labels. Toggling a
 * play on a real campaign adds/removes a real LineItem (see buildFunnelData +
 * lineItemForPiece), so the funnel is a live editor over the campaign's plan.
 *
 * The catalog carries NO quantitative effect (reach/lift) — see the audit note
 * in priced-catalog (weight is an ordering hint, explicitly NOT an
 * effectiveness figure). So the reach/lift numbers here are an honest,
 * clearly-labeled PROJECTION model owned by the funnel, keyed by play, with a
 * per-stage default so any catalog service still moves the funnel.
 *
 * Pure + client-safe: only imports the catalog helpers + pure types (no
 * server-only modules), so it runs in the CampaignFunnel client component.
 */
import type { StageId } from '@/lib/campaigns/stages'
import type { LineItem } from '@/lib/campaigns/types'
import type { SavedCampaign } from '@/lib/campaigns/view'
import {
  serviceById,
  serviceToLines,
  buildContentLine,
  plainNameOf,
  CONTENT_META,
} from '@/lib/campaigns/catalog'

export type FunnelStageKey = 'saw' | 'clicked' | 'reserved' | 'turnedup' | 'return'
export const FUNNEL_STAGE_KEYS: FunnelStageKey[] = ['saw', 'clicked', 'reserved', 'turnedup', 'return']

/** One addable/removable marketing play on the funnel. Mirrors the Piece shape
 *  the CampaignFunnel component consumes. `reach` is top-of-funnel people (saw
 *  stage); `lift` is added conversion into a downstream stage. */
export interface FunnelPiece {
  id: string
  name: string
  reach?: number
  lift?: number
  /** headline price (the first price point — a setup/one-off, or the monthly if
   *  that's all there is). */
  cost: number
  /** cadence of `cost`, so the UI can show "/mo" instead of implying a one-off. */
  cadence?: 'one-time' | 'monthly' | 'per-unit'
  /** every OTHER price point of the service (a monthly that rides alongside a
   *  setup, a per-unit charge, ...) — shown + counted so nothing hides. */
  extras?: PriceExtra[]
}
/** An additional recurring/per-unit charge beyond the headline price. */
export interface PriceExtra { amount: number; per: 'mo' | 'ea' }

/** The funnel's five stages (labels/subs/tones). Counts + conversions are
 *  computed live by the component; this is just the template. Kept identical to
 *  the component's own DEFAULT_STAGES so the mock and the real path agree. */
export const FUNNEL_TEMPLATE: { key: FunnelStageKey; label: string; sub: string; tone: 'green' | 'amber'; count: number }[] = [
  { key: 'saw', label: 'Saw the promo', sub: 'reach', tone: 'green', count: 0 },
  { key: 'clicked', label: 'Clicked through', sub: 'read the details', tone: 'amber', count: 0 },
  { key: 'reserved', label: 'Reserved', sub: 'booked a table', tone: 'green', count: 0 },
  { key: 'turnedup', label: 'Turned up', sub: 'on the night', tone: 'green', count: 0 },
  { key: 'return', label: 'Would return', sub: 'rebooked', tone: 'green', count: 0 },
]

/* ── Funnel stage ↔ catalog section mapping ──────────────────────────
 * Each funnel stage reads from one or more StageId sections. The sets are
 * DISJOINT (every section belongs to at most one funnel stage) so a line item's
 * stage maps back to exactly one funnel stage on reload — no ambiguity.
 *
 * 'foundation' is deliberately absent: setup services (gbp-setup, site-menu,
 * tracking, crm-list, ...) are NOT funnel plays. They map to no funnel stage
 * (funnelStageForSection → null), so the funnel never surfaces them as toggles
 * and itemsForSelection always preserves them untouched. */
const STAGE_SECTIONS: Record<FunnelStageKey, (StageId | 'foundation')[]> = {
  saw: ['awareness', 'anticipation'],
  clicked: ['capture'],
  reserved: ['convert'],
  turnedup: ['nurture'],
  return: ['retain', 'advocate', 'winback'],
}

/** The StageId a newly-added play in this funnel stage should carry (so a
 *  content piece added here reads back into the same stage). Services carry
 *  their own section, so this only matters for content pieces. */
const PRIMARY_SECTION: Record<FunnelStageKey, StageId> = {
  saw: 'awareness', clicked: 'capture', reserved: 'convert', turnedup: 'nurture', return: 'retain',
}

/** Which funnel stage a line item / service section belongs to (null = a
 *  section the funnel doesn't surface). */
export function funnelStageForSection(section: StageId | 'foundation'): FunnelStageKey | null {
  for (const k of FUNNEL_STAGE_KEYS) if (STAGE_SECTIONS[k].includes(section)) return k
  return null
}

/* ── Curated plays per stage ─────────────────────────────────────────
 * The catalog id + its projected effect. Names + costs are resolved LIVE from
 * the catalog (below) so pricing stays a single source of truth. Content pieces
 * use the `content-<type>` id. Every id's section maps to its listed stage, so
 * the funnel round-trips. */
type Curated = { id: string; reach?: number; lift?: number }
const CURATED: Record<FunnelStageKey, Curated[]> = {
  // awareness / anticipation / foundation — what puts you in front of people
  saw: [
    { id: 'gbp-posts', reach: 500 },
    { id: 'content-post', reach: 300 },
    { id: 'content-reel', reach: 900 },
    { id: 'social-mgmt', reach: 700 },
    { id: 'paid-ads', reach: 800 },
    { id: 'creator-collab', reach: 900 },
    { id: 'local-seo', reach: 400 },
    { id: 'nextdoor-local', reach: 350 },
  ],
  // capture — what makes them look closer + hands you the lead
  clicked: [
    { id: 'landing-page', lift: 0.08 },
    { id: 'capture-kit', lift: 0.06 },
    { id: 'incentive-design', lift: 0.05 },
    { id: 'ai-phone', lift: 0.04 },
  ],
  // convert — what gets them to book
  reserved: [
    { id: 'offer-eng', lift: 0.10 },
    { id: 'reservation-protect', lift: 0.06 },
    { id: 'happy-hour-engine', lift: 0.05 },
    { id: 'reminder-send', lift: 0.04 },
    { id: 'menu-eng', lift: 0.04 },
  ],
  // nurture — what makes sure they show
  turnedup: [
    { id: 'welcome-seq', lift: 0.15 },
    { id: 'second-visit', lift: 0.12 },
  ],
  // retain / advocate / winback — what brings them back
  return: [
    { id: 'loyalty', lift: 0.20 },
    { id: 'content-email', lift: 0.12 },
    { id: 'content-sms', lift: 0.10 },
    { id: 'review-engine', lift: 0.10 },
    { id: 'referral', lift: 0.10 },
    { id: 'birthday', lift: 0.08 },
    { id: 'winback', lift: 0.08 },
  ],
}

/** Fallback effect for any catalog play not in CURATED (so a real campaign line
 *  we didn't hand-pick still contributes honestly). */
const DEFAULT_REACH = 400
const DEFAULT_LIFT: Record<FunnelStageKey, number> = { saw: 0, clicked: 0.05, reserved: 0.05, turnedup: 0.10, return: 0.10 }

type Priced = { name: string; cost: number; cadence?: 'one-time' | 'monthly' | 'per-unit'; extras: PriceExtra[] }

/** Resolve a play's owner-facing name + FULL real price from the catalog —
 *  EVERY price point (headline + all extras), so a service never hides a
 *  recurring monthly or a per-unit charge. Mirrors serviceToLines, which mints
 *  one line per price point. Returns null for an id the catalog doesn't know. */
function resolvePlay(id: string): Priced | null {
  const m = /^content-(.+)$/.exec(id)
  if (m) {
    const meta = CONTENT_META[m[1]]
    return meta ? { name: meta.label, cost: meta.price, extras: [] } : null // content = flat per-piece
  }
  const s = serviceById(id)
  if (!s || !s.prices.length) return null
  const [headline, ...rest] = s.prices
  return {
    name: plainNameOf(s),
    cost: headline.amount,
    cadence: headline.kind,
    extras: rest.map((p) => ({ amount: p.amount, per: p.kind === 'monthly' ? ('mo' as const) : ('ea' as const) })),
  }
}

function curatedEffect(c: Curated, k: FunnelStageKey): Pick<FunnelPiece, 'reach' | 'lift'> {
  return k === 'saw' ? { reach: c.reach ?? DEFAULT_REACH } : { lift: c.lift ?? DEFAULT_LIFT[k] }
}

/** The catalog-grounded plays available on each funnel stage, with real names +
 *  prices. This is the `pieces` prop the funnel builds from. */
export function catalogFunnelPieces(): Record<FunnelStageKey, FunnelPiece[]> {
  const out = {} as Record<FunnelStageKey, FunnelPiece[]>
  for (const k of FUNNEL_STAGE_KEYS) {
    out[k] = []
    for (const c of CURATED[k]) {
      const r = resolvePlay(c.id)
      if (!r) continue
      out[k].push({ id: c.id, name: r.name, cost: r.cost, cadence: r.cadence, extras: r.extras, ...curatedEffect(c, k) })
    }
  }
  return out
}

/** The effect (reach/lift) to attribute to a real line item on a stage — its
 *  curated value if we hand-picked it, else the per-stage default. */
function effectForId(id: string, k: FunnelStageKey): Pick<FunnelPiece, 'reach' | 'lift'> {
  const c = CURATED[k].find((x) => x.id === id)
  if (c) return curatedEffect(c, k)
  return k === 'saw' ? { reach: DEFAULT_REACH } : { lift: DEFAULT_LIFT[k] }
}

/** Represent a campaign line item as a selectable funnel piece. Prefer the
 *  catalog's FULL price (all points) so a two-price service on the plan shows its
 *  monthly too; fall back to the line's own price for anything off-catalog. */
function pieceFromLine(line: LineItem, k: FunnelStageKey): FunnelPiece {
  const r = resolvePlay(line.serviceId)
  // off-catalog fallback: map the line's own billing cadence into our vocabulary
  const lineCadence: FunnelPiece['cadence'] =
    line.cadence?.kind === 'recurring' ? 'monthly' : line.cadence?.kind === 'per-occurrence' ? 'per-unit' : 'one-time'
  const base: Priced = r ?? { name: line.plain || line.name, cost: line.price, cadence: lineCadence, extras: [] }
  return { id: line.serviceId, name: base.name, cost: base.cost, cadence: base.cadence, extras: base.extras, ...effectForId(line.serviceId, k) }
}

/** A one-line kicker under the campaign name (mirrors the mock's "Event promo ·
 *  Fri 14 Mar"). */
function kickerFor(saved: SavedCampaign): string {
  const d = saved.draft
  const bits: string[] = []
  if (d.occasion) bits.push(d.occasion)
  else if (d.goalKey) bits.push(GOAL_LABEL[d.goalKey] ?? 'Campaign')
  else bits.push('Campaign')
  if (d.targetDate) {
    const dt = new Date(d.targetDate + (d.targetDate.length <= 10 ? 'T00:00:00' : ''))
    if (!isNaN(dt.getTime())) bits.push(dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))
  }
  return bits.join(' · ')
}
const GOAL_LABEL: Record<string, string> = {
  regulars: 'Keep regulars coming', 'new-customers': 'Bring in new guests', 'slow-nights': 'Fill slow nights', reviews: 'Grow your reviews',
}

export interface FunnelData {
  clientId: string
  campaignId: string
  campaignName: string
  kicker: string
  /** editable only while the campaign is an unshipped draft — a shipped campaign
   *  is read-only (its plays are locked + editing would reconcile real work). */
  editable: boolean
  pieces: Record<FunnelStageKey, FunnelPiece[]>
  initialSelected: Record<FunnelStageKey, string[]>
  /** the full persisted line items — the baseline the funnel deltas against so a
   *  toggle never drops a line the funnel doesn't surface. */
  initialItems: LineItem[]
}

/** Build everything the CampaignFunnel needs from a saved campaign: the plays
 *  (catalog + whatever's already on the plan), the current selection (grouped
 *  from the line items), and the baseline items for delta persistence. */
export function buildFunnelData(saved: SavedCampaign): FunnelData {
  const lines = (saved.draft.items ?? []).filter((it) => it.included && !it.optOut)
  const pieces = catalogFunnelPieces()
  const initialSelected: Record<FunnelStageKey, string[]> = { saw: [], clicked: [], reserved: [], turnedup: [], return: [] }
  for (const line of lines) {
    const k = funnelStageForSection(line.stage)
    if (!k) continue
    if (!initialSelected[k].includes(line.serviceId)) initialSelected[k].push(line.serviceId)
    if (!pieces[k].some((p) => p.id === line.serviceId)) pieces[k].push(pieceFromLine(line, k))
  }
  return {
    clientId: saved.clientId,
    campaignId: saved.draft.id,
    campaignName: saved.draft.name,
    kicker: kickerFor(saved),
    editable: saved.status === 'draft',
    pieces,
    initialSelected,
    initialItems: saved.draft.items ?? [],
  }
}

/** Build the LineItem(s) for a play toggled ON, with DETERMINISTIC ids so
 *  re-deriving the plan never churns ids. Emits ALL price points of a service
 *  (serviceToLines) — a setup+monthly service becomes two lines, not one, so its
 *  recurring charge + production are never dropped. */
export function lineItemForPieceLines(pieceId: string, k: FunnelStageKey): LineItem[] {
  const idBase = `funnel-${k}-${pieceId}`
  const m = /^content-(.+)$/.exec(pieceId)
  if (m) { const l = buildContentLine(m[1], idBase, { stage: PRIMARY_SECTION[k] }); return l ? [l] : [] }
  const s = serviceById(pieceId)
  return s ? serviceToLines(s, idBase) : []
}

/**
 * Compute the persisted LineItem[] for a new funnel selection.
 *
 * The funnel is authoritative for FUNNEL-MANAGED lines (those whose stage maps
 * to one of the five funnel stages); every other line (foundation setup, a
 * section the funnel doesn't surface) is preserved untouched. For each managed
 * serviceId:
 *   - selected + already on the plan → keep ALL its lines (every price point),
 *     reviving any that were opted-out/excluded (so re-selecting an opted-out
 *     service revives it, never appends a duplicate full-price line)
 *   - selected + NOT on the plan → mint fresh line(s) for every price point
 *   - not selected → dropped
 * Order is preserved for existing lines; new lines append. Idempotent: derives
 * purely from (baselineItems, selected).
 */
export function itemsForSelection(
  baselineItems: LineItem[],
  selected: Record<FunnelStageKey, string[]>,
): LineItem[] {
  const selectedKeys = new Set<string>() // `${stage}|${serviceId}` the owner wants on
  for (const k of FUNNEL_STAGE_KEYS) for (const sid of selected[k] ?? []) selectedKeys.add(`${k}|${sid}`)

  const result: LineItem[] = []
  const kept = new Set<string>() // managed group keys already emitted
  // pass 1 — walk the plan in order: keep non-managed; keep+revive managed-selected; drop managed-unselected
  for (const it of baselineItems) {
    const k = funnelStageForSection(it.stage)
    if (!k) { result.push(it); continue }
    const key = `${k}|${it.serviceId}`
    if (!selectedKeys.has(key)) continue // managed + deselected → drop
    result.push(it.included && !it.optOut ? it : { ...it, included: true, optOut: undefined })
    kept.add(key)
  }
  // pass 2 — mint selected plays that weren't already on the plan (every price point)
  for (const k of FUNNEL_STAGE_KEYS) {
    for (const sid of selected[k] ?? []) {
      const key = `${k}|${sid}`
      if (kept.has(key)) continue
      result.push(...lineItemForPieceLines(sid, k))
      kept.add(key)
    }
  }
  return result
}
