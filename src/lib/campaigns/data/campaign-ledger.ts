/**
 * THE CAMPAIGN LEDGER — every fact a campaign can consume, with its tier and its consumer.
 *
 * The owner's principle (docs/CAMPAIGN-LEDGER-PLAN.md, 2026-07-29): before any campaign is
 * built, its information is KNOWN from the account, READ from the describe paragraph, ASKED
 * only when this campaign's recipe needs it, or DEFAULTED out loud. The law, borrowed from
 * checkout's vault: a question may not be asked if the answer is already held, and a consumed
 * field may not be silently missing.
 *
 * This module is Phase 1: the single source of truth that makes "do we have everything?" a
 * checkable question. It CLASSIFIES; it does not fetch (the loaders it reads through already
 * exist) and it does not change behavior. Phase 3 drives the question walk from it; Phase 4
 * closes the fields marked "not yet consumed".
 *
 * Owner rules encoded here:
 *   - Defaults are exactly reach='local' and start='asap'. Nothing else may default.
 *   - Offer economics (terms / redemption limit / expiration) may NEVER default, and apply
 *     only when the campaign includes an offer.
 *   - The capacity check applies only when the shape creates a demand spike (offer-driven,
 *     event-anchored, or time-boxed) — the restaurant's capacity, not creator routing.
 *   - The success target is a number on the recipe's own proxy metric, suggested from
 *     comparable past campaigns, confirmed by the owner — never "incremental revenue".
 *
 * Pure module: no React, no fetches, no Date.now.
 */

import { isKnown, type PlanInputs } from './plan-inputs'
import type { MonthlySignals } from './monthly-signals'

export type LedgerTier = 'known' | 'read' | 'asked' | 'defaulted' | 'missing'

export type LedgerKey =
  /* Tier 1 — the account */
  | 'rating' | 'listingHealth' | 'hasList' | 'history' | 'complaints'
  | 'menu' | 'knownFor' | 'standsOut' | 'audience' | 'slowDays' | 'channels'
  /* account fields the current loaders do not carry yet (Phase 4 widening) */
  | 'identity' | 'serviceModel' | 'visitors' | 'specials'
  /* Tier 2/3 — the campaign itself */
  | 'situation' | 'when' | 'until' | 'start' | 'assets' | 'promote'
  | 'reach' | 'shift' | 'avoid' | 'budget' | 'notes'
  /* Owner amendments, 2026-07-29 */
  | 'offerTerms' | 'offerLimit' | 'offerExpiry' | 'successTarget' | 'capacity'

export interface LedgerField {
  key: LedgerKey
  label: string
  tier: LedgerTier
  /** Raw value when held; undefined when missing. */
  value: unknown
  /** What reads this field. 'planned:' prefix = declared consumer not yet built (Phase 4). */
  consumedBy: readonly string[]
  /** This field may never resolve by default (offer economics, by owner rule). */
  neverDefault?: boolean
  /** Conditional fields: present in the ledger only when their predicate holds. */
  appliesWhen?: 'offer' | 'demand-spike'
}

/** The Answers surface the ledger classifies. Structural (not imported from the component) so
 *  this stays a pure data module; plan-setup's Answers satisfies it. */
export interface LedgerAnswers {
  situations?: string[]
  shape?: string
  when?: string
  until?: string
  start?: string
  assets?: string[]
  promote?: string[]
  audience?: string[]
  reach?: string
  shift?: string[]
  avoid?: string[]
  budget?: number
  notes?: string
  described?: string
  readKeys?: string[]
  auto?: { goals?: boolean; promote?: boolean; audience?: boolean }
  offerTerms?: string
  offerLimit?: string
  offerExpiry?: string
  successTarget?: number
  capacity?: string
}

/** The only allowed defaults (owner rule): reach='local', start='asap'. */
export const LEDGER_DEFAULTS = { reach: 'local', start: 'asap' } as const

/**
 * Does this campaign include an offer? Tier-2 detection proper (the model naming the offer)
 * arrives in Phase 2; this local floor catches plain offer language so the conditional fields
 * enter the ledger for briefs that clearly carry one. Cheap, bounded, no AI.
 */
export function offerApplies(a: LedgerAnswers): boolean {
  if (a.offerTerms != null) return true
  const text = (a.described ?? '').toLowerCase()
  return /(% ?off|bogo|b1g1|free (side|drink|dessert|appetizer|item)|discount|happy hour|deal|2-for-1|two for one|half off|half price)/.test(text)
}

/** Does the shape create a demand spike the restaurant must absorb? Offer-driven, event-anchored
 *  (a dated moment), or time-boxed (a run). Awareness-only ongoing campaigns never qualify. */
export function demandSpikeApplies(a: LedgerAnswers): boolean {
  return offerApplies(a) || a.shape === 'date' || a.shape === 'run'
}

const wasRead = (a: LedgerAnswers, key: string) => (a.readKeys ?? []).includes(key)

/**
 * Classify everything. One row per fact; conditional rows appear only when their predicate
 * holds, so "the ledger is complete" means complete FOR THIS CAMPAIGN.
 */
export function ledgerFor(
  inputs: PlanInputs | null,
  signals: MonthlySignals | undefined,
  a: LedgerAnswers,
): LedgerField[] {
  const rows: LedgerField[] = []
  const row = (f: LedgerField) => rows.push(f)

  /* ── Tier 1: the account. Known when the loader holds a value, missing (loudly) when not. ── */
  row({ key: 'rating', label: 'Google rating', tier: signals?.rating != null ? 'known' : 'missing', value: signals?.rating ?? undefined, consumedBy: ['tilt M3 (review work below 4.3)'] })
  row({ key: 'listingHealth', label: 'Google listing health', tier: signals?.listingCompleteness != null ? 'known' : 'missing', value: signals?.listingCompleteness ?? undefined, consumedBy: ['tilt M4 (listing fixes at 70 or under)'] })
  row({ key: 'hasList', label: 'Email and text list', tier: signals?.hasList != null ? 'known' : 'missing', value: signals?.hasList ?? undefined, consumedBy: ['tilt M5 (build vs send)', 'send-rail holds'] })
  row({ key: 'history', label: 'What worked or flopped here', tier: signals ? 'known' : 'missing', value: signals ? { working: signals.workingServiceIds, dropped: signals.droppedServiceIds } : undefined, consumedBy: ['tilt M2 (boost)', 'proven-loser demotion'] })
  row({ key: 'complaints', label: 'Complaint themes', tier: signals ? 'known' : 'missing', value: signals?.complaintThemes, consumedBy: ['tilt M6 (photo repair lane)'] })
  row({ key: 'menu', label: 'Menu and featured dishes', tier: inputs && inputs.menu.length ? 'known' : 'missing', value: inputs?.menu, consumedBy: ['promote options', 'content briefs'] })
  row({ key: 'knownFor', label: 'Known for', tier: inputs && isKnown(inputs.knownFor) ? 'known' : 'missing', value: inputs?.knownFor.value ?? undefined, consumedBy: ['content briefs'] })
  row({ key: 'standsOut', label: 'What makes you different', tier: inputs && isKnown(inputs.standsOut) ? 'known' : 'missing', value: inputs?.standsOut.value ?? undefined, consumedBy: ['content briefs'] })
  row({ key: 'audience', label: 'Who you are for', tier: a.audience?.length ? (wasRead(a, 'audience') ? 'read' : 'asked') : inputs && isKnown(inputs.audience) ? 'known' : 'missing', value: a.audience?.length ? a.audience : inputs?.audience.value ?? undefined, consumedBy: ['content briefs', 'planned: ranking tilt (Phase 4)'] })
  row({ key: 'slowDays', label: 'Your slow days', tier: inputs && isKnown(inputs.slowDays) ? 'known' : 'missing', value: inputs?.slowDays.value ?? undefined, consumedBy: ['shift question pruning'] })
  row({ key: 'channels', label: 'Connected channels', tier: inputs ? 'known' : 'missing', value: inputs?.channels, consumedBy: ['connect recommendations', 'publish rails'] })

  /* Account fields today's loaders do not carry — in the ledger NOW so their absence is a
   * named hole, not an unknown unknown. Phase 4 wires the loaders. */
  row({ key: 'identity', label: 'Name, cuisine, neighborhood', tier: 'missing', value: undefined, consumedBy: ['planned: content briefs, near-me copy (loader widening, Phase 4)'] })
  row({ key: 'serviceModel', label: 'Dine-in or delivery-only', tier: 'missing', value: undefined, consumedBy: ['planned: address-bound exclusions from profile (Phase 4; the reach answer covers it today)'] })
  row({ key: 'visitors', label: 'Website visitors a month', tier: 'missing', value: undefined, consumedBy: ['planned: signal fit (Phase 4)'] })
  row({ key: 'specials', label: 'Current specials', tier: 'missing', value: undefined, consumedBy: ['planned: content briefs (Phase 4)'] })

  /* ── Tiers 2/3: the campaign. READ when provenance says so, ASKED when answered, defaulted
   *    only where the owner allows, missing otherwise. ── */
  row({ key: 'situation', label: 'What this campaign is', tier: a.situations?.length ? (wasRead(a, 'situation') ? 'read' : 'asked') : 'missing', value: a.situations?.[0], consumedBy: ['everything: goal, shape, ladder, questions'] })
  const dated = a.shape === 'date' || a.shape === 'run'
  row({ key: 'when', label: dated ? 'The date' : 'The date (not a dated campaign)', tier: a.when ? (wasRead(a, 'when') ? 'read' : 'asked') : dated ? 'missing' : 'known', value: a.when, consumedBy: ['schedule (works backwards)', 'lead-time gate'] })
  if (a.shape === 'run') row({ key: 'until', label: 'Run end', tier: a.until ? (wasRead(a, 'until') ? 'read' : 'asked') : 'missing', value: a.until, consumedBy: ['run window (team works to it)'] })
  if (!dated) row({ key: 'start', label: 'When it starts', tier: a.start && wasRead(a, 'start') ? 'read' : a.start && a.start !== LEDGER_DEFAULTS.start ? 'asked' : 'defaulted', value: a.start ?? LEDGER_DEFAULTS.start, consumedBy: ['brief.start', 'schedule'] })
  /* Presence, not length: an empty array is "answered with none" — a real answer, not a hole. */
  row({ key: 'assets', label: 'What you bring', tier: a.assets ? (wasRead(a, 'assets') ? 'read' : 'asked') : 'missing', value: a.assets, consumedBy: ['never-billed coverage', 'ranking boost'] })
  row({ key: 'promote', label: 'What to promote', tier: a.promote?.length && wasRead(a, 'promote') ? 'read' : a.promote?.length || a.auto?.promote ? 'asked' : 'missing', value: a.auto?.promote ? 'auto' : a.promote, consumedBy: ['content briefs'] })
  row({ key: 'reach', label: 'How far to reach', tier: a.reach && wasRead(a, 'reach') ? 'read' : a.reach && a.reach !== LEDGER_DEFAULTS.reach ? 'asked' : 'defaulted', value: a.reach ?? LEDGER_DEFAULTS.reach, consumedBy: ['address-bound exclusions'] })
  row({ key: 'shift', label: 'Which shifts', tier: a.shift ? (wasRead(a, 'shift') ? 'read' : 'asked') : 'missing', value: a.shift, consumedBy: ['night work layered on the goal'] })
  row({ key: 'avoid', label: 'Never do', tier: a.avoid ? (wasRead(a, 'avoid') ? 'read' : 'asked') : 'missing', value: a.avoid, consumedBy: ['service exclusions', 'tone constraints'] })
  /* A read budget still classifies 'read' after its confirm tap — the confirmation is the money
   * rule (nothing sizes without the tap), not a change of source. Typing a new number flips the
   * provenance to asked in the screen. */
  row({ key: 'budget', label: 'Budget', tier: a.budget != null ? (wasRead(a, 'budget') ? 'read' : 'asked') : 'missing', value: a.budget, consumedBy: ['plan size (incl. dated launch mode)'] })
  row({ key: 'notes', label: 'Anything else', tier: a.notes != null ? 'asked' : 'missing', value: a.notes, consumedBy: ['the team, verbatim'] })

  /* ── Owner amendments: conditional fields, in the ledger only when they apply. ── */
  if (offerApplies(a)) {
    row({ key: 'offerTerms', label: 'Offer terms', tier: a.offerTerms ? (wasRead(a, 'offerTerms') ? 'read' : 'asked') : 'missing', value: a.offerTerms, consumedBy: ['planned: offer briefs + redemption tracking (Phase 4)'], neverDefault: true, appliesWhen: 'offer' })
    row({ key: 'offerLimit', label: 'Redemption limit', tier: a.offerLimit ? (wasRead(a, 'offerLimit') ? 'read' : 'asked') : 'missing', value: a.offerLimit, consumedBy: ['planned: offer briefs (Phase 4)'], neverDefault: true, appliesWhen: 'offer' })
    row({ key: 'offerExpiry', label: 'Offer expiration', tier: a.offerExpiry ? (wasRead(a, 'offerExpiry') ? 'read' : 'asked') : 'missing', value: a.offerExpiry, consumedBy: ['planned: offer briefs (Phase 4)'], neverDefault: true, appliesWhen: 'offer' })
  }
  row({ key: 'successTarget', label: 'Success target', tier: a.successTarget != null ? 'asked' : 'missing', value: a.successTarget, consumedBy: ['planned: reporting + mid-run pivot flag (Phase 4)'] })
  if (demandSpikeApplies(a)) {
    row({ key: 'capacity', label: 'Capacity if it works', tier: a.capacity?.trim() ? 'asked' : 'missing', value: a.capacity, consumedBy: ['planned: work brief — staffing, prep, quantity, who briefs staff (Phase 4)'], appliesWhen: 'demand-spike' })
  }

  return rows
}

/** The holes: consumed-today fields that are neither held nor legally defaulted. 'planned:'
 *  consumers do not count — a hole is only a hole once something real reads the field. */
export function ledgerHoles(fields: LedgerField[]): LedgerField[] {
  return fields.filter(
    (f) => f.tier === 'missing' && f.consumedBy.some((c) => !c.startsWith('planned:')),
  )
}
