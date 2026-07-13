/**
 * computeStages — the DEFINITIVE, honest stage math for the outcome funnel.
 * =========================================================================
 * Apnosh sells outcome accountability, so every client-facing stage number must
 * be traceable to a real source. This module is the single place that turns the
 * registry (which sources exist), the status resolver (which are CONNECTED for a
 * client), and the value resolver (each source's real number for the window)
 * into the five stage headlines.
 *
 * THE ABSOLUTE RULE: a stage headline is the SUM of its CONNECTED source values
 * ONLY. We never estimate, extrapolate, fill a gap, or fabricate. A source that
 * is not CONNECTED (AVAILABLE_NOT_CONNECTED / ERROR / COMING_SOON) contributes
 * NOTHING to the sum — it is still listed (so the owner sees every input), just
 * with value null and counted:false. A MANUAL_ENTRY value (owner typed it) is
 * flagged isManual and may be counted for the Sales / Retention headlines.
 *
 * By construction: headline === sum of the sources where counted === true. The
 * verify script proves this for every stage.
 *
 * The pure computeStagesFrom(statuses, values) is the test seam (no I/O). The
 * server computeStages(clientId, window) wires the two real resolvers to it.
 */

import {
  sourcesForStage,
  SOURCE_BY_ID,
  shortLabelFor,
  STAGE_NAMES,
  type FunnelStage,
  type SourceStatus,
  type SourceProvider,
  type ResolvedSourceMap,
} from './source-registry'

export type InsightsWindow = '7d' | '30d' | '90d' | '12m'

/** One source inside a stage, as the UI + reconcile test read it. */
export interface StageSourceView {
  id: string
  /** full owner-words sentence — for admin / hover */
  displayName: string
  /** short noun label for the breakdown card ("Google Maps views") */
  shortLabel: string
  provider: SourceProvider
  /** the real number for the window, or null when not CONNECTED / unavailable */
  value: number | null
  status: SourceStatus
  /** CONNECTED with a real (non-null) value — a genuine, queried number */
  hasData: boolean
  /** true ONLY for the sources that add up to this stage's headline */
  counted: boolean
  /** how this source reads in the breakdown: a 'sum' box (adds to the headline
   *  when connected), a 'context' row (shown, never summed), or a 'drilldown'. */
  feedRole: 'sum' | 'context' | 'drilldown'
  isHero?: boolean
  isStageNumber?: boolean
  isDrilldown?: boolean
  /** a human typed this value (Phase 6 wires entry; modeled here) */
  isManual?: boolean
  manualBy?: string | null
  manualAt?: string | null
}

export interface ComputedStage {
  stage: FunnelStage
  label: string
  /** the stage headline == sum of counted source values; null when the stage is empty */
  headline: number | null
  /** the word for the number (e.g. Awareness = "views", never "people") */
  unit?: string
  sources: StageSourceView[]
  heroSourceId?: string
  /** no CONNECTED / manual source feeds this stage -> collapse gracefully, headline null */
  isEmpty: boolean
  /** plain note, e.g. Retention's review-count fallback */
  note?: string
}

/** Optional manual store (owner-typed values). None exists yet; supported now. */
export interface ManualEntry { value: number; by?: string | null; at?: string | null }
export type ManualStore = Record<string, ManualEntry>

// The sources that SUM into each stage headline (drill-downs + context are
// excluded). Stage 4 and 5 have preference rules layered on top (see below).
const SUMMABLE: Record<FunnelStage, string[]> = {
  1: ['gbp_impressions_search', 'gbp_impressions_maps', 'ig_reach', 'tiktok_video_views', 'facebook_reach', 'yelp_views'],
  // Owner redefinition (2026-07-13): Interest = people EXPLORING you but not yet
  // trying to come/buy — website visits, menu looks, profile taps. Website
  // visits (GA sessions) count every arrival ONCE; gbp_website_clicks is the
  // Google path to the site and is deduped against GA visits below (only counts
  // for GBP-only clients with no GA4). Dropped from the number as double-counts
  // or vanity: ig_link_clicks (same arrival), ig_engaged/ig_saves/ig_shares
  // (likes/shares aren't intent, and saves/shares have no data source). Those
  // stay in the registry as context, never summed. Actions (stage 3) unchanged.
  2: ['ga4_website_visits', 'gbp_website_clicks', 'ga4_menu_views', 'ig_profile_visits'],
  3: ['gbp_direction_requests', 'gbp_calls', 'gbp_booking_clicks', 'ga4_order_clicks', 'ga4_phone_taps', 'reservations'],
  4: ['pos_covers', 'delivery_orders'],
  5: ['pos_repeat_customers'],
}

const STAGE_UNIT: Partial<Record<FunnelStage, string>> = {
  1: 'views',
  2: 'looks', // profile visits + post engagement are look-events, not unique people
  3: 'actions',
  4: 'guests',
  5: 'guests',
}

const RETENTION_FALLBACK_NOTE =
  'Repeat guests need a register. Showing new reviews this month instead.'
const SALES_EMPTY_NOTE =
  'We cannot see sales yet. Connect your register to measure guests and revenue.'

/** A source can enter a sum when it is genuinely CONNECTED with data, or a human
 *  typed it (manual). Nothing else ever counts. */
function usable(v: StageSourceView): boolean {
  return v.value != null && (v.status === 'CONNECTED' || v.isManual === true)
}

/** Build the base view for one source (status + value + flags), before we decide
 *  which ones are counted into the headline. */
function toView(
  id: string,
  statuses: ResolvedSourceMap,
  values: Record<string, number | null>,
  manual: ManualStore,
): StageSourceView {
  const def = SOURCE_BY_ID[id]
  const resolved = statuses[id]
  const man = manual[id]

  let status: SourceStatus = resolved?.status ?? 'AVAILABLE_NOT_CONNECTED'
  let value: number | null = null
  let isManual = false
  let manualBy: string | null | undefined
  let manualAt: string | null | undefined

  if (man && man.value != null) {
    // a human typed this — it wins over whatever the connector says
    status = 'MANUAL_ENTRY'
    value = man.value
    isManual = true
    manualBy = man.by ?? null
    manualAt = man.at ?? null
  } else if (status === 'CONNECTED') {
    // only a CONNECTED source may carry a real number into the funnel
    const raw = values[id]
    value = raw == null ? null : raw
  }

  return {
    id,
    displayName: def.displayName,
    shortLabel: shortLabelFor(id),
    provider: def.provider,
    value,
    status,
    hasData: status === 'CONNECTED' && value != null,
    counted: false, // decided per-stage below
    feedRole: def.isDrilldown ? 'drilldown' : 'context', // refined per-stage below
    isHero: def.isHero,
    isStageNumber: def.isStageNumber,
    isDrilldown: def.isDrilldown,
    ...(isManual ? { isManual, manualBy, manualAt } : {}),
  }
}

function sumCounted(sources: StageSourceView[]): number {
  return sources.reduce((s, v) => s + (v.counted && v.value != null ? v.value : 0), 0)
}

/**
 * PURE stage math. Given every source's resolved status + real value (+ optional
 * manual store), return the five stages with honest headlines. No I/O.
 */
export function computeStagesFrom(
  statuses: ResolvedSourceMap,
  values: Record<string, number | null>,
  manual: ManualStore = {},
): ComputedStage[] {
  const stages: ComputedStage[] = []

  for (const stage of [1, 2, 3, 4, 5] as FunnelStage[]) {
    const defs = sourcesForStage(stage)
    const sources = defs.map(d => toView(d.id, statuses, values, manual))
    const byId = (id: string) => sources.find(s => s.id === id)

    let heroSourceId: string | undefined
    let note: string | undefined

    if (stage === 4) {
      // SALES: POS covers is the headline when a register (or manual) feeds it.
      // Otherwise sum any connected sale-count sources (delivery). Today all POS /
      // delivery sources are COMING_SOON -> nothing usable -> the stage is empty
      // and collapses (never a fake 0).
      const covers = byId('pos_covers')
      if (covers && usable(covers)) {
        covers.counted = true
      } else {
        for (const id of ['delivery_orders']) {
          const v = byId(id)
          if (v && usable(v)) v.counted = true
        }
      }
      // pos_avg_ticket is DERIVED (revenue / covers) only when both are present.
      const avg = byId('pos_avg_ticket')
      const rev = byId('pos_revenue')
      if (avg) {
        const revVal = rev && usable(rev) ? rev.value : null
        const covVal = covers && usable(covers) ? covers.value : null
        avg.value = revVal != null && covVal != null && covVal > 0
          ? Math.round((revVal / covVal) * 100) / 100
          : null
      }
      if (!sources.some(s => s.counted)) note = SALES_EMPTY_NOTE
    } else if (stage === 5) {
      // RETENTION: repeat customers preferred; else fall back to new reviews this
      // month (gbp_review_count). Rating trend / follower growth / returning users
      // ride along as CONTEXT, never summed.
      const repeat = byId('pos_repeat_customers')
      if (repeat && usable(repeat)) {
        repeat.counted = true
      } else {
        const reviews = byId('gbp_review_count')
        if (reviews && usable(reviews)) {
          reviews.counted = true
          note = RETENTION_FALLBACK_NOTE
        } else {
          // no register AND no reviews -> still document the intended fallback
          note = RETENTION_FALLBACK_NOTE
        }
      }
    } else {
      // AWARENESS / INTEREST / ACTIONS: sum the CONNECTED summable sources.
      for (const id of SUMMABLE[stage]) {
        const v = byId(id)
        if (v && usable(v)) v.counted = true
      }
      // Interest dedupe: GA website visits already count every arrival, and GBP
      // website-clicks are mostly those same people arriving via Google. When GA
      // visits are counted, drop the GBP-clicks overlap so we don't count the
      // same visit twice. GBP-only clients (no GA4) keep GBP clicks as their one
      // website signal.
      if (stage === 2) {
        const web = byId('ga4_website_visits')
        const gClicks = byId('gbp_website_clicks')
        if (web?.counted && gClicks?.counted) gClicks.counted = false
      }
      if (stage === 3) heroSourceId = 'gbp_direction_requests'
    }

    // feedRole: a source reads as a 'sum' box when it either counts toward the
    // headline or is a canonical candidate (shown "Not connected" so the owner
    // sees the whole recipe). Drill-downs stay drilldown; everything else context.
    const summableIds = SUMMABLE[stage]
    for (const s of sources) {
      if (s.isDrilldown) { s.feedRole = 'drilldown'; continue }
      s.feedRole = s.counted || summableIds.includes(s.id) ? 'sum' : 'context'
    }

    const anyCounted = sources.some(s => s.counted)
    const headline = anyCounted ? sumCounted(sources) : null

    stages.push({
      stage,
      label: STAGE_NAMES[stage],
      headline,
      unit: STAGE_UNIT[stage],
      sources,
      heroSourceId,
      isEmpty: !anyCounted,
      note,
    })
  }

  return stages
}

/**
 * SERVER entry: resolve one client's statuses + real values for the window and
 * compute the honest stages. Never throws (both resolvers are best-effort). No
 * manual store exists yet, so manual stays empty here.
 */
export async function computeStages(clientId: string, window: InsightsWindow = '30d'): Promise<ComputedStage[]> {
  const { resolveSourceStatuses } = await import('./resolve-source-statuses')
  const { loadStageValues } = await import('./stage-values')
  const [statuses, values] = await Promise.all([
    resolveSourceStatuses(clientId),
    loadStageValues(clientId, window),
  ])
  return computeStagesFrom(statuses, values, {})
}
