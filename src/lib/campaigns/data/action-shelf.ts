/**
 * The Actions shelf (owner 2026-09-12): the things that turn a person who is already looking at
 * you into a tap. A call, a directions request, a menu click, an Order or Reserve tap.
 *
 * Sold three ways at once, because the owner asked for all three:
 *   1. BUNDLES, named by the outcome and the how ("Drive actions by setting up Google"), one per
 *      place the tap happens. Each is a list of PARTS.
 *   2. Inside a bundle every part is tickable with its own price, so an owner who already has
 *      the Order button pays for everything but the Order button.
 *   3. Every part is ALSO its own card on the shelf, under a group header, for the owner who
 *      wants exactly one thing.
 *
 * Seven parts already exist as store cards (gbp, friction, direct, website, listings,
 * socialprofiles, gpost) and keep their real price and their real door. The rest are new: they
 * go through the Request Desk's plain lane with the brief written for the owner, and the team
 * replies with the plan. Their prices are the owner's to correct: they are starting numbers,
 * not a signed sheet. Bundles are the sum of their parts less 15%, rounded to $5.
 *
 * Client-safe: pure data and pure functions.
 */
import type { ShelfCard, ShelfKind, ShelfYou } from './shelf'
import { chargedItemPrice } from '../builder/item-prices'
import { PROMISE_BY_CARD, type PromiseSpec } from '@/lib/promises/registry'

export type ActionGroup = 'Google' | 'Your site' | 'Social' | 'Everywhere else' | 'Ads' | 'Answering'
export const ACTION_GROUPS: ActionGroup[] = ['Google', 'Your site', 'Social', 'Everywhere else', 'Ads', 'Answering']

interface Part {
  id: string
  title: string
  group: ActionGroup
  kind: ShelfKind
  you: ShelfYou
  /** starting price, dollars; 0 when the card already exists and carries its own */
  oneTime: number
  perMonth: number
  ready: string
  ch: string[]
  plain: string
  get: string[]
  syn: string
  promise: PromiseSpec[]
}

/* what a part promises to move, in the words the product page prints */
const TAPS: PromiseSpec = { metric: 'gbp_card_taps', label: 'taps on your Google card', takenBy: 'google', lagDays: 7, windowDays: 14 }
const SITE: PromiseSpec = { metric: 'ga_sessions', label: 'visits to your site', takenBy: 'site', lagDays: 3, windowDays: 14 }
const DONE: PromiseSpec = { metric: 'delivered_files', label: 'the work, done and checked', takenBy: 'apnosh', lagDays: 0, windowDays: 0 }
const POSTS: PromiseSpec = { metric: 'post_reach', label: 'views per post, where they go', takenBy: 'social', lagDays: 7, windowDays: 14 }
const NOT_YET = (why: string): PromiseSpec => ({ metric: 'delivered_files', label: 'the work, done', takenBy: 'apnosh', lagDays: 0, windowDays: 0, notCountedReason: why })

/* The parts that are already store cards. Everything about them (price, door, plain words)
   comes from the card; this only says which group and which bundle they sit in. */
export const EXISTING_PARTS: Record<string, ActionGroup> = {
  gbp: 'Google', friction: 'Google', gpost: 'Google',
  website: 'Your site', direct: 'Your site',
  socialprofiles: 'Social',
  listings: 'Everywhere else',
}

const NEW_PARTS: Part[] = [
  /* Google */
  { id: 'gmenu', title: 'Menu on Google', group: 'Google', kind: 'setup', you: 'Nothing', oneTime: 79, perMonth: 0, ready: '4 days', ch: ['Google'],
    plain: 'Your menu on your Google listing: every dish, its price and a photo, so the menu tap has something to show.', get: ['Your full menu typed into Google, with prices', 'A photo on your best sellers', 'The menu link pointed at the right page'], syn: 'menu google prices dishes', promise: [TAPS] },
  { id: 'gattrs', title: 'Google questions answered', group: 'Google', kind: 'setup', you: 'Nothing', oneTime: 49, perMonth: 0, ready: '3 days', ch: ['Google'],
    plain: 'Parking, kids, takeout, gluten free, outdoor seating: the things people ask before they call, answered on the listing, and the filters set so you are not hidden.', get: ['Every attribute set: seating, delivery, reservations, wheelchair', 'The ten most-asked questions answered in your voice', 'Old wrong answers removed'], syn: 'attributes questions faq parking google', promise: [TAPS] },
  { id: 'gfindus', title: 'Find us: pin, photos, parking', group: 'Google', kind: 'setup', you: 'Nothing', oneTime: 39, perMonth: 0, ready: '3 days', ch: ['Google'],
    plain: 'A directions tap should end at your door. We fix the pin, add an entrance photo and a parking note.', get: ['The map pin on your actual door', 'An entrance photo and a street-view check', 'A parking and entrance note on the listing'], syn: 'directions pin map parking entrance', promise: [TAPS] },
  { id: 'gproducts', title: 'Products and services on Google', group: 'Google', kind: 'setup', you: 'Approve', oneTime: 59, perMonth: 0, ready: '4 days', ch: ['Google'],
    plain: 'Catering, private room, gift cards, happy hour, each listed on Google with its own photo and its own link.', get: ['Up to eight products or services listed', 'A photo and a link on each', 'Prices where you want them shown'], syn: 'products services catering gift cards google', promise: [TAPS] },
  { id: 'gpostbtn', title: 'Google posts with a button', group: 'Google', kind: 'program', you: 'Approve', oneTime: 0, perMonth: 59, ready: '1 week', ch: ['Google'],
    plain: 'Four posts a month on your listing, each with one button: Order, Book, Call or Learn more.', get: ['Four posts a month, written and posted', 'Every post carries a button that goes somewhere', 'The taps counted on Insights'], syn: 'google post button order book call monthly', promise: [TAPS] },
  /* Your site */
  { id: 'sitemenu', title: 'A real menu page', group: 'Your site', kind: 'setup', you: 'Approve', oneTime: 129, perMonth: 0, ready: '1 week', ch: ['Your site'],
    plain: 'A menu people can read on a phone and Google can read too. Text and prices, not a PDF or a photo.', get: ['Every dish typed, with prices', 'Sections and photos where they help', 'Google reads it, so "your dish name" searches find you'], syn: 'menu page website pdf text', promise: [SITE] },
  { id: 'sitereserve', title: 'Reservations link or widget', group: 'Your site', kind: 'setup', you: 'Approve', oneTime: 79, perMonth: 0, ready: '4 days', ch: ['Your site', 'Google', 'Instagram'],
    plain: 'Resy, OpenTable, Tock or Google Reserve, set up and put where people look: your site, your listing, your bio.', get: ['Your booking tool connected or a free one set up', 'A Reserve button on the site, Google and Instagram', 'A test booking, end to end'], syn: 'reservations resy opentable book table widget', promise: [TAPS] },
  { id: 'sitecall', title: 'Call and directions on every page', group: 'Your site', kind: 'setup', you: 'Nothing', oneTime: 49, perMonth: 0, ready: '3 days', ch: ['Your site'],
    plain: 'A tap-to-call and a tap-for-directions that stay on screen on a phone, on every page of your site.', get: ['Sticky Call and Directions on mobile', 'Order and Reserve in the same bar if you have them', 'Checked on iPhone and Android'], syn: 'click to call directions button sticky mobile', promise: [SITE] },
  { id: 'sitegift', title: 'Gift cards online', group: 'Your site', kind: 'setup', you: 'Approve', oneTime: 99, perMonth: 0, ready: '1 week', ch: ['Your site', 'Google'],
    plain: 'Gift cards people can buy from your site at midnight, delivered by email, redeemed at the register.', get: ['A gift card page on your site', 'Cards sold through Square or your register', 'A Gift cards link on Google and Instagram'], syn: 'gift card online sell', promise: [SITE] },
  { id: 'sitefix', title: 'Speed and fix-ups', group: 'Your site', kind: 'setup', you: 'Nothing', oneTime: 89, perMonth: 0, ready: '4 days', ch: ['Your site'],
    plain: 'We tap every button and link on your site the way a hungry person would, and fix the ones that are broken, slow or wrong.', get: ['Every link and button tested on a phone', 'Broken ones fixed, dead ones removed', 'Hours, phone and address matching Google'], syn: 'broken links slow site fix hours wrong', promise: [SITE] },
  /* Social */
  { id: 'onelink', title: 'One link for social', group: 'Social', kind: 'setup', you: 'Approve', oneTime: 69, perMonth: 0, ready: '3 days', ch: ['Instagram', 'TikTok', 'Facebook'],
    plain: 'One page with Order, Reserve, Menu, Directions and Call. The link in every bio points here.', get: ['A one-page link on your own domain', 'The five buttons wired and tested', 'Every profile bio pointed at it'], syn: 'link in bio linktree one link', promise: [SITE] },
  { id: 'igbuttons', title: 'Instagram action buttons', group: 'Social', kind: 'setup', you: 'Nothing', oneTime: 39, perMonth: 0, ready: '2 days', ch: ['Instagram', 'Facebook'],
    plain: 'The Order Food, Reserve and Call buttons on your Instagram and Facebook profiles, turned on and pointed at the right place.', get: ['Order, Reserve and Call buttons on both profiles', 'Each one tested from a phone', 'The contact options cleaned up'], syn: 'instagram order food button reserve call profile', promise: [DONE] },
  { id: 'pinned', title: 'Pinned posts: menu, hours, how to order', group: 'Social', kind: 'setup', you: 'Approve', oneTime: 59, perMonth: 0, ready: '4 days', ch: ['Instagram', 'TikTok', 'Facebook'],
    plain: 'Three posts pinned to the top of each profile: the menu, the hours and how to order, so a new visitor gets the answer before they scroll.', get: ['Three designed posts, pinned on each profile', 'Updated when your hours or menu change', 'A highlight for each on Instagram'], syn: 'pinned posts highlights menu hours', promise: [POSTS] },
  { id: 'tapposts', title: 'Tap posts, one a week', group: 'Social', kind: 'program', you: 'Approve', oneTime: 0, perMonth: 119, ready: '1 week', ch: ['Instagram', 'Facebook'],
    plain: 'One post a week whose only job is one tap: Order tonight, Book Friday, Call for a table. Written, designed, posted.', get: ['Four posts a month with one ask each', 'The link or button wired on every one', 'What each one moved, on Insights'], syn: 'weekly post call to action order tonight', promise: [POSTS] },
  { id: 'linksticker', title: 'Stories with a link sticker', group: 'Social', kind: 'program', you: 'Approve', oneTime: 0, perMonth: 79, ready: '1 week', ch: ['Instagram'],
    plain: 'Two stories a week with a link sticker straight to Order or Reserve. The tap is one thumb away.', get: ['Eight stories a month', 'Every one with a link sticker to a real page', 'Taps counted on Insights'], syn: 'story link sticker swipe up', promise: [POSTS] },
  /* Everywhere else */
  { id: 'yelpapple', title: 'Yelp and Apple Maps action links', group: 'Everywhere else', kind: 'setup', you: 'Nothing', oneTime: 49, perMonth: 0, ready: '4 days', ch: ['Yelp', 'Apple Maps'],
    plain: 'The Order, Reserve and Waitlist links on Yelp and Apple Maps, pointed at your own pages instead of nowhere.', get: ['Yelp CTA and Apple Maps actions set', 'Both pointed at your site or booking tool', 'Tested from a phone'], syn: 'yelp apple maps order reserve links', promise: [NOT_YET('Yelp and Apple give us no way to read taps back.')] },
  { id: 'appprofiles', title: 'Delivery app profiles', group: 'Everywhere else', kind: 'setup', you: 'Approve', oneTime: 79, perMonth: 0, ready: '1 week', ch: ['DoorDash', 'Uber Eats', 'Grubhub'],
    plain: 'Your DoorDash, Uber Eats and Grubhub pages with real photos, real descriptions, right hours, and a line that says ordering direct is cheaper.', get: ['Photos and descriptions on every dish', 'Hours and menu matching your site', 'A "save by ordering direct" line where the apps allow it'], syn: 'doordash ubereats grubhub profile photos', promise: [NOT_YET('The delivery apps give us no way to read your orders.')] },
  /* Ads */
  { id: 'callads', title: 'Local ads for calls and directions', group: 'Ads', kind: 'program', you: 'Approve', oneTime: 0, perMonth: 149, ready: '1 week', ch: ['Google', 'Instagram', 'Facebook'],
    plain: 'Small ads to people within a few miles, built for a tap: call, directions, order. Not likes. Ad spend is paid at cost, you set the amount.', get: ['Ads on Google and Meta aimed at calls and directions', 'Tuned every week', 'Ad spend paid at cost (no markup). You set the amount'], syn: 'ads local calls directions paid google meta', promise: [NOT_YET('Ad numbers live in the ad account and are not read into Home yet.')] },
  { id: 'retarget', title: 'Bring back the ones who looked', group: 'Ads', kind: 'program', you: 'Approve', oneTime: 0, perMonth: 99, ready: '1 week', ch: ['Instagram', 'Facebook', 'Google'],
    plain: 'People who opened your site or menu and did not order see one reminder over the next week. Ad spend paid at cost.', get: ['A pixel on your site', 'One reminder ad, refreshed monthly', 'Ad spend paid at cost (no markup). You set the amount'], syn: 'retargeting remarketing pixel reminder ads', promise: [NOT_YET('Ad numbers live in the ad account and are not read into Home yet.')] },
  /* Answering */
  { id: 'missedcall', title: 'Missed-call text back', group: 'Answering', kind: 'program', you: 'Nothing', oneTime: 0, perMonth: 49, ready: '1 week', ch: ['Text'],
    plain: 'Every call you miss gets a text back in seconds: the menu, the order link, and "we will call you back". The tap is not lost.', get: ['A text back within a minute of every missed call', 'Your menu and order link in it', 'A log of who called, for the call back'], syn: 'missed call text back sms', promise: [NOT_YET('No text sending yet.')] },
  { id: 'textorder', title: 'Text to order or reserve', group: 'Answering', kind: 'program', you: 'Nothing', oneTime: 0, perMonth: 39, ready: '1 week', ch: ['Text', 'Print'],
    plain: 'A number people can text "table for 4" or "menu" to and get the link back. On the door, the menu and the receipt.', get: ['A number and the keywords set up', 'Auto replies with the right link', 'A sign for the door and the counter'], syn: 'text keyword sms order reserve', promise: [NOT_YET('No text sending yet.')] },
  { id: 'dmhour', title: 'Messages answered within the hour', group: 'Answering', kind: 'program', you: 'Approve', oneTime: 0, perMonth: 129, ready: '1 week', ch: ['Instagram', 'Facebook', 'Google'],
    plain: 'Instagram DMs, Facebook messages and Google chats answered within the hour, every day, from your menu and your hours. Anything unusual comes to you.', get: ['Every message answered within the hour', 'Answers from your real menu and hours', 'Bookings and complaints passed to you at once'], syn: 'dm messages reply inbox instagram chat', promise: [DONE] },
  { id: 'waitlist', title: 'A waitlist', group: 'Answering', kind: 'setup', you: 'Nothing', oneTime: 59, perMonth: 0, ready: '4 days', ch: ['Your site', 'Google', 'Counter'],
    plain: 'A full room should not send people away. A waitlist they join from a text or a QR, with a text when the table is ready.', get: ['A waitlist tool set up (free tier where it exists)', 'A QR for the door and a Join link on Google', 'Your team shown how to run it in ten minutes'], syn: 'waitlist full table ready text qr', promise: [DONE] },
]

interface Bundle { id: string; title: string; kind: ShelfKind; you: ShelfYou; ready: string; plain: string; parts: string[]; syn: string }
const BUNDLES: Bundle[] = [
  { id: 'b-google', title: 'Drive actions by setting up Google', kind: 'setup', you: 'Nothing', ready: '1 week', parts: ['gbp', 'gmenu', 'friction', 'gattrs', 'gfindus', 'gproducts', 'gpostbtn'], syn: 'google listing setup everything', plain: 'Most calls and directions start on your Google listing. This makes every tap on it work: the listing fixed, the menu on it, the Order and Reserve buttons wired, the questions answered, the pin on your door.' },
  { id: 'b-site', title: 'Drive actions with a site people order from', kind: 'setup', you: 'Approve', ready: '2 weeks', parts: ['website', 'sitemenu', 'direct', 'sitereserve', 'sitecall', 'sitegift', 'sitefix'], syn: 'website setup order online everything', plain: 'The order or the booking happens on your site. This makes it fast on a phone with Order, Reserve, Menu, Call and Directions one thumb away, a real menu page, and nothing broken.' },
  { id: 'b-social', title: 'Drive actions from your social profiles', kind: 'setup', you: 'Approve', ready: '1 week', parts: ['socialprofiles', 'onelink', 'igbuttons', 'pinned'], syn: 'instagram profile link bio setup', plain: 'A profile visit should end somewhere. One link page, the action buttons on, the bios fixed, and the menu, hours and how-to-order pinned to the top.' },
  { id: 'b-everywhere', title: 'Drive actions from Yelp, Apple Maps and the apps', kind: 'setup', you: 'Nothing', ready: '1 week', parts: ['listings', 'yelpapple', 'appprofiles'], syn: 'yelp apple maps doordash listings everywhere', plain: 'Every other place people look you up, carrying the same phone, hours, menu and order link as Google, with the action links pointed at your own pages.' },
  { id: 'b-answer', title: 'Drive actions by never missing a call or message', kind: 'program', you: 'Nothing', ready: '1 week', parts: ['missedcall', 'textorder', 'dmhour', 'waitlist'], syn: 'missed call text dm reply waitlist answering', plain: 'The taps you already get, caught: a text back on every missed call, a number to text, messages answered within the hour, a waitlist for the full nights.' },
  { id: 'b-weekly', title: 'Drive actions with one post a week that asks for a tap', kind: 'program', you: 'Approve', ready: '1 week', parts: ['tapposts', 'linksticker', 'gpostbtn', 'callads'], syn: 'weekly post ads story button monthly', plain: 'Every week, one post, two stories and a Google post that each ask for exactly one tap, plus a small local ad aimed at calls and directions.' },
]

const BUNDLE_OFF = 0.15
const to5 = (n: number) => Math.round(n / 5) * 5
const fmt = (n: number) => `$${n.toLocaleString()}`
export const priceLabel = (oneTime: number, perMonth: number) => oneTime > 0 && perMonth > 0 ? `${fmt(oneTime)} + ${fmt(perMonth)}/mo` : perMonth > 0 ? `${fmt(perMonth)}/mo` : fmt(oneTime)
const cadence = (oneTime: number, perMonth: number) => oneTime > 0 && perMonth > 0 ? 'To start, then monthly' : perMonth > 0 ? 'Monthly' : 'One-time'

/** A part's price in dollars: the card's own charged price for an existing card, the table's for a new one. */
export function partPrice(id: string): { oneTime: number; perMonth: number } {
  const p = NEW_PARTS.find((x) => x.id === id)
  if (p) return { oneTime: p.oneTime, perMonth: p.perMonth }
  const c = chargedItemPrice(id)
  return { oneTime: c?.oneTime ?? 0, perMonth: c?.perMonth ?? 0 }
}

/** What a set of picked parts costs: the plain sum, and the bundle price when every part is in. */
export function bundleTotal(parts: string[], picked: string[]): { oneTime: number; perMonth: number; whole: boolean; wholeOneTime: number; wholePerMonth: number } {
  const sum = (ids: string[]) => ids.reduce((t, id) => { const p = partPrice(id); return { oneTime: t.oneTime + p.oneTime, perMonth: t.perMonth + p.perMonth } }, { oneTime: 0, perMonth: 0 })
  const all = sum(parts)
  const some = sum(picked)
  const whole = parts.every((id) => picked.includes(id))
  return { oneTime: some.oneTime, perMonth: some.perMonth, whole, wholeOneTime: to5(all.oneTime * (1 - BUNDLE_OFF)), wholePerMonth: to5(all.perMonth * (1 - BUNDLE_OFF)) }
}

/** The brief the Request Desk opens with when a part, or a bundle with these parts, is ordered. */
export function actionBrief(title: string, parts: Array<{ title: string; price: string }>): string {
  const lines = parts.map((p) => `- ${p.title} (${p.price})`)
  return `${title}.\n\nWhat I want:\n${lines.join('\n')}\n\nFrom the Create page, Actions shelf.`
}

/** The new cards, keyed by id, built against the cards that already exist (for the parts that are cards). */
export function actionCards(existing: Record<string, ShelfCard>): Record<string, ShelfCard> {
  const out: Record<string, ShelfCard> = {}
  const partOf: Record<string, string> = {}
  for (const b of BUNDLES) for (const id of b.parts) partOf[id] ??= b.id
  for (const p of NEW_PARTS) {
    PROMISE_BY_CARD[p.id] = p.promise
    out[p.id] = {
      id: p.id, title: p.title, sub: '', price: `from ${priceLabel(p.oneTime, p.perMonth)}`, priceN: p.oneTime || p.perMonth, cadence: cadence(p.oneTime, p.perMonth),
      kind: p.kind, goal: 'online', stage: 'Actions', you: p.you, ready: p.ready, channels: p.ch, plain: p.plain, get: p.get, syn: p.syn,
      availability: 'live', handoff: { kind: 'request', type: 'other', what: actionBrief(p.title, [{ title: p.title, price: priceLabel(p.oneTime, p.perMonth) }]) },
      partOf: partOf[p.id], group: p.group,
    }
  }
  for (const b of BUNDLES) {
    PROMISE_BY_CARD[b.id] = [...new Set(b.parts.flatMap((id) => PROMISE_BY_CARD[id] ?? []))].slice(0, 2)
    const t = bundleTotal(b.parts, b.parts)
    const partCards = b.parts.map((id) => out[id] ?? existing[id]).filter((c): c is ShelfCard => !!c)
    out[b.id] = {
      id: b.id, title: b.title, sub: '', price: priceLabel(t.wholeOneTime, t.wholePerMonth), priceN: t.wholeOneTime || t.wholePerMonth, cadence: cadence(t.wholeOneTime, t.wholePerMonth),
      kind: b.kind, goal: 'online', stage: 'Actions', you: b.you, ready: b.ready, channels: [...new Set(partCards.flatMap((c) => c.channels))].slice(0, 5), plain: b.plain,
      get: partCards.map((c) => c.title), syn: b.syn,
      availability: 'live', handoff: { kind: 'request', type: 'other', what: actionBrief(b.title, partCards.map((c) => ({ title: c.title, price: c.price }))) },
      parts: b.parts,
    }
  }
  return out
}

/** Which bundle an existing card belongs to (gbp → b-google), for its "also in" row. */
export function bundleOfExisting(id: string): string | undefined {
  return BUNDLES.find((b) => b.parts.includes(id))?.id
}
