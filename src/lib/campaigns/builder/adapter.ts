/**
 * Adapter: turns the campaign builder's output (a catalog item id + the owner's
 * filled slot values) into a real CampaignDraft. It serializes the slot values into
 * a spec, asks composePlanForGoal for the item's plan template (the content beats +
 * goal + occasion), then reuses the composeCampaign engine so the saved campaign has
 * priced line items, a brief, and a budget — no backend or schema change.
 *
 * The owner's exact slot choices are preserved in brief.spec so the team sees what
 * they asked for.
 */

import type { CampaignDraft, BuildPath } from '../types'
import { composeCampaign } from '../campaign-composer'
import { summarize } from '../types'
import { composePlanForGoal, mapAudience } from './compose-plan'
import { serviceById, serviceToLine, serviceToLines } from '../catalog'

// seedFromItem (the Content Menu cart seeder) now lives with the item shapes it reads,
// so the cart and the plan flow draw pieces from one table. Re-exported to keep the
// public import path (@/lib/campaigns/builder/adapter) stable.
export { seedFromItem } from './compose-plan'

/** A calendar date the owner picked, serialized to an ISO day (YYYY-MM-DD) from its
 *  LOCAL parts — so "July 1" stays July 1 regardless of timezone, and deriveSchedule's
 *  parseDay treats it as UTC midnight (consistent with the rest of the date math). */
function toLocalISODay(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Serialize the builder's slot values into a flat spec (stored in brief.spec) and
 *  surface the keys composeCampaign reads (offer, feature). The free-text audience slot
 *  is renamed so it can't blank out the template audiences. */
function specFromVals(vals: Record<string, unknown>): Record<string, string> {
  const spec: Record<string, string> = {}
  for (const [k, v] of Object.entries(vals || {})) {
    if (v == null || v === '') continue
    let str: string
    if (Array.isArray(v)) str = v.join(', ')
    else if (v instanceof Date) str = toLocalISODay(v)
    else if (typeof v === 'object') str = JSON.stringify(v)
    else str = String(v)
    if (!str.trim()) continue
    if (k === 'audience' || k === 'who') {
      // Keep the raw answer for the team brief, AND drive targeting from it (the locked
      // decision): set spec.audience to mapped segment ids only when there's a match, so a
      // no-match falls back to the goal default rather than blanking the targeting. The
      // firstvisit madlib asks this as "{who}"; treat it like an audience answer.
      spec.audienceChoice = str
      const ids = mapAudience(str)
      if (ids.length) spec.audience = ids.join(',')
      if (k === 'who') spec.who = str
    } else {
      spec[k] = str
    }
  }
  const offer = spec.offer || spec.special || spec.reward || spec.treat || spec.deal
  if (offer) spec.offer = offer
  const feature = spec.subject || spec.menu || spec.headline || spec.dish
  if (feature) spec.feature = feature
  return spec
}

export interface BuilderInput { itemId: string; status: string; vals: Record<string, unknown> }

/** Build a real CampaignDraft from the builder output. */
export function draftFromBuilder({ itemId, vals }: BuilderInput): CampaignDraft {
  const spec = specFromVals(vals)
  const { tpl, occasion, goalKey, ads, heldAds, leadMove, moves, stages } = composePlanForGoal(itemId, spec)

  const composed = composeCampaign(tpl, spec)
  // Targeting drives WHO, not paid spend. An audience reached via paid 'ads' (new-locals,
  // families, date-night) would otherwise inject a paid-ads line just because the owner
  // picked it. Keep paid reach a deliberate choice — only items that opt into ads carry it,
  // and owners add it explicitly via the plan's amplification — so strip an audience-injected
  // ads line (and the matching channel) for items that don't run ads.
  const baseItems = ads ? composed.items : composed.items.filter((it) => it.serviceId !== 'paid-ads')
  const brief = ads ? composed.brief : { ...composed.brief, channelIds: composed.brief.channelIds.filter((c) => c !== 'ads') }
  // A SYSTEM plan (firstvisit): each staged move is a real catalog service that rides as a line item
  // (multi-price services like Nextdoor → a setup line + a monthly line). These ARE the plan, so they
  // lead the item list; a system plan has no content beats, so baseItems is empty.
  const moveLines = (moves ?? []).flatMap((m, i) => { const s = serviceById(m.serviceId); return s ? serviceToLines(s, `li-mv-${i}`) : [] })
  // The lead move (non-system goals) is a real, costed operational service (e.g. GBP setup) the plan
  // LEADS with — it rides as the first line item, ahead of the content, surfaced on top by the flow.
  const leadSvc = leadMove ? serviceById(leadMove.serviceId) : undefined
  const leadLine = leadSvc ? serviceToLine(leadSvc, 'li-lead') : undefined
  const items = moveLines.length ? [...moveLines, ...baseItems] : (leadLine ? [leadLine, ...baseItems] : baseItems)
  const bill = summarize(items)
  const path: BuildPath = 'strategist'  // owner approves, Apnosh builds

  return {
    id: 'new',
    name: composed.name,
    intent: tpl.durationWeeks === null ? 'ongoing' : 'one-off',
    path,
    // Land as a Draft the owner reviews/edits. They explicitly Save (keep as
    // draft) or Approve & ship (hands it to the Apnosh team). The 'review'
    // phase + "Apnosh is building this" banner is for after they ship.
    phase: 'build',
    budgetMonthly: bill.perMonth,
    items,
    planned: true,
    goalKey,
    targetDate: spec.date || undefined,
    occasion,
    context: spec.days || spec.shift || spec.audienceChoice || undefined,
    brief,
    // A leading foundation move held the paid-ads line: the plan flow shows a one-tap "run ads anyway".
    ...(heldAds ? { heldAds: true } : {}),
    // The operational move the plan leads with (the plan flow renders it above the content).
    ...(leadMove && leadLine ? { leadMove: { title: leadMove.title, because: leadMove.because, price: leadLine.price, cadence: leadLine.cadence } } : {}),
    // A staged SYSTEM plan: the moves drive the staged render in the plan flow, ordered by stages.
    ...(moves && moves.length ? { moves } : {}),
    ...(stages && stages.length ? { stages } : {}),
  }
}
