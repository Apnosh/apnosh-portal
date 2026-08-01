/**
 * THE DESIGN PRICING ENGINE — pure functions, no UI (docs/DESIGN-ORDERING spec, Phase A).
 *
 * The ledger laws, applied to a single service:
 *   3. Every price line cites the answer that created it. No un-explained money.
 *   4. Budget-adjacent facts (price, print quantity, rush) are always explicitly confirmed,
 *      never inferred-and-charged. The engine enforces this structurally: a print destination
 *      with no confirmed quantity/printer yields a `needs` entry, never a guessed line, and a
 *      rush line requires BOTH being inside the window AND the client's confirmation.
 *
 * Tier is never asked. Detection from design history is Phase C; the engine takes the tier as
 * input and encodes the ambiguity rule: callers pass `tierAmbiguous` and the engine prices the
 * LOWER tier and flags the order for internal review. Never a silent upcharge.
 *
 * Pure and injected-clock: no Date.now, the caller supplies today.
 */

import { DESTINATIONS, destinationById, isPrint, type DestinationId, type DestinationSpec } from './destinations'
import type { RateCard } from './rate-card'

/** The why-structure every order fact and price line carries (same shape as plan lines). */
export type FactSource = 'known' | 'read' | 'asked' | 'defaulted'

export interface DesignFact<T = unknown> {
  value: T
  source: FactSource
  /** the client's words this was read from, when source is 'read' (the evidence law) */
  citedWords?: string
}

export interface DesignOrderAnswers {
  jobType: DesignFact<'weekly-special' | 'event-promo' | 'new-menu' | 'holiday-hours' | 'hiring' | 'other'>
  destinations: DesignFact<DestinationId[]>
  /** required when any print destination is checked; never guessed (law 4) */
  printQty?: DesignFact<number>
  printer?: DesignFact<'client' | 'us'>
  /** 'own' = client assets cleared the quality gate; 'source' = the photo add-on */
  photos: DesignFact<'own' | 'source'>
  /** from design history (Phase C); the engine never asks for it */
  tier: 1 | 2 | 3
  /** true when history could support a higher tier: price the lower one, flag for review */
  tierAmbiguous?: boolean
  dueDateISO?: DesignFact<string>
  /** injected clock */
  todayISO: string
  /** the client confirmed the tight date is firm (the un-rush nudge was declined) */
  rushConfirmed?: boolean
}

export interface PriceLine {
  id: string
  label: string
  amount: number
  /** the answer that created this line, said to the client. No un-explained money. */
  why: string
  source: FactSource
  citedWords?: string
}

export interface DesignQuote {
  lines: PriceLine[]
  total: number
  /** price-affecting questions still unanswered: shown as questions, never guessed as charges */
  needs: ('printQty' | 'printer')[]
  rush: boolean
  /** ambiguous tier priced LOW and flagged for internal review before work starts */
  flaggedForReview: boolean
  includedRevisions: number
  /** cost the client pays the printer (or we pass through at cost); never our revenue */
  passThroughNote: string | null
}

/** Inside the window it is a rush; outside it can never be (golden 5). */
export function rushApplies(dueDateISO: string | undefined, todayISO: string, windowHours: number): boolean {
  if (!dueDateISO) return false
  const due = Date.parse(dueDateISO + 'T17:00:00')
  const now = Date.parse(todayISO + 'T09:00:00')
  if (!Number.isFinite(due) || !Number.isFinite(now)) return false
  const hours = (due - now) / 3_600_000
  return hours >= 0 && hours <= windowHours
}

const TIER_WHY: Record<1 | 2 | 3, string> = {
  1: 'Adapted from your saved layout.',
  2: 'A custom design on your brand.',
  3: 'A first for your brand. It becomes a template you keep.',
}
const TIER_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Design adaptation',
  2: 'Custom design',
  3: 'Foundational design',
}

export function priceDesignOrder(a: DesignOrderAnswers, rates: RateCard): DesignQuote {
  const lines: PriceLine[] = []
  const needs: DesignQuote['needs'] = []

  /* Ambiguity prices LOW and flags — never a silent upcharge. */
  const tier = a.tierAmbiguous ? (Math.max(1, a.tier - 1) as 1 | 2 | 3) : a.tier
  lines.push({
    id: 'tier', label: TIER_LABEL[tier], amount: rates.tierBase[tier],
    why: TIER_WHY[tier], source: 'known',
  })

  /* Each destination beyond the first is an adaptation, one line per checkbox (law 3). */
  const dests = a.destinations.value.map(destinationById).filter((d): d is DestinationSpec => !!d)
  for (const d of dests.slice(1)) {
    lines.push({
      id: `dest-${d.id}`, label: `${d.label} version`, amount: rates.perDestination,
      why: `You checked ${d.label}.`, source: a.destinations.source, citedWords: a.destinations.citedWords,
    })
  }

  /* Print: quantity and printer are asked, never guessed. Missing means a question, not a charge. */
  const printDests = dests.filter((d) => d.kind === 'print')
  let passThroughNote: string | null = null
  if (printDests.length > 0) {
    if (a.printQty == null) needs.push('printQty')
    if (a.printer == null) needs.push('printer')
    if (a.printer?.value === 'us' && a.printQty != null) {
      const names = printDests.map((d) => d.label.toLowerCase()).join(', ')
      lines.push({
        id: 'print-mgmt', label: 'Print management', amount: rates.printManagement,
        why: `We run the print job: ${names}, ${a.printQty.value} copies.`, source: a.printer.source,
      })
      passThroughNote = 'Printing itself is billed at cost, on top. We show the printer receipt.'
    }
  }

  /* Photos: the client's own are a visible zero; sourcing is a priced add-on they chose knowingly. */
  if (a.photos.value === 'own') {
    lines.push({
      id: 'photos', label: 'Photos', amount: 0,
      why: 'You are using your own.', source: a.photos.source,
    })
  } else {
    lines.push({
      id: 'photos', label: 'Photo sourcing', amount: rates.photoSourcing,
      why: 'Nothing in your library passed the photo check, so we source photos.', source: a.photos.source,
    })
  }

  /* Rush needs the window AND the confirmation. Outside the window it can never fire. */
  const eligible = rushApplies(a.dueDateISO?.value, a.todayISO, rates.rushWindowHours)
  const rush = eligible && a.rushConfirmed === true
  if (rush) {
    const base = lines.reduce((n, l) => n + l.amount, 0)
    lines.push({
      id: 'rush', label: 'Rush', amount: Math.round(base * (rates.rushMultiplier - 1)),
      why: `Due ${a.dueDateISO!.value}, inside the ${rates.rushWindowHours} hour rush window. You confirmed the date is firm.`,
      source: 'asked',
    })
  }

  return {
    lines,
    total: lines.reduce((n, l) => n + l.amount, 0),
    needs,
    rush,
    flaggedForReview: a.tierAmbiguous === true,
    includedRevisions: rates.includedRevisions,
    passThroughNote,
  }
}

/**
 * The production spec the designer receives, derived entirely from the lookup table. The
 * client is never asked spec-language questions; this is where the checkbox becomes bleed
 * and color mode.
 */
export function productionSpecFor(ids: readonly string[]): DestinationSpec[] {
  return ids.map(destinationById).filter((d): d is DestinationSpec => !!d)
}

/** The longest production buffer among the picked destinations gates the delivery date. */
export function productionBufferDays(ids: readonly string[]): number {
  return Math.max(0, ...productionSpecFor(ids).map((d) => d.bufferDays))
}

export { DESTINATIONS, isPrint }
