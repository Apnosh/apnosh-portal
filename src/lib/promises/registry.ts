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
const POSTS: PromiseSpec = { metric: 'post_reach', label: 'views per post, where they go', takenBy: 'social', lagDays: 7, windowDays: 14 }
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
  'social-profiles': [{ metric: 'delivered_files', label: 'your five profiles, set up', takenBy: 'apnosh', lagDays: 0, windowDays: 0 }],
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

/**
 * The specs behind the service_id a LEDGER ROW actually stores.
 *
 * A campaign row stores the catalog service ('gbp-setup', 'content-3'); a desk row stores
 * 'request:<type>' (recordRequestPromise writes it that way). specsForService only knows the
 * first shape, so a desk delivery looking up its own promise found nothing and the window never
 * moved. One resolver for both spellings.
 */
export function specsForPromiseService(serviceId: string | null | undefined): PromiseSpec[] {
  if (!serviceId) return []
  if (serviceId.startsWith('request:')) return PROMISE_BY_REQUEST_TYPE[serviceId.slice('request:'.length)] ?? []
  return specsForService(serviceId)
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
  socialprofiles: PROMISE_BY_SERVICE['social-profiles'],
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
  /* The truck's daily post goes to the Google card, so that is where the count is taken. Its
     text-to-your-list leg is held and unbilled, so nothing here counts a text. */
  trucklocation: [GOOGLE_VIEWS],
  /* barnights, seasonplan and cateringengine have NO spec on purpose. Each needs a real
     answer first: which number a bar night moves that we can read, what a season plan even
     promises inside one quarter, and where a catering inquiry lands before anybody can count
     one. Until those are answered the playbook law holds the cards off the shelf, and that
     is the honest state, not an oversight. */
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
  // The desk's own ids for three more types (the shelf calls one of them 'writing').
  copy: [FILES],
  ads: [FILES],
  other: [FILES],
}

export const TAKEN_BY_WORD: Record<TakenBy, string> = {
  google: 'Taken by Google',
  you: 'Taken by you',
  apnosh: 'Taken by Apnosh',
  person: 'Counted by a person',
  site: 'Taken by your website analytics',
  social: 'Taken by the platform it goes out on',
}

/**
 * The count line, IN PIECES so it can be read in Spanish.
 *
 * It used to come back as one glued English string, and that string is drawn on every shelf row
 * and on every product page — so a Spanish owner read a Spanish page with an English promise
 * about money in the middle of it. The pieces are English keys, which is how the rest of the
 * product translates: `key` is the sentence frame with its holes, and every value in `vars` is
 * itself a key the renderer runs through t() before it fills a hole. Nothing is glued here, so
 * a translator can move the parts of the sentence around.
 *
 * Render it with renderPromiseSentence(), never by hand.
 */
export interface PromiseSentence {
  /** the frame, e.g. 'Counted after: {what} · {taken} · shows on Home {when} after you order' */
  key: string
  /** each hole's value, itself an English key to translate before filling */
  vars: Record<string, string>
}

export function promiseSentence(specs: PromiseSpec[]): PromiseSentence | null {
  const s = specs[0]
  if (!s) return null
  if (s.notCountedReason) return { key: 'Not counted yet: {reason}', vars: { reason: s.notCountedReason } }
  if (s.metric === 'delivered_files') {
    return { key: 'Counted after: {what} · marked Done the day they land', vars: { what: s.label } }
  }
  const days = s.lagDays + s.windowDays
  const when = days <= 7 ? 'about a week' : days <= 14 ? 'about two weeks' : days <= 24 ? 'about three weeks' : 'about a month'
  // A Google count only runs once Google is connected; say so before the money, not after.
  const taken = s.takenBy === 'google' ? 'Taken by Google, once your Google profile is connected' : TAKEN_BY_WORD[s.takenBy]
  return {
    key: 'Counted after: {what} · {taken} · shows on Home {when} after you order',
    vars: { what: s.label, taken, when },
  }
}

/**
 * The count line as one string, in this owner's language.
 *
 * `tr` is the screen's own bound translator (`T` from useLang), so this file stays pure and
 * knows nothing about React or which language is on. Every hole is translated FIRST and then
 * filled, so a Spanish frame gets Spanish parts.
 */
export function renderPromiseSentence(
  line: PromiseSentence | null,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!line) return null
  const vars: Record<string, string> = {}
  for (const [hole, key] of Object.entries(line.vars)) vars[hole] = tr(key)
  return tr(line.key, vars)
}

/** The Creatives shelf builds its cards as `creative-<type>` and orders through the desk, so the
 *  product page prints the same promise the desk order will write. */
for (const [type, specs] of Object.entries(PROMISE_BY_REQUEST_TYPE)) PROMISE_BY_CARD[`creative-${type}`] = specs
