/**
 * THE ROUTER — per composed move: which lanes could honestly do it, and a default.
 *
 * Phase 2 of the strategist flow (docs/STRATEGIST-FLOW-PLAN.md). The strategist composes the
 * best plan tool-agnostically FIRST (the inversion); this module decides, per line, who could
 * carry it — you (DIY), Apnosh AI, the Apnosh team, or a local creator — and which of those is
 * the sensible default. It runs AFTER composition and never adds, removes, reorders, or
 * reprices a composed line except through stampLane. No I/O, no AI, pure.
 *
 * ── ONE LANE VOCABULARY ────────────────────────────────────────────────────────────────────────
 * Lane IS PieceProducer (types.ts), the value already persisted on campaign_line_items.producer
 * and resolved by planCampaignPieces. The setup-card engine's SetupLaneKind ('diy'|'ai'|'team')
 * is a strict subset — the lane-routing sim pins both relations so a third vocabulary can never
 * drift into existence.
 *
 * ── WHAT MAKES AN OFFER LEGAL (laws 1 + 3) ─────────────────────────────────────────────────────
 *   team    the rails can carry it: serviceable !== false and isServiceReady. whyNot is the
 *           rail's own sentence, never a euphemism.
 *   creator content-* lines only (reels/photos/stories per the manifest): those are the pieces
 *           with a real dispatch + mint path (planCampaignPieces). A creator lane on a SERVICE
 *           line has no mint path today, so offering it would sell work nothing fulfils —
 *           sim-pinned out, so widening it later must consciously delete a failing check.
 *   diy     law 3: only with a real guide behind it — a diy lane on a LAW-CLEAN setup card for
 *           this service, or the line is already guide-only (guideKey in GUIDE_MOVES). No guide,
 *           no DIY offer, no exceptions.
 *   ai      an ai lane on a law-clean setup card, or a content type whose manifest handlers
 *           include the AI draft.
 * The router refuses to read lanes off a card that fails laneViolations — platform truth stays
 * enforced in ONE place (setup/types.ts) and the router only ever narrows it (two-tier law 1).
 *
 * ── NO INVENTED PRICES ─────────────────────────────────────────────────────────────────────────
 * team = the composed line price. diy = $0. ai = the setup lane's own price/proOnly, or
 * AI_DRAFT_CENTS for content drafts. creator = the SAME price as team (planCampaignPieces bills
 * baseCents either way) — the copy says swap, not upsell. If creator pricing ever diverges it
 * must come from the work-orders pricing pass, not here.
 *
 * ── SUPPLY NEVER GATES AVAILABILITY ────────────────────────────────────────────────────────────
 * CreatorSupply (fetched once, MonthlySignals pattern) enriches copy and biases defaults. The
 * internal pool fallback is shipped truth, so the offer surface must not depend on a fetch.
 *
 * routeViolations() is laws 1+2 as arithmetic over a finished route — the sim's teeth, the same
 * pattern as laneViolations: mutations are proven against the exported checker, not by wiring
 * test seams through the implementation.
 */
import type { LineItem, PieceProducer } from '../types'
import { AI_DRAFT_CENTS } from '../catalog'
import { isServiceReady, serviceNotYetReason } from '../data/service-availability'
import { GUIDE_MOVES } from '../data/guide-moves'
import { SETUP_CARDS, setupCardByServiceId } from '../setup/cards'
import { laneViolations, type SetupCard, type SetupLane } from '../setup/types'
import { PIECE_BY_TYPE } from '../content-menu/manifest'
import { disciplineForType } from '../creators'
import type { Dispatch } from '@/lib/marketplace/creator-skills'
import type { CreatorSupply } from '../data/creator-supply'

export type Lane = PieceProducer

/** How hands-on the owner wants to be. Biases DEFAULTS only — never availability, never the
 *  composition. undefined behaves as hands_off (team defaults). */
export type HandsOn = 'hands_on' | 'mix' | 'hands_off'

export interface LaneOffer {
  lane: Lane
  available: boolean
  /** Honest owner-facing reason. REQUIRED when available is false (routeViolations enforces). */
  whyNot?: string
  /** Dollars, LineItem.price units. Existing sources only — see header. */
  price?: number
  /** e.g. "Included in Pro" — carried verbatim from the setup lane. */
  priceNote?: string
  /** Lane copy: "Same price — made by a local creator", supply counts, guide minutes. */
  note?: string
}

export interface RouteContext {
  supply?: CreatorSupply
  handsOn?: HandsOn
  /** Sim seam: the card list the router reads lane truth from. Defaults to the live cards. */
  cards?: readonly SetupCard[]
}

export interface MoveRoute {
  /** Always all four, fixed order team/creator/diy/ai. Unavailable lanes ghost, never hide. */
  lanes: LaneOffer[]
  /** Guaranteed available (law 2 — routeViolations refuses otherwise). */
  default: Lane
}

export const LANE_ORDER: readonly Lane[] = ['team', 'creator', 'diy', 'ai']

const CONTENT_PREFIX = 'content-'
const contentType = (serviceId: string | undefined): string | null =>
  serviceId?.startsWith(CONTENT_PREFIX) ? serviceId.slice(CONTENT_PREFIX.length) : null

/** The law-clean setup card for a service, or undefined. A card that fails laneViolations is
 *  treated as absent: the router never sells lanes off a broken card. */
function cleanCardFor(serviceId: string | undefined, cards: readonly SetupCard[]): SetupCard | undefined {
  if (!serviceId) return undefined
  const card = cards === SETUP_CARDS ? setupCardByServiceId(serviceId) : cards.find((c) => c.serviceId === serviceId)
  if (!card) return undefined
  return laneViolations(card).length === 0 ? card : undefined
}

const laneOn = (card: SetupCard | undefined, kind: SetupLane['kind']): SetupLane | undefined =>
  card?.lanes.find((l) => l.kind === kind)

/** Supply copy for a craft, when we know it. Absent supply = no claim made. */
function supplyNote(d: Dispatch | null, supply?: CreatorSupply): string | undefined {
  if (!d || !supply) return undefined
  const n = supply.countByCraft[d] ?? 0
  if (n <= 0) return undefined
  return n === 1 ? '1 local creator near you' : `${n} local creators near you`
}

/**
 * One lane's legality + honest facts for one line. The single source both routeForItem and
 * routeViolations read, so a doctored route can always be caught by re-derivation.
 */
function offerFor(item: LineItem, lane: Lane, ctx: RouteContext): LaneOffer {
  const cards = ctx.cards ?? SETUP_CARDS
  const type = contentType(item.serviceId)
  const guideOnly = item.serviceable === false

  switch (lane) {
    case 'team': {
      if (guideOnly) {
        return { lane, available: false, whyNot: 'This one is yours to do. There is nothing to buy here.' }
      }
      if (!isServiceReady(item.serviceId)) {
        return { lane, available: false, whyNot: serviceNotYetReason(item.serviceId) ?? 'We cannot run this one yet.' }
      }
      return { lane, available: true, price: item.price }
    }
    case 'creator': {
      if (!type) {
        return { lane, available: false, whyNot: 'Creators make reels, photos and stories. This one is ours to run.' }
      }
      const disc = disciplineForType(type)
      const handlers = PIECE_BY_TYPE[type]?.handlers ?? []
      if (!disc || !handlers.some((h) => h.value === 'creator')) {
        return { lane, available: false, whyNot: 'This piece is not creator work.' }
      }
      return {
        lane,
        available: true,
        price: item.price,
        note: supplyNote(disc, ctx.supply) ?? 'Same price. A local creator makes it.',
      }
    }
    case 'diy': {
      if (guideOnly) {
        const g = GUIDE_MOVES[item.guideKey ?? '']
        return { lane, available: true, price: 0, note: g ? `${g.minutes} min, with our guide` : 'With our guide' }
      }
      const diyLane = laneOn(cleanCardFor(item.serviceId, cards), 'diy')
      if (!diyLane) {
        return { lane, available: false, whyNot: 'No self-serve guide for this one yet.' }
      }
      return { lane, available: true, price: 0, note: diyLane.label }
    }
    case 'ai': {
      const aiLane = laneOn(cleanCardFor(item.serviceId, cards), 'ai')
      if (aiLane) {
        return {
          lane,
          available: true,
          price: aiLane.price?.amount ?? 0,
          ...(aiLane.proOnly ? { priceNote: 'Included in Pro' } : {}),
          note: aiLane.label,
        }
      }
      if (type && (PIECE_BY_TYPE[type]?.handlers ?? []).some((h) => h.value === 'ai')) {
        return { lane, available: true, price: AI_DRAFT_CENTS / 100, note: 'AI drafts it, you approve' }
      }
      return { lane, available: false, whyNot: 'AI can draft words and graphics, not this.' }
    }
  }
}

/** The default bias per hands-on answer: first AVAILABLE lane in this order wins. */
const DEFAULT_ORDER: Record<HandsOn, readonly Lane[]> = {
  hands_off: ['team', 'ai', 'diy', 'creator'],
  hands_on: ['diy', 'team', 'ai', 'creator'],
  mix: ['ai', 'team', 'diy', 'creator'],
}

export function routeForItem(item: LineItem, ctx: RouteContext = {}): MoveRoute {
  const lanes = LANE_ORDER.map((lane) => offerFor(item, lane, ctx))
  const order = DEFAULT_ORDER[ctx.handsOn ?? 'hands_off']
  const available = new Set(lanes.filter((o) => o.available).map((o) => o.lane))
  const def = order.find((l) => available.has(l)) ?? lanes.find((o) => o.available)?.lane ?? 'team'
  return { lanes, default: def }
}

/**
 * Laws 1 + 2 as arithmetic over a finished route. Empty = legal. The sim feeds this doctored
 * routes and mutated cards; a violation the checker cannot name is a violation the sim cannot
 * catch, so every rule here exists because a mutation proved it necessary or the law demands it.
 */
export function routeViolations(item: LineItem, route: MoveRoute, ctx: RouteContext = {}): string[] {
  const out: string[] = []
  const name = item.serviceId || item.id

  // Law 2: the surface itself — all four lanes present exactly once, in the fixed order.
  const laneSeq = route.lanes.map((o) => o.lane)
  if (laneSeq.length !== LANE_ORDER.length || LANE_ORDER.some((l, i) => laneSeq[i] !== l)) {
    out.push(`${name}: lanes must be exactly [${LANE_ORDER.join(', ')}] — a hidden lane is a silent drop`)
  }

  /* Law 2: a genuinely useful move always has somewhere to land — with ONE honest exception.
   * A rail-held line (send/ads/pos rail missing) legally has zero lanes: the plan already
   * renders it held-and-unbilled, which IS the law-2 surface for "we cannot do this yet".
   * The exception is narrow: it applies only when the rail law itself is the reason, so a
   * doctored route cannot hide behind it for a deliverable service. */
  const railHeld = item.serviceable !== false && !isServiceReady(item.serviceId)
  const availableLanes = route.lanes.filter((o) => o.available)
  if (availableLanes.length === 0 && !railHeld) out.push(`${name}: no lane can carry this move — it would silently vanish`)
  const defOffer = route.lanes.find((o) => o.lane === route.default)
  if (!defOffer?.available && !(railHeld && availableLanes.length === 0)) {
    out.push(`${name}: default lane '${route.default}' is not available`)
  }

  for (const o of route.lanes) {
    // Honesty: an unavailable lane says why, always.
    if (!o.available && !o.whyNot?.trim()) out.push(`${name}/${o.lane}: unavailable with no reason given`)
    // Law 1: an available offer must be backed by the same facts this module derives them from.
    if (o.available && !offerFor(item, o.lane, ctx).available) {
      out.push(`${name}/${o.lane}: offered but the platform cannot back it`)
    }
  }
  return out
}

/**
 * THE one encoder from a lane choice to LineItem fields. Two encodings exist in the wild and
 * this is where they stay unified:
 *   content lines  → producer 'ai' (price stamped to the AI draft price — lineTotal has no ai
 *                    special case, so the price IS the honesty) / 'creator' (price unchanged) /
 *                    team (producer cleared, price restored).
 *   service lines  → the gbp triple the adapter already ships: {producer:'diy', ownerMode,
 *                    price:0} for diy AND ai lanes (ai is an owner-run walkthrough mode, not a
 *                    producer — inventing producer:'ai' on services would break lineTotal and
 *                    the mint skip).
 * basePrice is the pristine composed price, so team→X→team round-trips byte-exactly.
 */
export function stampLane(item: LineItem, lane: Lane, basePrice: number): LineItem {
  const isContent = contentType(item.serviceId) != null
  if (isContent) {
    if (lane === 'ai') return { ...item, producer: 'ai', ownerMode: undefined, price: AI_DRAFT_CENTS / 100 }
    if (lane === 'creator') return { ...item, producer: 'creator', ownerMode: undefined, price: basePrice }
    if (lane === 'team') return { ...item, producer: 'team', ownerMode: undefined, price: basePrice }
    return { ...item, producer: 'diy', ownerMode: undefined, price: 0 }
  }
  if (lane === 'diy' || lane === 'ai') {
    return { ...item, producer: 'diy', ownerMode: lane, price: 0 }
  }
  // team (creator is never stamped on service lines — routeForItem never offers it).
  return { ...item, producer: 'team', ownerMode: undefined, price: basePrice }
}

/**
 * Apply the hands-on answer as per-line defaults.
 *
 * Touches ONLY lines whose producer is 'team' or unset — 'team' is the composer's base state
 * (serviceToLines stamps it on every line so downstream `!== 'diy'` checks can't be tripped by
 * undefined), so it means "never asked", not "the owner chose Apnosh". Anything else (diy, ai,
 * creator) is an explicit choice — the gbp doer stamp, a LaneRow tap — and passes through
 * byte-identical (the no-double-ask golden). The chosen default is stamped only when its lane
 * is actually available (rail-held lines keep their held rendering untouched).
 */
export function applyLaneDefaults(items: LineItem[], ctx: RouteContext): LineItem[] {
  return items.map((item) => {
    if (item.producer !== undefined && item.producer !== 'team') return item
    if (!item.included) return item
    const route = routeForItem(item, ctx)
    if (route.default === 'team') return item
    if (!route.lanes.find((o) => o.lane === route.default)?.available) return item
    return stampLane(item, route.default, item.price)
  })
}

/* Compile-time vocabulary pin (the sim asserts it too, but the compiler catches drift first):
 * every SetupLaneKind is a Lane. */
type _SetupLaneIsLane = SetupLane['kind'] extends Lane ? true : never
const _pin: _SetupLaneIsLane = true
void _pin
