/**
 * whyFor — the personalized "why this, for you" line on the campaign store's product page.
 *
 * Pure + client-safe. Takes the small real-signal bundle from /api/dashboard/why-signals and
 * returns ONE plain sentence for a card, or null when this business has no honest signal for
 * that card's job (the product page then shows the card's authored fallback line instead).
 *
 * HONESTY RULES (load-bearing):
 *  - A sentence may only state a number that came from the signals endpoint for THIS client.
 *  - Missing signal -> null. Never invent, estimate, or zero-fill a number.
 *  - listingGaps phrasing reflects the health check's actual findings, nothing implied.
 *
 * Typed Record over the create-catalog id union: adding a card without deciding its why
 * template is a compile error, not a silent fallback.
 */

import type { CreateCatalogId } from './create-catalog'

/** Real measured signals for one client. Absent field = no data (never zero-filled). */
export interface WhySignals {
  /** Google views (Search + Maps impressions) over the last 30 days. */
  views30d?: number
  /** What people did from the Google listing over the last 30 days. */
  actions30d?: { directions: number; calls: number; websiteClicks: number }
  /** Live star rating from the Places sync (the authoritative source). */
  rating?: number
  ratingCount?: number
  /** Reviews still waiting on a reply (the inbox's definition: no response_text). */
  unrepliedReviews?: number
  /** Plain names of Google-profile fields the listing health check found missing. */
  listingGaps?: string[]
}

const n = (x: number) => x.toLocaleString('en-US')
const joinPlain = (a: string[]) =>
  a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`

/** Sum of listing actions, only when the bundle carried a real measurement. */
const actionsTotal = (s: WhySignals): number | null =>
  s.actions30d ? s.actions30d.directions + s.actions30d.calls + s.actions30d.websiteClicks : null

/** Views line helper: null unless a real 30-day view count exists. */
const views = (s: WhySignals): number | null => (typeof s.views30d === 'number' && s.views30d > 0 ? s.views30d : null)

/** Rating line, only when both the live rating and its count exist. */
const ratingPair = (s: WhySignals): { rating: number; count: number } | null =>
  typeof s.rating === 'number' && s.rating > 0 && typeof s.ratingCount === 'number' && s.ratingCount > 0
    ? { rating: s.rating, count: s.ratingCount }
    : null

/** One "people acted N times" sentence opener shared by the order/event cards. */
const actedLine = (s: WhySignals): string | null => {
  const t = actionsTotal(s)
  return t && t > 0 ? `People called, tapped for directions, or clicked your site ${n(t)} times last month.` : null
}

type WhyFn = (s: WhySignals) => string | null

/* One template per card, matched to that card's actual job:
 * discovery cards read views30d + listingGaps, review cards read rating/count/unreplied,
 * order/event cards read actions30d, retention cards have no honest signal yet -> null. */
const WHY_FOR: Record<CreateCatalogId, WhyFn> = {
  // Discovery
  reach: (s) => { const v = views(s); return v ? `You were seen on Google ${n(v)} times in the last 30 days. Ads reach the nearby people who have not looked yet.` : null },
  firstvisit: (s) => { const v = views(s); return v ? `You were seen on Google ${n(v)} times in the last 30 days. This plan works on turning more of those looks into first visits.` : null },
  gbp: (s) => {
    if (s.listingGaps?.length) return `Your Google listing is missing ${joinPlain(s.listingGaps)}. This fixes it.`
    const v = views(s)
    return v ? `Your listing was seen ${n(v)} times in the last 30 days. A complete profile turns more of those views into visits.` : null
  },
  listings: (s) => { const v = views(s); return v ? `People found you on Google ${n(v)} times last month. Matching info everywhere helps the other apps catch up.` : null },
  localseo: (s) => { const v = views(s); return v ? `You showed up in ${n(v)} searches and map looks last month. This works on growing that number.` : null },
  gpost: (s) => { const v = views(s); return v ? `Your Google listing was seen ${n(v)} times in the last 30 days. A fresh post gives those people something new to see.` : null },
  nextdoor: () => null,
  delivery: () => null,
  website: (s) => {
    const c = s.actions30d?.websiteClicks
    return typeof c === 'number' && c > 0 ? `Google sent ${n(c)} people to your website last month. This makes sure the site does not lose them.` : null
  },
  friction: (s) => { const t = actionsTotal(s); return t && t > 0 ? `Guests took ${n(t)} actions from your Google listing last month. An easier path turns more of them into orders.` : null },

  // Reviews
  reviewsplan: (s) => { const r = ratingPair(s); return r ? `You are at ${r.rating.toFixed(1)} stars from ${n(r.count)} reviews. More fresh reviews lift both numbers.` : null },
  reviewsreply: (s) =>
    typeof s.unrepliedReviews === 'number' && s.unrepliedReviews > 0
      ? `You have ${n(s.unrepliedReviews)} ${s.unrepliedReviews === 1 ? 'review' : 'reviews'} waiting for a reply. This clears them and keeps it that way.`
      : null,

  // Orders / events
  nights: (s) => { const a = actedLine(s); return a ? `${a} This points that interest at your quiet nights.` : null },
  promoevent: (s) => { const a = actedLine(s); return a ? `${a} An event push rides that interest.` : null },
  launch: (s) => { const a = actedLine(s); return a ? `${a} A real launch gives them something new to act on.` : null },
  ticket: (s) => { const a = actedLine(s); return a ? `${a} A ticketed night turns that interest into sold seats.` : null },
  giftcard: (s) => { const a = actedLine(s); return a ? `${a} Gift cards give them one more way to buy.` : null },
  catering: (s) => { const a = actedLine(s); return a ? `${a} A catering push puts bigger orders on that path.` : null },
  slowoffer: () => null,

  // Content / interest (no honest per-card signal yet)
  reel: () => null,
  story: () => null,
  graphic: () => null,
  dish: () => null,
  edit: () => null,
  shoot: () => null,
  creator: () => null,

  // Retention (no honest signal in the bundle yet)
  regulars: () => null,
  welcome: () => null,
  news: () => null,
  birthday: () => null,
  earlyaccess: () => null,
  winback: () => null,
  qr: () => null,
  direct: () => null,
}

/** The personalized why line for a card, or null (-> show the authored fallback). */
export function whyFor(itemId: string, signals: WhySignals | null | undefined): string | null {
  if (!signals) return null
  const fn = (WHY_FOR as Record<string, WhyFn | undefined>)[itemId]
  return fn ? fn(signals) : null
}
