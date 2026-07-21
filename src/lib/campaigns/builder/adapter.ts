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

import type { CampaignDraft, BuildPath, LineItem } from '../types'
import { composeCampaign } from '../campaign-composer'
import { summarize } from '../types'
import { composePlanForGoal, mapAudience, ITEM_SHAPE } from './compose-plan'
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

/** The gbp "Who does it" lane, decoded from the doer slot string the builder round-trips.
 *  The single source of the lane→(producer, price, ownerMode) mapping (the jsx renders the same
 *  strings; the adapter decides what they MEAN). Disjoint by construction: only the AI option
 *  carries "apnosh ai", only the self option carries "myself"/"yourself", "apnosh" alone is team. */
export function gbpLaneFromDoer(doer?: string): 'diy' | 'ai' | 'team' {
  const s = (doer ?? '').toLowerCase()
  if (/apnosh ai|with ai\b/.test(s)) return 'ai'
  if (/myself|yourself|by you\b|step by step/.test(s)) return 'diy'
  return 'team'
}

export interface BuilderInput { itemId: string; status: string; vals: Record<string, unknown> }

/** Build a real CampaignDraft from the builder output. */
export function draftFromBuilder({ itemId, vals }: BuilderInput): CampaignDraft {
  const spec = specFromVals(vals)
  const { tpl, occasion, goalKey, ads, heldAds, leadMove, moves, stages, serviceIds } = composePlanForGoal(itemId, spec)

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
  // An item's REAL included services (ItemShape.services, the hollow-card recompose): each is a
  // real catalog service priced as a line item, same rail as system moves — so a setup-titled
  // card ("Polish your Google profile") bills the actual setup work, not a $70 post. They lead
  // the item list because they ARE the substance; any content pieces follow as support.
  // The gbp card's "Who does it" choice (spec.doer, from the madlib / product page). THREE lanes:
  //   'diy'  — "I'll do it myself": owner-run, plain checklist walkthrough
  //   'ai'   — "Do it with Apnosh AI": owner-run, AI drafts each fix (Pro-gated post-ship)
  //   'team' — "Apnosh does it": done-for-you, the team's $365 work order (default)
  // The two owner-run lanes keep the deliverable IN the plan but hand the work to the owner.
  // The marker is PER-LINE (producer 'diy' + price 0 + ownerMode), never campaign-wide, so
  // bundling gbp with billable lines can never de-bill them. Downstream, that marker means:
  // bills $0 (lineTotal), no staff work order at ship (service-work-orders.ts skips producer
  // 'diy'), no payment-method ask, and the shipped campaign asks the owner to run the
  // walkthrough (service-needs.ts) — in the mode ownerMode records. The AI lane's Pro gate is
  // enforced at run time (the fixer + the gbp-draft endpoint re-check the live tier), never here.
  // Card-agnostic, deliberately. This used to read `itemId === 'gbp'` with the zeroing
  // hardcoded to 'gbp-setup', so gbp was the only card that could offer owner-run lanes.
  // Meanwhile planItemMoney (plan-draft.ts) zeroes the base price for ANY item whose doer
  // says diy/ai — it was never gbp-gated. Adding a doer slot to a second card would have
  // billed the owner $0 here while this still marked the line 'team', minting a staff work
  // order: free to them, costed to us. Both halves now key on the same two facts —
  // does this item carry a doer choice, and is the line one of the item's OWN services.
  const lane = spec.doer ? gbpLaneFromDoer(spec.doer) : 'team'
  const ownServiceIds = new Set(ITEM_SHAPE[itemId]?.services ?? [])
  const svcLines = (serviceIds ?? []).flatMap((id, i) => { const s = serviceById(id); return s ? serviceToLines(s, `li-svc-${i}`) : [] })
    .map((li): LineItem => (
      (lane === 'diy' || lane === 'ai') && li.serviceId != null && ownServiceIds.has(li.serviceId)
        ? { ...li, producer: 'diy', price: 0, ownerMode: lane, does: lane === 'ai' ? 'You fix it with Apnosh AI, step by step' : 'You fix it yourself, step by step' }
        : li
    ))
  // The lead move (non-system goals) is a real, costed operational service (e.g. GBP setup) the plan
  // LEADS with — it rides as the first line item, ahead of the content, surfaced on top by the flow.
  const leadSvc = leadMove ? serviceById(leadMove.serviceId) : undefined
  const leadLine = leadSvc ? serviceToLine(leadSvc, 'li-lead') : undefined
  const withServices = svcLines.length ? [...svcLines, ...baseItems] : baseItems
  let items = moveLines.length ? [...moveLines, ...withServices] : (leadLine ? [leadLine, ...withServices] : withServices)
  // "Setup only" (the delivery card): the owner declined the monthly care, so the recurring
  // delivery-opt line opts out — it bills nothing and mints no work, while the one-time fix
  // stays. Carried as the 'setup-only' sentinel in spec.options (not a serviceId, so the
  // service merge above already ignored it). Sim break #9: a one-time fix must never weld a
  // $245/mo subscription on.
  const setupOnly = (spec.options ?? '').split(',').map((s) => s.trim()).includes('setup-only')
  if (setupOnly) {
    items = items.map((it): LineItem => (
      it.serviceId === 'delivery-opt' && it.cadence.kind !== 'one-time'
        ? { ...it, optOut: 'have-it' }
        : it
    ))
  }
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
    sourceCatalogId: itemId,
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
