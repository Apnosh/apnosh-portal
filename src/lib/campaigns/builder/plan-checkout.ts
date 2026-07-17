/**
 * Checkout: the WHOLE plan launches as ONE campaign (the locked owner decision).
 * Each cart item is composed EXACTLY as Buy now composes it — draftFromBuilder with
 * empty madlib vals plus the item's {doer, options} preset, the same no-madlib path a
 * DB campaign rides — then the per-item drafts merge into one CampaignDraft:
 *
 *  - line items concatenate with a per-item id prefix (`<itemId>__<lineId>`) so ids
 *    never collide; every other field is untouched, so a line's producer / price /
 *    ownerMode (the free gbp diy/ai lanes) is byte-equal to its single-item compose
 *  - briefs merge: content beats concatenate, audiences/channels union, spec merges
 *    first-wins (moves/stages/leadMove are plan-flow render hints and never persist,
 *    so the merged container honestly omits them)
 *  - goalKey stays unset: a multi-goal plan claims no single goal
 *
 * The merged draft ships through the SAME saveAndShip rail (ship.ts) as Buy now, so
 * one campaign = one unified progress/results view, for free.
 *
 * Pure + client-safe. Never throws for one bad item: stale/unpriceable items come
 * back in `dropped` so the UI can say so out loud (never silently billed).
 */
import type { CampaignBrief, CampaignDraft, LineItem } from '../types'
import { summarize } from '../types'
import { draftFromBuilder, gbpLaneFromDoer } from './adapter'
import { isProTier } from '@/lib/entitlements'
import { isKnownPlanItem, type PlanDraftItem } from './plan-draft'

type CartItem = Pick<PlanDraftItem, 'itemId' | 'doer' | 'options'>

/** The builder vals a plan item composes with — the item's preset riding the SAME keys
 *  the madlib/PDP hand Buy now (spec.doer picks the gbp lane; spec.options carries the
 *  add-on serviceIds), over otherwise-empty vals. */
export function valsForPlanItem(it: CartItem): Record<string, unknown> {
  const vals: Record<string, unknown> = {}
  if (it.doer) vals.doer = it.doer
  if (it.options.length) vals.options = it.options.join(',')
  return vals
}

/** True when the plan holds the Pro-gated gbp AI lane but the client isn't Pro.
 *  Checkout blocks (same gate Buy now enforces on the PDP) — never a silent downgrade. */
export function planProBlocked(items: CartItem[], tier: string | null | undefined): boolean {
  if (isProTier(tier)) return false
  return items.some((it) => it.doer != null && gbpLaneFromDoer(it.doer) === 'ai')
}

/** "Marketing plan · Jul 11" — the one-campaign container name. */
export function planCheckoutName(now: Date = new Date()): string {
  return `Marketing plan · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** Merge the per-item briefs into one. Base = the first brief (its template/objective/kpi
 *  stand for the container); content beats concatenate in cart order; audiences and
 *  channels union; spec merges first-wins so one item's answers never overwrite another's. */
function mergeBriefs(briefs: CampaignBrief[]): CampaignBrief | undefined {
  if (!briefs.length) return undefined
  const base = briefs[0]
  const audienceIds = [...new Set(briefs.flatMap((b) => b.audienceIds))]
  const channelIds = [...new Set(briefs.flatMap((b) => b.channelIds))]
  const contentBeats = briefs.flatMap((b) => b.contentBeats)
  // Ongoing (null) wins; otherwise the longest run bounds the container.
  const durationWeeks = briefs.some((b) => b.durationWeeks === null)
    ? null
    : briefs.reduce<number | null>((m, b) => (b.durationWeeks != null && (m == null || b.durationWeeks > m) ? b.durationWeeks : m), null)
  const spec: Record<string, string> = {}
  for (const b of briefs) for (const [k, v] of Object.entries(b.spec)) if (!(k in spec)) spec[k] = v
  const offer = briefs.find((b) => b.offer)?.offer
  return {
    templateId: base.templateId,
    objective: base.objective,
    ...(offer ? { offer } : {}),
    audienceIds,
    channelIds,
    kpi: base.kpi,
    durationWeeks,
    contentBeats,
    spec,
  }
}

export interface ComposedPlanCheckout {
  /** The one merged campaign, or null when nothing in the cart composes. */
  draft: CampaignDraft | null
  /** itemIds that failed to compose (stale/unpriceable) — surface these, never bill them. */
  dropped: string[]
  /** Each surviving item's own single-item draft, in cart order (the merge source). */
  perItem: { itemId: string; draft: CampaignDraft }[]
}

/** Compose every cart item as Buy now would, then merge into ONE campaign draft. */
export function composePlanCampaign(items: CartItem[], now: Date = new Date()): ComposedPlanCheckout {
  const perItem: { itemId: string; draft: CampaignDraft }[] = []
  const dropped: string[] = []
  for (const it of items) {
    // Membership first: an id no longer in the merged catalog would otherwise compose the
    // engine's generic fallback plan — which would silently bill something the owner never
    // saw priced. Unknown or crashing items go to `dropped`, out loud.
    if (!isKnownPlanItem(it.itemId)) { dropped.push(it.itemId); continue }
    try {
      perItem.push({ itemId: it.itemId, draft: draftFromBuilder({ itemId: it.itemId, status: 'approve', vals: valsForPlanItem(it) }) })
    } catch {
      dropped.push(it.itemId)
    }
  }
  if (!perItem.length) return { draft: null, dropped, perItem }

  // Concatenate line items with a per-item id prefix so ids never collide. ONLY the id
  // changes — producer/price/ownerMode/cadence ride through byte-identical.
  const lines: LineItem[] = perItem.flatMap(({ itemId, draft }) =>
    draft.items.map((li) => ({ ...li, id: `${itemId}__${li.id}` })))

  // The earliest per-item target date anchors the container; its occasion rides along.
  const dated = perItem.map((p) => p.draft).filter((d) => d.targetDate).sort((a, b) => (a.targetDate! < b.targetDate! ? -1 : 1))
  const anchor = dated[0]

  const brief = mergeBriefs(perItem.map((p) => p.draft.brief).filter((b): b is CampaignBrief => !!b))
  const bill = summarize(lines)

  const draft: CampaignDraft = {
    id: 'new',
    name: planCheckoutName(now),
    intent: perItem.some((p) => p.draft.intent === 'ongoing') ? 'ongoing' : 'one-off',
    path: 'strategist',
    phase: 'build',
    budgetMonthly: bill.perMonth,
    items: lines,
    planned: true,
    // The primary product this order came from (first cart item), so the post-checkout readiness
    // page can apply the owner's per-campaign needs config. Best-effort for a bundled cart.
    ...(perItem[0]?.itemId ? { sourceCatalogId: perItem[0].itemId } : {}),
    // EVERY source id, so the server availability guards can vet the whole cart (a coming-soon
    // item must never hide behind a live first item and get charged).
    sourceCatalogIds: [...new Set(perItem.map((p) => p.itemId))],
    ...(anchor?.targetDate ? { targetDate: anchor.targetDate } : {}),
    ...(anchor?.occasion ? { occasion: anchor.occasion } : {}),
    ...(brief ? { brief } : {}),
  }
  return { draft, dropped, perItem }
}
