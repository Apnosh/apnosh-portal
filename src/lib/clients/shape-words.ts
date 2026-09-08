/**
 * shape-words — the funnel's words, bent to the shape of the business.
 *
 * The owner's rule for Home is absolute: the funnel STRUCTURE never changes. Same five stages,
 * same rings, same numbers, same layout, same tokens. What is allowed to change is the WORDS,
 * because today they are all written for a storefront:
 *
 *   Sam runs a truck and reads "walk-in orders from Google". He has no walk-ins.
 *   Ray runs a delivery-only kitchen and reads "came in". Nobody comes in. The food goes out.
 *   Kenji has two shops and reads one "Orders" line with no clue which shop it counts.
 *
 * One map, keyed on ShelfShape, holding ONLY the words that are wrong for that shape. Everything
 * else falls through to today's copy, so a storefront (and a client whose shape was never asked)
 * reads exactly what it read yesterday, character for character. That fall-through is the whole
 * design: a new shape can never blank a line, and a missing shape can never blank a screen.
 *
 * PURE and client-safe on purpose — no database, no server-only import — so the funnel canvas,
 * the Insights page and the Create shelf can all call the same function.
 *
 * These are the ENGLISH words. The Spanish comes from src/lib/i18n, which keys on the English
 * string, so a shape override and a translation compose instead of fighting.
 */

import type { ShelfShape } from './shape'

/** The five funnel stages, by the key the funnel and Insights already share. */
export type StageKey = 'shown' | 'engaged' | 'moved' | 'camein' | 'back'

interface StageOverride {
  /** the stage's name (Awareness, Interest, Actions, Orders, Retention) */
  label?: string
  /** the small line under the name */
  sub?: string
  /** the longer "what this counts" line behind the ⓘ on Insights */
  explain?: string
}

/**
 * ONLY the words that are wrong for a shape. A shape with no entry, and any stage with no
 * entry, keeps today's word.
 *
 * The stage NAMES are the same five for everybody — an owner who moves from one shop to two
 * should not have to relearn the funnel — so what changes here is the line underneath, which is
 * where the storefront assumption actually lives.
 */
/* The `back` stage used to carry per-shape comeback wording ('found you again',
   'ordered again', 'booked you again'). That stage is Reputation now: what people
   say about you reads the same whether you are a truck, a dining room or a
   ghost kitchen, so there is nothing shape-specific left to say and the single
   fallback wins for everyone. */
const SHAPE_WORDS: Partial<Record<ShelfShape, Partial<Record<StageKey, StageOverride>>>> = {
  truck: {
    moved: { sub: 'directions & calls to the truck' },
    camein: { sub: 'orders at the truck from Google', explain: 'Orders you took at the truck, counted from the people Google sent you.' },
  },
  delivery_only: {
    // No dining room, so no walk-in and no foot traffic. Directions are not the move here;
    // a call or a tap on the order button is.
    moved: { sub: 'calls & clicks' },
    camein: { sub: 'delivery orders from Google', explain: 'Delivery orders that started on Google, from your own site or your delivery apps.' },
  },
  two_locations: {
    camein: { sub: 'walk-in orders from Google, this shop' },
  },
  catering: {
    camein: { sub: 'catering orders that started on Google', explain: 'Catering jobs that started with someone finding you on Google.' },
  },
  seasonal: {
    camein: { sub: 'walk-in orders from Google this season' },
  },
}

/** The stage's name for this shape. `fallback` is today's word, and it wins whenever the shape
 *  has nothing to say — which is most of the time. */
export function stageLabelFor(key: StageKey, shape: ShelfShape | null | undefined, fallback: string): string {
  return (shape ? SHAPE_WORDS[shape]?.[key]?.label : undefined) ?? fallback
}

/** The small line under the stage name, for this shape. */
export function stageSubFor(key: StageKey, shape: ShelfShape | null | undefined, fallback: string): string {
  return (shape ? SHAPE_WORDS[shape]?.[key]?.sub : undefined) ?? fallback
}

/** The longer "what this counts" line (Insights, behind the ⓘ), for this shape. */
export function stageExplainFor(key: StageKey, shape: ShelfShape | null | undefined, fallback: string): string {
  return (shape ? SHAPE_WORDS[shape]?.[key]?.explain : undefined) ?? fallback
}

/**
 * The empty-Home line: what filling this funnel will actually show THIS owner. A delivery-only
 * kitchen was being promised "directions", which is the one thing it does not care about.
 */
const EMPTY_LINE: Partial<Record<ShelfShape, string>> = {
  delivery_only: 'Connect your Google Business Profile and this fills with real calls, clicks and reviews. Never made-up numbers.',
  catering: 'Connect your Google Business Profile and this fills with real calls, clicks and reviews. Never made-up numbers.',
}
export const EMPTY_LINE_DEFAULT = 'Connect your Google Business Profile and this fills with real calls, directions and reviews. Never made-up numbers.'

export function emptyLineFor(shape: ShelfShape | null | undefined): string {
  return (shape ? EMPTY_LINE[shape] : undefined) ?? EMPTY_LINE_DEFAULT
}

/** Every English string this map can produce, so the i18n check can prove each one is translated. */
export function allShapeWords(): string[] {
  const out = new Set<string>([EMPTY_LINE_DEFAULT])
  for (const line of Object.values(EMPTY_LINE)) if (line) out.add(line)
  for (const stages of Object.values(SHAPE_WORDS)) {
    for (const o of Object.values(stages ?? {})) {
      if (o?.label) out.add(o.label)
      if (o?.sub) out.add(o.sub)
      if (o?.explain) out.add(o.explain)
    }
  }
  return [...out]
}
