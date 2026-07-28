/**
 * DELIVERY MENUS — what to charge on the apps so an order is worth taking, pure and I/O-free.
 *
 * THE PROBLEM THIS CARD EXISTS FOR. A restaurant copies its dine-in menu onto DoorDash, the app
 * takes 15 to 30 percent of every order, and nobody redoes the arithmetic. On a dish with a normal
 * food cost that is not a thinner margin, it is frequently no margin at all, and the busier delivery
 * gets the worse it goes. The owner feels it as "we are slammed and broke".
 *
 * ── WHAT WE CAN AND CANNOT DO HERE ─────────────────────────────────────────────────────────────
 *
 * We hold no API to any delivery app. We cannot read their live menu and we cannot change a price.
 * So this card never claims to. What it does is the part that actually takes the skill, on data we
 * genuinely have: their own menu and prices, the commission they are paying, and the arithmetic.
 * The owner types the new prices in themselves.
 *
 * That makes it the same honest shape as the get-listed card: an AI GUIDE, not a done-for-you API
 * job, and the team lane is a person working in the client's own dashboard.
 *
 * ── THE ONE THING THIS MODULE REFUSES TO GUESS ─────────────────────────────────────────────────
 *
 * FOOD COST. Margin advice without it is astrology. Where we have it, the recommendation protects
 * real dollar margin; where we do not, the module says so and falls back to protecting the
 * PERCENTAGE, which is the defensible thing to do with a price and a commission rate alone. It
 * never quietly assumes a 30% food cost to make a number appear.
 *
 * CLIENT-SAFE: pure arithmetic and copy. No I/O.
 */

export type AppKey = 'doordash' | 'ubereats' | 'grubhub' | 'other'

export interface DeliveryApp {
  key: AppKey
  label: string
  /** The commission band operators typically see, as a fraction. Bands, not a single number,
   *  because the rate depends on the plan they signed and we have not seen their contract. */
  commission: { min: number; max: number }
  /** What the band depends on, so a rate that does not match theirs is explainable rather than
   *  just wrong. */
  note: string
}

export const APPS: Record<AppKey, DeliveryApp> = {
  doordash: {
    key: 'doordash', label: 'DoorDash',
    commission: { min: 0.15, max: 0.30 },
    note: 'The tier you picked sets this: the cheapest plan takes the least and shows you to the fewest people.',
  },
  ubereats: {
    key: 'ubereats', label: 'Uber Eats',
    commission: { min: 0.15, max: 0.30 },
    note: 'Same idea as DoorDash: a lower rate usually means less visibility in the app.',
  },
  grubhub: {
    key: 'grubhub', label: 'Grubhub',
    commission: { min: 0.15, max: 0.30 },
    note: 'Marketing add-ons stack on top of the base rate, so the real number is often higher than the headline.',
  },
  other: {
    key: 'other', label: 'Another app',
    commission: { min: 0.15, max: 0.30 },
    note: 'Check your last statement: the rate you actually pay is on it, and it is often not the one you remember.',
  },
}

export const APP_KEYS = Object.keys(APPS) as AppKey[]

export interface MenuItem {
  id: string
  name: string
  /** What it costs in the dining room, in dollars. */
  price: number
  /** What the food costs you, in dollars. Absent for most restaurants, and the module is honest
   *  about what that costs the advice. */
  foodCost?: number
}

export type Verdict =
  /** Priced to survive the commission. */
  | 'ok'
  /** Priced too low: the app's cut eats the margin, and a sane markup fixes it. */
  | 'underpriced'
  /** Priced so low that a delivery order plausibly loses money. Only ever said when we know the
   *  food cost, because it is a claim about real dollars. */
  | 'losing'
  /** Even at the most a guest will bear, this one still loses money. The answer is not a price,
   *  it is taking it off the app. Only ever said when we know the food cost. */
  | 'drop'

/**
 * THE CEILING, AND THE THING IT FORCES US TO ADMIT.
 *
 * Fully protecting dollar margin at a 30% commission needs about a 43% markup. That number is
 * arithmetically right and commercially fictional: nobody pays $23 for the $16 bowl. Recommending
 * it would get the item delisted by the guest rather than the app.
 *
 * But capping it and calling everything above the cap "does not belong on delivery" is equally
 * useless, because at 30% that is the entire menu, and "close your delivery channel" is not advice
 * either.
 *
 * So the honest model is the one operators actually live with: mark up as far as guests tolerate,
 * recover most of the cut, and be straight that delivery still earns less per plate than the room.
 * That trade is what the channel IS. The card's job is to make it visible and to find the dishes
 * where even the capped price loses money, because those are the ones to pull.
 */
export const MAX_MARKUP = 0.25

export interface ItemAdvice {
  item: MenuItem
  verdict: Verdict
  /** What to charge on the app instead. Rounded to something a menu can show. */
  suggested: number
  /** What they keep per order today, after commission. Null without a food cost. */
  keepsNow: number | null
  /** What they would keep at the suggested price. Null without a food cost. */
  keepsAfter: number | null
  /** One plain sentence for this row. */
  line: string
}

/** Menu prices end in a way people recognise. 12.37 is a spreadsheet; 12.50 is a menu. */
export function menuRound(n: number): number {
  const half = Math.ceil(n * 2) / 2
  return Math.round(half * 100) / 100
}

/**
 * The recommendation for one item.
 *
 * WITH a food cost, we protect the dollar margin: the app takes its cut of the whole ticket, so the
 * price has to rise by more than the commission to leave the same money behind.
 * WITHOUT one, we protect the percentage, which is all that price and rate alone can support.
 */
export function adviseItem(item: MenuItem, rate: number): ItemAdvice {
  const knowsCost = typeof item.foodCost === 'number' && item.foodCost > 0
  const cost = knowsCost ? item.foodCost! : 0

  // Keep the same dollars after the app's cut: (price × (1 − rate)) − cost = margin today.
  const marginToday = item.price - cost
  const targetGross = knowsCost ? (marginToday + cost) / (1 - rate) : item.price / (1 - rate)
  const ceiling = item.price * (1 + MAX_MARKUP)
  // Never recommend past what a guest will bear, even when the arithmetic asks for more.
  const suggested = menuRound(Math.min(targetGross, ceiling))

  const keepsNow = knowsCost ? round2(item.price * (1 - rate) - cost) : null
  const keepsAfter = knowsCost ? round2(suggested * (1 - rate) - cost) : null

  let verdict: Verdict = 'ok'
  // The test that matters is what happens AFTER the fix, not before: a dish that loses money today
  // but clears at the capped price is a pricing problem, and one that still loses at the ceiling is
  // a menu problem.
  if (knowsCost && keepsAfter !== null && keepsAfter <= 0) verdict = 'drop'
  else if (knowsCost && keepsNow !== null && keepsNow <= 0) verdict = 'losing'
  else if (suggested > item.price + 0.01) verdict = 'underpriced'

  return { item, verdict, suggested, keepsNow, keepsAfter, line: lineFor(item, suggested, verdict, keepsNow, keepsAfter, marginToday, rate) }
}

function lineFor(item: MenuItem, suggested: number, verdict: Verdict, keepsNow: number | null, keepsAfter: number | null, roomMargin: number, rate: number): string {
  const pct = Math.round(rate * 100)
  if (verdict === 'drop') {
    return `Even at ${money(suggested)}, the most we would ask a guest to pay, this still loses money after their ${pct}% cut. Take it off the app.`
  }
  if (verdict === 'losing') {
    return `At ${money(item.price)} you keep ${money(keepsNow ?? 0)} after their ${pct}% cut. At ${money(suggested)} you keep ${money(keepsAfter ?? 0)}.`
  }
  if (verdict === 'underpriced') {
    return keepsAfter !== null
      ? `Charge ${money(suggested)}. You keep ${money(keepsAfter)} instead of ${money(keepsNow ?? 0)}, against ${money(roomMargin)} in the room.`
      : `Charge ${money(suggested)} on the app to cover their ${pct}% cut.`
  }
  return `${money(item.price)} already holds up after their ${pct}% cut.`
}

export interface MenuReport {
  app: DeliveryApp
  rate: number
  knowsFoodCost: boolean
  advice: ItemAdvice[]
  /** How many items need a new price. */
  toFix: number
  /** How many are actively losing money. Always 0 when we do not know food costs, because we will
   *  not say "losing" about a number we inferred. */
  losing: number
  /** How many still lose money at the highest price we would recommend. The ones to pull. */
  drop: number
  headline: string
  /** Named limits of this report, shown to the owner. Never a footnote we hope nobody reads. */
  caveats: string[]
}

export function buildMenuReport(items: MenuItem[], appKey: AppKey, rate: number): MenuReport {
  const app = APPS[appKey] ?? APPS.other
  const advice = items.map((i) => adviseItem(i, rate))
  const knowsFoodCost = items.some((i) => typeof i.foodCost === 'number' && i.foodCost > 0)
  const toFix = advice.filter((a) => a.verdict !== 'ok').length
  const losing = advice.filter((a) => a.verdict === 'losing').length
  const drop = advice.filter((a) => a.verdict === 'drop').length

  const caveats: string[] = []
  if (!knowsFoodCost) {
    caveats.push('We do not have what your food costs you, so these keep your percentage rather than your dollars. Send us your costs and the advice gets sharper.')
  }
  caveats.push('We cannot see or change your app menus. These are the prices to type in yourself.')
  caveats.push('Some apps ask you to keep app prices close to your dining room prices. That is your call to make, and worth knowing before you change them.')

  caveats.push(`We never suggest more than ${Math.round(MAX_MARKUP * 100)}% above your room price, because past that people stop ordering. That means delivery still earns you less per plate than the dining room. That gap is what the app costs you, and it is the trade you are making for their reach.`)

  return { app, rate, knowsFoodCost, advice, toFix, losing, drop, headline: headlineFor(toFix, losing, drop, items.length, app.label), caveats }
}

export function headlineFor(toFix: number, losing: number, drop: number, total: number, appLabel: string): string {
  if (!total) return 'We do not have your menu yet, so there is nothing to price.'
  if (drop > 0) return `${drop} of your dishes should come off ${appLabel} entirely.`
  if (losing > 0) return `${losing} of your dishes lose money on ${appLabel} at today's prices.`
  if (toFix === 0) return `Your ${appLabel} prices already hold up.`
  if (toFix === total) return `Every dish is priced for the room, not for ${appLabel}.`
  return `${toFix} of ${total} dishes need a different price on ${appLabel}.`
}

const round2 = (n: number) => Math.round(n * 100) / 100
export const money = (n: number) => `$${n.toFixed(2)}`
