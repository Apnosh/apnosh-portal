/**
 * promises/registry — what each order PROMISES to move, in the owner's words.
 *
 * One spec per catalog service (and per desk request type): the metric the count uses, who takes
 * it, how many days after the order the count starts (Google lags; setup takes a week), and how
 * many reported days before Home shows a number. Client-safe (no server imports): the Create
 * product page reads it to print "Counted after …" before the order, and the ship hook reads it to
 * write the ledger row at mint. The two must be the same table or the promise drifts.
 *
 * Honesty rules baked in here:
 *  - a metric the product cannot read is `not_counted` with the card's own reason, never a guess;
 *  - a deliverable (photos, a sign) is `done` when its work order is delivered, never a metric;
 *  - nothing is counted on a channel the piece does not go to.
 */

export type MetricKey =
  | 'gbp_card_taps'      // directions + calls + website clicks on the Google card
  | 'gbp_impressions'    // views of the Google card
  | 'gbp_food_orders'    // orders placed through Google's own ordering
  | 'reviews_replied'    // replies posted
  | 'reviews_new'        // new Google reviews
  | 'rating'             // cumulative Google rating
  | 'post_reach'         // reach of the posts this order published, where they went
  | 'ga_sessions'        // website visits (needs analytics connected)
  | 'delivered_files'    // a deliverable: done when the work order is delivered

export type TakenBy = 'google' | 'you' | 'apnosh' | 'person' | 'site' | 'social'

export interface PromiseSpec {
  metric: MetricKey
  /** 'taps on your Google card' — finishes the sentence "Counted after: …" */
  label: string
  takenBy: TakenBy
  /** days after ordering before the count starts (setup time + source lag) */
  lagDays: number
  /** reported days of counting before Home shows the number */
  windowDays: number
  /** present = the product cannot take this count; the row says so with this reason */
  notCountedReason?: string
}

const GOOGLE_TAPS: PromiseSpec = { metric: 'gbp_card_taps', label: 'taps on your Google card', takenBy: 'google', lagDays: 7, windowDays: 14 }
const GOOGLE_VIEWS: PromiseSpec = { metric: 'gbp_impressions', label: 'views of your Google card', takenBy: 'google', lagDays: 3, windowDays: 14 }
const POSTS: PromiseSpec = { metric: 'post_reach', label: 'views on the posts, where they go', takenBy: 'social', lagDays: 7, windowDays: 14 }
const FILES: PromiseSpec = { metric: 'delivered_files', label: 'the files in your library', takenBy: 'apnosh', lagDays: 0, windowDays: 0 }

/** By the service line the plan composes to (LineItem.serviceId). */
export const PROMISE_BY_SERVICE: Record<string, PromiseSpec[]> = {
  'gbp-setup': [GOOGLE_TAPS],
  'gbp-posts': [GOOGLE_VIEWS],
  'gbp-event-post': [GOOGLE_VIEWS],
  'local-seo': [GOOGLE_VIEWS],
  'google-food-order': [{ metric: 'gbp_food_orders', label: 'orders placed on Google', takenBy: 'google', lagDays: 7, windowDays: 14 }],
  'review-responses': [
    { metric: 'reviews_replied', label: 'replies posted', takenBy: 'google', lagDays: 0, windowDays: 7 },
    { metric: 'rating', label: 'your rating since you started', takenBy: 'google', lagDays: 0, windowDays: 7 },
  ],
  'review-engine': [{ metric: 'reviews_new', label: 'new Google reviews', takenBy: 'google', lagDays: 7, windowDays: 30 }],
  'tracking': [{ metric: 'ga_sessions', label: 'website visits, daily', takenBy: 'site', lagDays: 2, windowDays: 7 }],
  'listings-sync': [{ metric: 'gbp_card_taps', label: 'listings you have confirmed, of fifty', takenBy: 'you', lagDays: 0, windowDays: 0, notCountedReason: 'We cannot read most directories back. Each listing counts when you confirm it.' }],
  'paid-ads': [{ metric: 'gbp_impressions', label: 'ad results', takenBy: 'apnosh', lagDays: 0, windowDays: 0, notCountedReason: 'Ad numbers live in the ad account and are not read into Home yet.' }],
  'delivery-opt': [{ metric: 'gbp_food_orders', label: 'app orders', takenBy: 'you', lagDays: 0, windowDays: 0, notCountedReason: 'The delivery apps give us no way to read your orders.' }],
  'photo-library': [FILES],
  'capture-kit': [FILES],
  'graphic': [FILES],
  'reel-1': [POSTS],
  'video-engine': [POSTS],
  'social-mgmt': [POSTS],
  'fb-event': [POSTS],
  'welcome-seq': [{ metric: 'post_reach', label: 'emails sent', takenBy: 'apnosh', lagDays: 0, windowDays: 0, notCountedReason: 'No text or email sending yet.' }],
  'reminder-send': [{ metric: 'post_reach', label: 'texts sent', takenBy: 'apnosh', lagDays: 0, windowDays: 0, notCountedReason: 'No text or email sending yet.' }],
  'sms-program': [{ metric: 'post_reach', label: 'texts sent', takenBy: 'apnosh', lagDays: 0, windowDays: 0, notCountedReason: 'No text or email sending yet.' }],
  'vip-comms': [{ metric: 'post_reach', label: 'messages sent', takenBy: 'apnosh', lagDays: 0, windowDays: 0, notCountedReason: 'No text or email sending yet.' }],
  'loyalty': [{ metric: 'reviews_new', label: 'repeat visits', takenBy: 'you', lagDays: 0, windowDays: 0, notCountedReason: 'Repeat visits need your register connected.' }],
}

/** Content pieces carry serviceIds prefixed 'content-'; they are posts, counted where they go. */
export function specsForService(serviceId: string | null | undefined): PromiseSpec[] {
  if (!serviceId) return []
  if (serviceId.startsWith('content-')) return [POSTS]
  return PROMISE_BY_SERVICE[serviceId] ?? []
}

/** By the store card the owner tapped (create-catalog id). Used on the product page BEFORE the
 *  order, and as the fallback at mint when no line matched. */
export const PROMISE_BY_CARD: Record<string, PromiseSpec[]> = {
  gbp: [GOOGLE_TAPS],
  friction: PROMISE_BY_SERVICE['google-food-order'],
  reviewsreply: PROMISE_BY_SERVICE['review-responses'],
  reviewsplan: PROMISE_BY_SERVICE['review-engine'],
  listings: PROMISE_BY_SERVICE['listings-sync'],
  measure: PROMISE_BY_SERVICE['tracking'],
  localseo: [GOOGLE_VIEWS],
  gpost: [GOOGLE_VIEWS],
  gbpmgmt: [GOOGLE_VIEWS],
  reach: PROMISE_BY_SERVICE['paid-ads'],
  deliverymenu: PROMISE_BY_SERVICE['delivery-opt'],
  shoot: [FILES],
  design: [FILES],
  graphic: [FILES],
  reel: [POSTS], story: [POSTS], dish: [POSTS], creative: [POSTS], socialmgmt: [POSTS],
  promoevent: [POSTS, GOOGLE_VIEWS],
  launch: [POSTS, GOOGLE_VIEWS],
  catering: [POSTS, GOOGLE_TAPS],
  nights: [POSTS, GOOGLE_TAPS],
  firstvisit: [POSTS, GOOGLE_TAPS],
  regulars: PROMISE_BY_SERVICE['loyalty'],
  emaildeliver: PROMISE_BY_SERVICE['welcome-seq'],
  welcome: PROMISE_BY_SERVICE['welcome-seq'],
  news: PROMISE_BY_SERVICE['welcome-seq'],
  slowoffer: PROMISE_BY_SERVICE['welcome-seq'],
  birthday: PROMISE_BY_SERVICE['welcome-seq'],
  earlyaccess: PROMISE_BY_SERVICE['welcome-seq'],
  winback: PROMISE_BY_SERVICE['welcome-seq'],
  loyalty: PROMISE_BY_SERVICE['loyalty'],
}

/** By the creative desk request type (creative_requests.type). */
export const PROMISE_BY_REQUEST_TYPE: Record<string, PromiseSpec[]> = {
  photos: [FILES],
  graphic: [FILES],
  print: [FILES],
  menu: [FILES],
  logo: [FILES],
  website: [FILES],
  email: [FILES],
  writing: [FILES],
  video: [POSTS],
  social: [POSTS],
}

export const TAKEN_BY_WORD: Record<TakenBy, string> = {
  google: 'Taken by Google',
  you: 'Taken by you',
  apnosh: 'Taken by Apnosh',
  person: 'Counted by a person',
  site: 'Taken by your website analytics',
  social: 'Taken by the platform it goes out on',
}

/** The sentence the product page prints under the price, e.g.
 *  "Counted after: taps on your Google card · Taken by Google · shows on Home about 3 weeks after you order". */
export function promiseSentence(specs: PromiseSpec[]): string | null {
  const s = specs[0]
  if (!s) return null
  if (s.notCountedReason) return `Not counted yet: ${s.notCountedReason}`
  if (s.metric === 'delivered_files') return `Counted after: ${s.label} · marked Done the day they land`
  const days = s.lagDays + s.windowDays
  const when = days <= 7 ? 'about a week' : days <= 14 ? 'about two weeks' : days <= 24 ? 'about three weeks' : 'about a month'
  return `Counted after: ${s.label} · ${TAKEN_BY_WORD[s.takenBy]} · shows on Home ${when} after you order`
}
