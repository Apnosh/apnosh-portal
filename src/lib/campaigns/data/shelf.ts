/**
 * The Create shelf (owner 2026-09-05, round-4 design built out): the owner-facing facts for every
 * card the store can show, in plain words. Titles, prices, availability and turnaround come from
 * the real modules (create-catalog, item-prices, catalog-availability, service-turnaround); this
 * file adds what a card needs to be browsed by someone who knows nothing about marketing: what
 * kind of thing it is, what you do, where it shows up, and what you get.
 *
 * Client-safe: pure data and pure functions.
 */
import { CREATE_CATALOG } from './create-catalog'
import { priceLabel, ITEM_PRICES } from '../builder/item-prices'
import { availabilityFor, type CardAvailability } from './catalog-availability'
import { etaLabelFor } from './service-turnaround'
import { REQUEST_TYPES } from '@/lib/requests/catalog'

export type ShelfGoal = 'foryou' | 'announce' | 'event' | 'deal' | 'nights' | 'newfaces' | 'regulars' | 'reviews' | 'online' | 'catering' | 'brand'
export type ShelfKind = 'quick' | 'campaign' | 'setup' | 'program'
export type ShelfYou = 'Nothing' | 'Approve' | 'Show up'
export type ShelfStage = 'Awareness' | 'Interest' | 'Actions' | 'Orders' | 'Retention'

export interface ShelfCard {
  id: string
  title: string
  sub: string
  /** the price line ("$655", "$190 + $45/mo", "Quote") */
  price: string
  /** a number for filters and sorting; the first one-time or monthly figure */
  priceN: number
  cadence: string
  kind: ShelfKind
  goal: Exclude<ShelfGoal, 'foryou'>
  stage: ShelfStage
  you: ShelfYou
  ready: string
  channels: string[]
  plain: string
  get: string[]
  /** words owners actually type ("flyer", "tiktok", "coupons") */
  syn: string
  availability: CardAvailability
  /** the store's own sale id for the hand-off; creative-* cards open the Request Desk */
  handoff: { kind: 'build'; id: string } | { kind: 'request'; type: string } | { kind: 'design' }
}

export const GOALS: { id: ShelfGoal; label: string; short: string }[] = [
  { id: 'foryou', label: 'For you', short: 'For you' },
  { id: 'announce', label: 'Announce something new', short: 'Announce' },
  { id: 'event', label: 'Promote an event', short: 'Event' },
  { id: 'deal', label: 'Run a deal', short: 'Deal' },
  { id: 'nights', label: 'Fill slow nights', short: 'Slow nights' },
  { id: 'newfaces', label: 'More new faces', short: 'New faces' },
  { id: 'regulars', label: 'Bring regulars back', short: 'Regulars' },
  { id: 'reviews', label: 'More reviews', short: 'Reviews' },
  { id: 'online', label: 'More online orders', short: 'Online orders' },
  { id: 'catering', label: 'Grow catering', short: 'Catering' },
  { id: 'brand', label: 'Get our name out', short: 'Our name' },
]

/* what each goal tab shows, best first */
export const GOAL_CARDS: Record<Exclude<ShelfGoal, 'foryou'>, string[]> = {
  announce: ['launch', 'dish', 'gpost', 'story', 'creative-graphic', 'creative-social', 'creator', 'earlyaccess'],
  event: ['promoevent', 'ticket', 'creative-graphic', 'story', 'creative-print', 'creator'],
  deal: ['launch', 'slowoffer', 'giftcard', 'winback', 'gpost', 'creative-graphic'],
  nights: ['nights', 'slowoffer', 'promoevent', 'ticket', 'winback', 'story'],
  newfaces: ['firstvisit', 'gbp', 'localseo', 'listings', 'reach', 'gpost', 'creator', 'measure'],
  regulars: ['regulars', 'winback', 'birthday', 'news', 'welcome', 'earlyaccess', 'loyalty', 'emaildeliver'],
  reviews: ['reviewsplan', 'reviewsreply', 'gbp'],
  online: ['friction', 'direct', 'deliverymenu', 'website', 'pos'],
  catering: ['catering', 'creative-print', 'creative-photos', 'creative-email', 'ticket'],
  brand: ['socialprofiles', 'shoot', 'reel', 'creative-logo', 'creative-video', 'creative-photos', 'socialmgmt', 'gbpmgmt'],
}

/* the hand-written facts. kind · goal · stage · you · ready (null = from turnaround) · channels · plain · get · syn */
type F = { k: ShelfKind; g: Exclude<ShelfGoal, 'foryou'>; st: ShelfStage; you: ShelfYou; ch: string[]; plain: string; get?: string[]; syn: string; ready?: string; sub?: string }
const FACTS: Record<string, F> = {
  story: { k: 'quick', g: 'announce', st: 'Interest', you: 'Approve', ch: ['Instagram'], plain: 'One vertical story on your Instagram, made from your photos or ours, up for 24 hours.', syn: 'instagram post reel quick', ready: '2 days' },
  gpost: { k: 'quick', g: 'newfaces', st: 'Awareness', you: 'Approve', ch: ['Google'], plain: 'A post on your Google listing, the panel people see when they search your name or "pho near me".', syn: 'google maps listing update', ready: '2 days' },
  graphic: { k: 'quick', g: 'announce', st: 'Interest', you: 'Approve', ch: ['Instagram', 'Facebook'], plain: 'One designed post: a graphic, a carousel, or a photo with words on it. Ready to post.', syn: 'flyer design post image', ready: '3 days' },
  design: { k: 'quick', g: 'announce', st: 'Interest', you: 'Approve', ch: ['Print', 'Social'], plain: 'A flyer, poster, banner, or gift card, designed on your brand. You get the file.', get: ['One design, two rounds of changes', 'The file, sized for print and for social', 'Made on your colours and logo'], syn: 'flyer poster banner gift card print design', ready: '3 days' },
  reel: { k: 'quick', g: 'brand', st: 'Interest', you: 'Approve', ch: ['Instagram', 'TikTok'], plain: 'A short vertical video of your food, cut and captioned, posted to Instagram and TikTok.', syn: 'video tiktok reel short', ready: '5 days' },
  dish: { k: 'quick', g: 'announce', st: 'Interest', you: 'Approve', ch: ['Instagram', 'Google'], plain: 'One dish, shot and styled, then a post and a Google update built around it.', get: ['A styled photo of the dish', 'A post with a caption', 'A Google update the same week'], syn: 'photo plate menu item special', ready: '5 days' },
  edit: { k: 'quick', g: 'brand', st: 'Interest', you: 'Approve', ch: ['Instagram', 'TikTok'], plain: 'Send us your clips and photos. We cut, colour and caption them so they look made.', syn: 'video edit footage clips', ready: '4 days' },
  earlyaccess: { k: 'quick', g: 'regulars', st: 'Retention', you: 'Approve', ch: ['Email', 'Text'], plain: 'Your list hears first: a new dish, a night, a deal, two days before anyone else.', syn: 'email text list regulars first', ready: '2 days' },
  slowoffer: { k: 'quick', g: 'nights', st: 'Orders', you: 'Approve', ch: ['Email', 'Text'], plain: 'An offer for your quiet days, sent by email and text to the people who already like you.', syn: 'coupon deal email text tuesday quiet', ready: '3 days' },
  winback: { k: 'quick', g: 'regulars', st: 'Retention', you: 'Nothing', ch: ['Email', 'Text'], plain: 'One email and one text to guests you have not seen in a while, with a reason to come back.', syn: 'email text lapsed guests come back', ready: '3 days' },
  promoevent: { k: 'campaign', g: 'event', st: 'Orders', you: 'Approve', ch: ['Instagram', 'Email', 'Google', 'Print'], plain: 'A night, a holiday, a tasting: a flyer, three posts, two stories and an email, timed to fill the room.', get: ['A flyer for the door and the feed', 'Three posts and two stories', 'One email to your list', 'A Google post the week of'], syn: 'party night halloween holiday tasting flyer', ready: '1 week' },
  launch: { k: 'campaign', g: 'announce', st: 'Awareness', you: 'Approve', ch: ['Instagram', 'Google', 'Email'], plain: 'A new menu, a seasonal special, a limited run: photos, posts and a Google update rolled out over two weeks.', get: ['A photo of the thing', 'Posts across the launch', 'A Google update and an email'], syn: 'new menu special seasonal limited launch', ready: '1 week' },
  ticket: { k: 'campaign', g: 'event', st: 'Orders', you: 'Show up', ch: ['Instagram', 'Email', 'Ticket page'], plain: 'A dinner, a class, a buffet night with a ticket: a sales page, posts and an email, and we track every seat sold.', get: ['A ticket page that takes payment', 'Posts and an email to sell it', 'A count of seats sold, live'], syn: 'tickets dinner class buffet seats sell', ready: '1 week' },
  creator: { k: 'campaign', g: 'newfaces', st: 'Awareness', you: 'Show up', ch: ['Instagram', 'TikTok'], plain: 'A local food creator visits, eats, and posts to people who live near you.', get: ['A creator matched to your food and neighbourhood', 'Their visit, hosted by you', 'Their post, and the numbers after'], syn: 'influencer tiktok instagram visit', ready: '2 weeks' },
  catering: { k: 'campaign', g: 'catering', st: 'Orders', you: 'Approve', ch: ['Instagram', 'Google', 'Email'], plain: 'One styled photo and one post that tell offices and families you do groups, plus a Google update.', get: ['A styled photo of a spread', 'A post and a Google update', 'An email to your list'], syn: 'office party group orders trays', ready: '1 week' },
  reviewsplan: { k: 'campaign', g: 'reviews', st: 'Interest', you: 'Nothing', ch: ['Google', 'Text'], plain: 'A way to ask happy guests for a review, set up once, plus the first asks sent for you.', get: ['A review link and a card for the counter', 'The first asks sent by text', 'The rating and count on your Report'], syn: 'stars rating google yelp ask', ready: '1 week' },
  giftcard: { k: 'campaign', g: 'deal', st: 'Orders', you: 'Approve', ch: ['Instagram', 'Email', 'Google'], plain: 'Gift cards, pushed for the holidays or a slow season: a post, an email and a Google update.', syn: 'gift card holiday christmas', ready: '1 week' },
  shoot: { k: 'campaign', g: 'brand', st: 'Interest', you: 'Show up', ch: ['Your photo library'], plain: 'A pro comes to you for a half day. You get forty photos and a reel, yours to keep and use for a year.', get: ['A half-day shoot at your place', 'Forty edited photos', 'One reel'], syn: 'photographer photos video camera', ready: '2 weeks' },
  gbp: { k: 'setup', g: 'newfaces', st: 'Awareness', you: 'Nothing', ch: ['Google'], plain: 'We fix your Google listing top to bottom: photos, hours, menu, categories, the details searchers see first.', get: ['Every field checked and fixed', 'New photos in the right spots', 'A before and after you can see'], syn: 'google maps listing hours photos', ready: '1 week' },
  listings: { k: 'setup', g: 'newfaces', st: 'Awareness', you: 'Nothing', ch: ['Yelp', 'Apple Maps', 'Bing', '+ more'], plain: 'Yelp, Apple Maps and the rest, all showing the same hours, phone and menu as Google, and kept that way.', syn: 'yelp apple maps directories', ready: '1 week' },
  socialprofiles: { k: 'setup', g: 'brand', st: 'Awareness', you: 'Nothing', ch: ['Instagram', 'Facebook', 'TikTok', '+ more'], plain: 'Five social profiles, complete and matching: bio, link, hours, photo, so people who look find the same place.', syn: 'instagram facebook tiktok bio profile', ready: '1 week' },
  measure: { k: 'setup', g: 'newfaces', st: 'Awareness', you: 'Nothing', ch: ['Google'], plain: 'We hook up Google Analytics and Search Console so you can see where people come from and what they do.', get: ['Both tools connected and checked', 'Numbers flowing into Insights', 'A daily check that they keep flowing'], syn: 'analytics search console tracking data', ready: '1 week' },
  emaildeliver: { k: 'setup', g: 'regulars', st: 'Retention', you: 'Nothing', ch: ['Email'], plain: 'Before you send anything, we make sure your emails land in the inbox, not spam.', syn: 'email spam inbox dns', ready: '1 week' },
  deliverymenu: { k: 'setup', g: 'online', st: 'Orders', you: 'Approve', ch: ['DoorDash', 'Uber Eats', 'Grubhub'], plain: 'We price your delivery menu so the apps stop eating your margin on every order.', syn: 'doordash ubereats grubhub prices margin', ready: '1 week' },
  friction: { k: 'setup', g: 'online', st: 'Actions', you: 'Nothing', ch: ['Google'], plain: 'The Order and Reserve buttons on your Google listing, pointed at the right place and working.', syn: 'order button google reserve', ready: '1 week' },
  direct: { k: 'setup', g: 'online', st: 'Actions', you: 'Approve', ch: ['Your site', 'Email', 'Text'], plain: 'Move regulars from the apps to ordering direct: a link, a nudge, and a reason.', syn: 'delivery apps direct orders website', ready: '1 week' },
  website: { k: 'setup', g: 'online', st: 'Awareness', you: 'Approve', ch: ['Your site'], plain: 'Your website and menu made fast, correct and easy to order from.', syn: 'website menu online site', ready: '2 weeks' },
  localseo: { k: 'program', g: 'newfaces', st: 'Awareness', you: 'Nothing', ch: ['Google'], plain: 'Month after month, we work on showing up when neighbours search "food near me".', syn: 'seo search near me ranking', ready: '1 week' },
  pos: { k: 'setup', g: 'online', st: 'Actions', you: 'Nothing', ch: ['Square', 'Clover'], plain: 'Connect your register so real orders show on Home instead of a guess.', syn: 'square clover register pos', ready: '1 week' },
  welcome: { k: 'setup', g: 'regulars', st: 'Retention', you: 'Nothing', ch: ['Email'], plain: 'Every new signup gets a hello and a reason to come back, automatically.', syn: 'email welcome signup automatic', ready: '1 week' },
  birthday: { k: 'setup', g: 'regulars', st: 'Retention', you: 'Nothing', ch: ['Email', 'Text'], plain: 'Set up once. Every guest gets a birthday treat, automatically, every year.', syn: 'birthday treat email text automatic', ready: '1 week' },
  news: { k: 'program', g: 'regulars', st: 'Retention', you: 'Approve', ch: ['Email'], plain: 'One good email a month, written and sent for you.', syn: 'newsletter email monthly', ready: '1 week' },
  loyalty: { k: 'program', g: 'regulars', st: 'Retention', you: 'Nothing', ch: ['Text', 'Counter'], plain: 'A simple points or stamps program, set up and run for you.', syn: 'loyalty points stamps rewards', ready: '2 weeks' },
  nights: { k: 'program', g: 'nights', st: 'Orders', you: 'Approve', ch: ['Email', 'Text', 'Instagram'], plain: 'We plan it, make it and run it, month after month: an offer for your quiet days, two posts and two stories a week, a win-back to guests who went quiet, and a read of what moved.', get: ['An offer on your quiet days, by email and text', 'Two posts and two stories a week', 'A win-back to guests who went quiet', 'A monthly read of what moved, on Insights'], syn: 'slow nights tuesday quiet program monthly', ready: '1 week' },
  firstvisit: { k: 'program', g: 'newfaces', st: 'Awareness', you: 'Approve', ch: ['Google', 'Instagram', 'Ads'], plain: 'Give new people a reason to come in, run end to end: your listing, local ads, a creator visit, and posts, month after month.', get: ['Your Google listing polished and kept active', 'Local ads, run and tuned', 'Posts every week', 'A monthly read of new faces on Insights'], syn: 'new customers first visit program monthly', ready: '1 week' },
  regulars: { k: 'program', g: 'regulars', st: 'Retention', you: 'Approve', ch: ['Email', 'Text'], plain: 'Win the second visit: a welcome, a birthday treat, a monthly email and a win-back, all run for you.', get: ['A welcome and a birthday treat, automatic', 'A monthly email', 'A win-back when someone goes quiet', 'A read of repeat visits on Insights'], syn: 'regulars repeat second visit program', ready: '1 week' },
  reach: { k: 'program', g: 'newfaces', st: 'Awareness', you: 'Nothing', ch: ['Instagram', 'Facebook', 'Google'], plain: 'Ads to people near you, run and tuned for you, plus a reel and a post to start.', syn: 'ads paid boost facebook instagram', ready: '1 week' },
  reviewsreply: { k: 'program', g: 'reviews', st: 'Interest', you: 'Approve', ch: ['Google'], plain: 'Every review gets a drafted reply, worst first, for you to approve. Monthly.', syn: 'reply reviews respond google', ready: '3 days' },
  socialmgmt: { k: 'program', g: 'brand', st: 'Awareness', you: 'Approve', ch: ['Instagram', 'Facebook', 'TikTok'], plain: 'Your social, run for you: posts, stories and replies every week.', syn: 'social media manager posts weekly', ready: '1 week' },
  gbpmgmt: { k: 'program', g: 'newfaces', st: 'Awareness', you: 'Nothing', ch: ['Google'], plain: 'Your Google listing kept active: a post a week, new photos, questions answered.', syn: 'google listing weekly posts', ready: '1 week' },
}
const CREATIVE_FACTS: Record<string, { g: Exclude<ShelfGoal, 'foryou'>; ch: string[]; syn: string; plain: string }> = {
  graphic: { g: 'announce', ch: ['Print', 'Social'], syn: 'flyer poster promo image design', plain: 'A flyer, a poster, a promo image, any one-off design. Tell us what it is for and we quote it.' },
  menu: { g: 'announce', ch: ['Print', 'Your site'], syn: 'menu design print', plain: 'A new menu, or changes to the one you have, designed to read well and print clean.' },
  logo: { g: 'brand', ch: ['Everywhere'], syn: 'logo brand identity', plain: 'A new logo, a refresh, or a full brand look.' },
  website: { g: 'online', ch: ['Your site'], syn: 'website redesign site', plain: 'A new site, a redesign, or changes to yours.' },
  video: { g: 'brand', ch: ['Instagram', 'TikTok'], syn: 'video reel tiktok', plain: 'Reels and TikToks that show your food moving.' },
  photos: { g: 'brand', ch: ['Your photo library'], syn: 'photo shoot photographer', plain: 'Real photos of your food, your space, your people.' },
  social: { g: 'brand', ch: ['Instagram', 'Facebook', 'TikTok'], syn: 'posts captions batch content', plain: 'A batch of ready-to-post content with captions.' },
  email: { g: 'regulars', ch: ['Email'], syn: 'email newsletter design', plain: 'A designed email to send your customers.' },
  ads: { g: 'newfaces', ch: ['Instagram', 'Facebook', 'Google'], syn: 'ad creative paid', plain: 'The images and words for paid ads.' },
  print: { g: 'event', ch: ['Print'], syn: 'banner decal table tent sign print', plain: 'Banners, window decals, table tents, cards, signs.' },
  copy: { g: 'announce', ch: ['Everywhere'], syn: 'words writing menu descriptions story', plain: 'Menu descriptions, your story, announcements, written for you.' },
  other: { g: 'brand', ch: ['Anything'], syn: 'anything else custom', plain: 'Anything marketing you need that is not listed. Tell us and we quote it.' },
}

function priceNumber(id: string): number {
  const p = (ITEM_PRICES as Record<string, { oneTime?: number; perMonth?: number } | undefined>)[id]
  if (!p) return 0
  return Math.round(p.oneTime ?? 0) || Math.round(p.perMonth ?? 0) || 0
}

const DEFAULT_GET = ['A plan you approve before anything starts', 'Made by your Apnosh team, on your brand', 'Results on your Home and Insights']

function build(): Record<string, ShelfCard> {
  const out: Record<string, ShelfCard> = {}
  for (const c of CREATE_CATALOG) {
    const f = FACTS[c.id]
    if (!f) continue
    const avail = availabilityFor(c.id)
    if (avail === 'hidden') continue
    const label = priceLabel(c.id)
    out[c.id] = {
      id: c.id, title: c.title, sub: f.sub ?? '', price: label ?? 'Quote', priceN: priceNumber(c.id), cadence: label?.includes('/mo') ? (label.includes('+') ? 'To start, then monthly' : 'Monthly') : 'One-time',
      kind: f.k, goal: f.g, stage: f.st, you: f.you, ready: f.ready ?? etaLabelFor(c.id).replace(/^~/, ''), channels: f.ch, plain: f.plain, get: f.get ?? DEFAULT_GET, syn: f.syn,
      availability: avail, handoff: c.id === 'design' ? { kind: 'design' } : { kind: 'build', id: c.id },
    }
  }
  for (const t of REQUEST_TYPES) {
    const id = `creative-${t.id}`
    const cf = CREATIVE_FACTS[t.id] ?? CREATIVE_FACTS.other
    const avail = availabilityFor(id)
    if (avail === 'hidden') continue
    out[id] = {
      id, title: t.label, sub: (t as { blurb?: string }).blurb ?? '', price: 'Quote', priceN: 0, cadence: 'One-time',
      kind: 'quick', goal: cf.g, stage: 'Interest', you: 'Approve', ready: '2 days to a quote', channels: cf.ch, plain: cf.plain, get: ['A quote in two days, no charge to ask', 'Made by a designer or creator we know', 'Two rounds of changes'], syn: cf.syn,
      availability: avail, handoff: { kind: 'request', type: t.id },
    }
  }
  return out
}

let _cards: Record<string, ShelfCard> | null = null
export function shelfCards(): Record<string, ShelfCard> { if (!_cards) _cards = build(); return _cards }
export function shelfCard(id: string): ShelfCard | undefined { return shelfCards()[id] }
export const isBuyable = (c: ShelfCard) => c.availability === 'live'

/* the browse sections */
export const QUICK_IDS = ['design', 'creative-graphic', 'creative-social', 'creative-video', 'creative-photos', 'creative-copy', 'story', 'gpost', 'dish', 'reel']
export const SEASON_IDS = ['promoevent', 'launch', 'catering', 'ticket', 'giftcard', 'creator']
export const PROGRAM_IDS = ['nights', 'firstvisit', 'regulars', 'reach']
export const SETUP_IDS = ['gbp', 'listings', 'measure', 'socialprofiles', 'friction', 'deliverymenu', 'emaildeliver']

/* plain-word search: title, sub, channels and the synonym list; a trailing s is forgiven */
export function searchCards(q: string): ShelfCard[] {
  const s = q.trim().toLowerCase()
  const all = Object.values(shelfCards())
  if (!s) return all
  const forms = Array.from(new Set([s, s.replace(/s$/, ''), s.replace(/es$/, '')])).filter(Boolean)
  return all.filter((c) => forms.some((w) => `${c.title} ${c.sub} ${c.syn} ${c.channels.join(' ')}`.toLowerCase().includes(w)))
}
/** which typed word matched, when the title itself did not (so the row can say "matches: flyer") */
export function matchWord(c: ShelfCard, q: string): string | null {
  const s = q.trim().toLowerCase(); if (!s) return null
  const forms = [s, s.replace(/s$/, '')]
  if (forms.some((w) => `${c.title} ${c.sub}`.toLowerCase().includes(w))) return null
  return c.syn.split(' ').find((x) => forms.some((w) => x.includes(w))) ?? c.channels.find((x) => forms.some((w) => x.toLowerCase().includes(w))) ?? null
}

export type FilterKey = 'budget' | 'you' | 'speed' | 'kind'
export const FILTERS: Record<FilterKey, { label: string; opts: [string, string, string][]; test: (c: ShelfCard, v: string) => boolean }> = {
  budget: { label: 'Price', opts: [['any', 'Any price', ''], ['u100', 'Under $100', 'Quick things'], ['u300', '$100 to $300', 'Most campaigns'], ['o300', '$300 and up', 'Bigger pushes and setups']], test: (c, v) => v === 'any' || (v === 'u100' ? c.priceN < 100 : v === 'u300' ? c.priceN >= 100 && c.priceN <= 300 : c.priceN > 300) },
  you: { label: 'You do', opts: [['any', 'Anything', ''], ['Nothing', 'Nothing', 'We handle it end to end'], ['Approve', 'Approve', 'One tap on a proof'], ['Show up', 'Show up', 'You are there on the day']], test: (c, v) => v === 'any' || c.you === v },
  speed: { label: 'Ready in', opts: [['any', 'Any time', ''], ['week', 'This week', 'Five days or less'], ['month', 'This month', '']], test: (c, v) => v === 'any' || (v === 'week' ? /^[1-5] days/.test(c.ready) : true) },
  kind: { label: 'Type', opts: [['any', 'Any type', ''], ['quick', 'Quick ask', 'One thing, days'], ['campaign', 'Campaign', 'A few pieces, weeks'], ['setup', 'Setup', 'Done once'], ['program', 'We run it', 'Month after month']], test: (c, v) => v === 'any' || c.kind === v },
}

/* Guide me: three questions → a starter shelf */
export const GUIDE_QS: { q: string; s: string; opts: [string, string, string][] }[] = [
  { q: 'What hurts most right now?', s: 'Pick the one you feel.', opts: [['found', 'Not enough people find us', 'Hard to see on Google and the map'], ['tempt', 'They find us, then pick somewhere else', 'People look, and do not come'], ['back', 'They come once and never again', 'Plenty of first visits, few second ones'], ['slow', 'Some nights are dead', 'Other nights are fine']] },
  { q: 'How hands-on do you want to be?', s: 'Be honest. It changes what we suggest.', opts: [['Nothing', 'Nothing', 'Set it up, then I never think about it'], ['Approve', 'A tap to approve', 'Show me a proof, I say yes'], ['Show up', 'I will show up', 'I can host a creator or a shoot']] },
  { q: 'What is a comfortable first spend?', s: 'You can always add more later.', opts: [['u200', 'Under $200', ''], ['u600', '$200 to $600', ''], ['o600', '$600 and up', '']] },
]
export const STARTER: Record<string, string[]> = {
  found: ['gbp', 'gpost', 'localseo', 'listings', 'reach', 'measure'],
  tempt: ['dish', 'reviewsplan', 'reel', 'design', 'shoot', 'reviewsreply'],
  back: ['winback', 'birthday', 'news', 'welcome', 'earlyaccess', 'regulars'],
  slow: ['slowoffer', 'story', 'promoevent', 'winback', 'giftcard', 'nights'],
}
export function starterPicks(hurt: string, you: string, bud: string): ShelfCard[] {
  const cards = shelfCards()
  const list = (STARTER[hurt] ?? STARTER.found).map((id) => cards[id]).filter((c): c is ShelfCard => !!c && c.availability !== 'hidden')
  const budTest = (c: ShelfCard) => bud === 'u200' ? c.priceN < 200 : bud === 'u600' ? c.priceN <= 600 : true
  const youTest = (c: ShelfCard) => you === 'Show up' ? true : you === 'Approve' ? c.you !== 'Show up' : c.you === 'Nothing'
  const picks: ShelfCard[] = list.filter((c) => budTest(c) && youTest(c) && isBuyable(c))
  for (const c of list) if (picks.length < 3 && !picks.includes(c) && budTest(c) && isBuyable(c)) picks.push(c)
  for (const c of list) if (picks.length < 3 && !picks.includes(c)) picks.push(c)
  return picks.slice(0, 3)
}

/* the describe read-back: a situation from /api/campaigns/describe → the goal tab it belongs to */
export const SITUATION_GOAL: Record<string, Exclude<ShelfGoal, 'foryou'>> = {
  opening: 'announce', event: 'event', 'new-thing': 'announce', quiet: 'newfaces', 'slow-shifts': 'nights', reviews: 'reviews', checks: 'deal', catering: 'catering', takeout: 'online', known: 'brand', return: 'regulars',
}
