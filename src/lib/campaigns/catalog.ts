/**
 * v2 catalog helpers — turn the real PricedService entries into Line Items
 * the builder can add, and group the catalog by growth-loop stage for the
 * Add-service picker.
 */
import { PRICED_CATALOG, type PricedService } from '@/lib/campaigns/data/priced-catalog'
import type { BillingCadence, LineItem } from '@/lib/campaigns/types'

export function cadenceOf(s: PricedService): { price: number; cadence: BillingCadence } {
  const p = s.prices[0]
  if (p.kind === 'monthly') return { price: p.amount, cadence: { kind: 'recurring', every: 'monthly' } }
  if (p.kind === 'per-unit') return { price: p.amount, cadence: { kind: 'per-occurrence', unit: p.unit ?? 'unit' } }
  return { price: p.amount, cadence: { kind: 'one-time' } }
}

/** First ~9 words of the description — a plain "what it does". */
function shortDoes(s: PricedService): string {
  const src = (s.desc ?? s.metric?.expect ?? '').trim()
  const words = src.split(/\s+/)
  return words.length <= 10 ? src : words.slice(0, 9).join(' ') + '…'
}

/** Owner-language names so engine-built lines read plainly. */
const PLAIN_NAMES: Record<string, string> = {
  'gbp-setup': 'Show up on Google', 'site-menu': 'Fix your site & menu', 'tracking': 'Turn on tracking',
  'crm-list': 'Set up your guest list', 'photo-library': 'Pro photos of your food', 'review-claim': 'Claim your review pages',
  'sms-found': 'Set up texting', 'second-visit': 'Win the 2nd visit', 'welcome-seq': 'Welcome new guests',
  'review-engine': 'Collect fresh reviews', 'review-responses': 'Answer every review', 'loyalty': 'Reward your regulars',
  'birthday': 'Birthday treats', 'gbp-posts': 'Keep Google fresh', 'winback': 'Win back quiet guests',
  'local-seo': 'Rank in local search', 'video-engine': 'Short-form video', 'social-mgmt': 'Run your social',
  'paid-ads': 'Local ads', 'sms-program': 'Text your regulars', 'offer-eng': 'A promo that works',
  'event-pkg': 'Promote an event', 'feedback-loop': 'Catch problems privately',
}

/** Build a Line Item from a catalog service (used for newly-added lines). */
export function serviceToLine(s: PricedService, id: string): LineItem {
  const { price, cadence } = cadenceOf(s)
  return {
    id, serviceId: s.id, name: s.name, plain: PLAIN_NAMES[s.id] ?? s.name, does: shortDoes(s),
    stage: s.section, price, cadence, eta: '~1 week',
    metric: s.metric, why: s.evidence, market: s.prices[0].market, handler: s.handler,
    included: true, lock: 'editable',
  }
}

/* ── Content pieces ──────────────────────────────────────────────────
 * The à-la-carte content deliverables a campaign ships (a reel, an email, a
 * text). Priced per piece and — unlike before — carrying the same
 * transparency fields as catalog services (why / market / metric / handler)
 * so every line on a plan is equally honest. Defined here (not in the
 * composer) so both the legacy composer and the new play engine share one
 * source and there's no circular import. */
export interface ContentMeta {
  price: number
  stage: LineItem['stage']
  unit: string
  label: string
  plain: string
  does: string
  why: string
  market: { low: number; high: number; label?: string }
  metric: { label: string; expect: string }
  handler: 'apnosh' | 'ai' | 'hybrid'
}

export const CONTENT_META: Record<string, ContentMeta> = {
  reel:  { price: 120, stage: 'awareness', unit: 'reel',  label: 'Short-form video', plain: 'A reel',  does: 'A short video for IG + TikTok',
    why: 'Short-form video is the top discovery surface for new diners — a strong reel reaches well past your followers.',
    market: { low: 120, high: 1500, label: 'pro per-reel rates' }, metric: { label: 'Reach & profile visits', expect: 'Discovery beyond your current followers' }, handler: 'hybrid' },
  photo: { price: 65,  stage: 'awareness', unit: 'photo', label: 'Photo',            plain: 'A photo', does: 'A styled photo of your food',
    why: 'A great food photo is the single most-reused asset — it lifts every place your food appears.',
    market: { low: 50, high: 300, label: 'food photography' }, metric: { label: 'Conversion wherever it’s seen', expect: 'Item photos lift delivery sales up to 44%' }, handler: 'apnosh' },
  post:  { price: 70,  stage: 'awareness', unit: 'post',  label: 'Post / graphic',   plain: 'A post',  does: 'A post / graphic for socials',
    why: 'A clean post keeps your feed and Google active and gives the offer somewhere to live.',
    market: { low: 50, high: 200, label: 'social post design' }, metric: { label: 'Engagement & saves', expect: 'Steady local engagement' }, handler: 'hybrid' },
  story: { price: 45,  stage: 'awareness', unit: 'story', label: 'Story',            plain: 'A story', does: 'A day-of story for IG',
    why: 'Stories are where your regulars keep up day-to-day — a day-of story drives same-night traffic.',
    market: { low: 30, high: 150, label: 'story design' }, metric: { label: 'Story views & taps', expect: 'Same-day reach to your closest followers' }, handler: 'ai' },
  email: { price: 85,  stage: 'retain',    unit: 'email', label: 'Email',            plain: 'An email', does: 'An email to your list',
    why: 'Email is the one channel you own outright — no algorithm decides who sees it.',
    market: { low: 85, high: 500, label: 'managed email send' }, metric: { label: 'Opens & visits per send', expect: 'Direct reach to the list you own' }, handler: 'hybrid' },
  sms:   { price: 40,  stage: 'retain',    unit: 'text',  label: 'Text blast',       plain: 'A text',  does: 'A text to your list',
    why: 'Texts get read in minutes — the fastest way to fill a slow shift.',
    market: { low: 25, high: 100, label: 'managed SMS blast' }, metric: { label: 'Clicks & redemptions', expect: 'Fast response — track redemptions, not opens' }, handler: 'hybrid' },
}

/** Build a transparent Line Item for a content piece (mirrors serviceToLine). */
export function buildContentLine(type: string, id: string, opts?: { qty?: number; stage?: LineItem['stage']; why?: string }): LineItem | null {
  const m = CONTENT_META[type]
  if (!m) return null
  const qty = Math.max(1, opts?.qty ?? 1)
  return {
    id, serviceId: `content-${type}`,
    name: qty > 1 ? `${m.label} × ${qty}` : m.label,
    plain: m.plain, does: m.does,
    stage: opts?.stage ?? m.stage,
    price: m.price, cadence: { kind: 'per-occurrence', unit: m.unit }, qty,
    eta: '~5 days',
    metric: m.metric, why: opts?.why ?? m.why, market: m.market, handler: m.handler,
    included: true, lock: 'editable',
  }
}

export function serviceById(id: string): PricedService | undefined {
  return PRICED_CATALOG.find(s => s.id === id)
}

/** Catalog grouped by section, excluding services already on the campaign. */
export function addableByStage(usedServiceIds: Set<string>): { stage: string; services: PricedService[] }[] {
  const map = new Map<string, PricedService[]>()
  for (const s of PRICED_CATALOG) {
    if (usedServiceIds.has(s.id)) continue
    ;(map.get(s.section) ?? map.set(s.section, []).get(s.section)!).push(s)
  }
  return [...map.entries()].map(([stage, services]) => ({ stage, services }))
}
