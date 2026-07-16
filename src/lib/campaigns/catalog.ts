/**
 * v2 catalog helpers — turn the real PricedService entries into Line Items
 * the builder can add, and group the catalog by growth-loop stage for the
 * Add-service picker.
 */
import { PRICED_CATALOG, SHOOT_COST, type PricedService, type SystemGoal, type GoalPlay } from '@/lib/campaigns/data/priced-catalog'
import { summarize, type BillingCadence, type BillingSummary, type ContentBeat, type LineItem, type PieceBrief } from '@/lib/campaigns/types'

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
  'capture-kit': 'Grow your guest list',
  'nextdoor-local': 'Show up for neighbors', 'street-sampling': 'Sample at local events',
  'cross-promo': 'Team up with neighbors', 'friend-hook': 'Bring-a-friend reward', 'creator-collab': 'Team up with a creator',
  // The rest of the catalog, in plain owner language (was rendering raw technical names).
  'website-care': 'Keep your site fresh', 'email-found': 'Set up your email', 'brand-kit': 'Your look and voice',
  'channel-connect': 'Connect your accounts', 'listings-sync': 'Same info everywhere', 'ordering-setup': 'Take orders on your site',
  'video-single': 'One short video', 'delivery-opt': 'Win on delivery apps', 'pr-media': 'Get in the news',
  'truck-location': 'Tell fans where you are', 'graphic': 'A graphic for your event', 'gbp-event-post': 'Post your event on Google',
  'fb-event': 'A Facebook event page', 'concierge': 'Get hotels to send guests', 'landing-page': 'A signup page for your offer',
  'incentive-design': 'Pick the right giveaway', 'ai-phone': 'Never miss a call', 'pre-opening': 'Open with a crowd',
  'newsletter': 'One good email a month', 'menu-eng': 'Make your menu sell more', 'bar-events': 'Fill your slow weeknights',
  'catering-engine': 'Land catering jobs', 'giftcards': 'Sell gift cards', 'reservation-protect': 'Cut no-shows',
  'reminder-send': 'A book-now reminder', 'referral': 'Turn regulars into promoters', 'seasonal-cal': 'Plan the next 3 months',
  'vip-comms': 'Treat your VIPs first', 'reporting': 'See what is working',
  'happy-hour-engine': 'Run a happy hour', 'ugc-rights': 'Repost guest photos', 'menu-photo-refresh': 'Refresh your photos',
  'lto-launch': 'Launch a new item', 'staff-advocacy': 'Get your team asking', 'google-food-order': 'Google order button',
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

/** One Line Item PER price point of a service — so a service with both a setup and a monthly
 *  (e.g. nextdoor-local: $245 once + $115/mo) bills both, not just the first price. */
export function serviceToLines(s: PricedService, idBase: string): LineItem[] {
  return s.prices.map((p, i) => {
    const cadence: BillingCadence = p.kind === 'monthly'
      ? { kind: 'recurring', every: 'monthly' }
      : p.kind === 'per-unit' ? { kind: 'per-occurrence', unit: p.unit ?? 'unit' } : { kind: 'one-time' }
    return {
      id: `${idBase}-${i}`, serviceId: s.id, name: s.name, plain: PLAIN_NAMES[s.id] ?? s.name, does: shortDoes(s),
      stage: s.section, price: p.amount, cadence, eta: '~1 week',
      metric: s.metric, why: s.evidence, market: p.market, handler: s.handler,
      included: true, lock: 'editable',
    }
  })
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

/** Build a transparent Line Item for a content piece (mirrors serviceToLine).
 *  The Content Menu passes the per-piece handler + brief + date the owner chose in
 *  the add-piece modal; the legacy composer omits them (undefined → unchanged). */
export function buildContentLine(
  type: string,
  id: string,
  opts?: { qty?: number; stage?: LineItem['stage']; why?: string; producer?: LineItem['producer']; brief?: PieceBrief; postISO?: string },
): LineItem | null {
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
    producer: opts?.producer, brief: opts?.brief, postISO: opts?.postISO,
    included: true, lock: 'editable',
  }
}

/** Default channel a content type goes out on, for a derived calendar beat. */
const CONTENT_CHANNEL: Record<string, string> = {
  reel: 'Instagram', photo: 'Instagram', post: 'Instagram', story: 'Instagram', email: 'Email', sms: 'SMS',
}

/**
 * Derive the production calendar straight from the line items, for a Content-Menu
 * campaign that has no AI-authored brief. One beat per included content piece, each
 * carrying a STABLE id (the line id — so producer_choices / the post-ship reconcile /
 * content_drafts all key by it, never by a positional slot a re-order would shift)
 * plus that line's per-piece producer + brief, so planCampaignPieces routes and
 * briefs each piece independently. qty>1 clones the piece forward; every clone shares
 * the line's handler + brief (qty repeats the SAME piece — a different dish is a new
 * line). The beat label leads with the dish so it reads as the piece's identity
 * everywhere downstream (the order title, the team draft idea).
 */
export function beatsFromLines(items: LineItem[]): ContentBeat[] {
  const out: ContentBeat[] = []
  let week = 0
  for (const it of items) {
    if (!it.included || it.optOut) continue
    const m = /^content-(.+)$/.exec(it.serviceId ?? '')
    if (!m || !CONTENT_META[m[1]]) continue
    const type = m[1]
    const meta = CONTENT_META[type]
    const n = Math.max(1, it.qty ?? 1)
    for (let i = 0; i < n; i++) {
      week += 1
      out.push({
        week,
        type,
        label: it.brief?.featuring ? `${meta.label} · ${it.brief.featuring}` : meta.label,
        channel: CONTENT_CHANNEL[type] ?? 'Instagram',
        // Always suffix the index, even at qty 1, so a qty 2→1 shrink keeps piece #0's
        // key stable (`L#0`) instead of flipping it to a bare `L` and churning its
        // order/draft on the post-ship reconcile.
        id: `${it.id}#${i}`,
        lineId: it.id,
        producer: it.producer,
        brief: it.brief,
      })
    }
  }
  return out
}

/**
 * Reconcile the content calendar (beats) with the owner's edited line items so
 * bill == calendar == production. Keeps only beats whose content type still has
 * an included, non-opted-out per-occurrence line, and makes each type's beat
 * count equal that line's quantity (trim extras; clone forward weekly to grow).
 * For an unedited campaign this is the identity (composeCampaign already sets
 * qty == beats-per-type); it only diverges once the owner bumps a qty or opts a
 * line out — exactly the cases where the three counts used to disagree.
 */
export function reconcileBeatsToLines(items: LineItem[], beats: ContentBeat[]): ContentBeat[] {
  const want = new Map<string, number>()
  for (const it of items) {
    if (!it.included || it.optOut) continue
    if (!it.serviceId?.startsWith('content-')) continue
    const type = it.serviceId.slice('content-'.length)
    if (!CONTENT_META[type]) continue
    want.set(type, (want.get(type) ?? 0) + Math.max(1, it.qty ?? 1))
  }
  const byType = new Map<string, ContentBeat[]>()
  for (const b of beats) {
    if (!want.has(b.type)) continue // type dropped (opted out / removed)
    ;(byType.get(b.type) ?? byType.set(b.type, []).get(b.type)!).push(b)
  }
  const out: ContentBeat[] = []
  for (const [type, qty] of want) {
    const existing = byType.get(type) ?? []
    if (existing.length >= qty) { out.push(...existing.slice(0, qty)); continue }
    out.push(...existing)
    const template = existing[existing.length - 1] ?? { type, label: CONTENT_META[type].label, channel: 'instagram', week: 0 }
    let week = existing.length ? existing[existing.length - 1].week : 0
    for (let i = existing.length; i < qty; i++) { week += 1; out.push({ ...template, type, week }) }
  }
  return out.sort((a, b) => a.week - b.week)
}

/* ── Shoot Day batching ──────────────────────────────────────────────
 * On-site creative (a reel/photo, or a story the owner chooses to film on location)
 * needs a person to physically come in, which carries a fixed trip cost. Batching
 * several on-site pieces into ONE visit amortizes that trip — so the owner's price for
 * a lone on-site piece carries a small "solo visit" surcharge that MELTS to $0 the
 * moment a second on-site piece shares the visit. Remote pieces (post/email/sms, a
 * repost story) carry no trip and are never batched. The per-piece menu prices already
 * bake in the batched-shoot assumption (see video-engine vs video-single), so we never
 * re-split a piece into creative+trip — we only ADD the solo surcharge when it applies. */

/** The retail surcharge (cents) for a lone on-site piece that needs its own visit. Set
 *  to the REAL solo-minus-batched shoot COGS gap so the price signal mirrors our cost,
 *  and it melts to $0 once a 2nd on-site piece shares the trip. */
export const SOLO_VISIT_SURCHARGE_CENTS = (SHOOT_COST.solo - SHOOT_COST.batched) * 100  // $75

/** Price (cents) of an AI first draft for a designed/written piece (post/email/sms).
 *  Owner's model: FREE on premium accounts; on free accounts it's our generation cost
 *  plus ~20%. There's no account-tier flag wired yet, so this is the free-tier placeholder
 *  shown everywhere; swap for a tier-aware resolver when premium is modeled. */
export const AI_DRAFT_CENTS = 900  // $9 (free-tier placeholder; premium = $0)

/** Whether a content piece needs someone physically on-site to make it. reel + photo
 *  always do; a story only when the owner chose to film it on location; everything else
 *  (post / email / sms, a repost story) is remote. Switches on the literal type KEY,
 *  NOT the discipline regex (which can misfire on a 'featuring' dish string). */
export function isOnSitePiece(type: string, brief?: PieceBrief | null): boolean {
  if (type === 'reel' || type === 'photo') return true
  if (type === 'story') return brief?.captureMode === 'on-site'
  return false
}

export interface ShootDay {
  id: string
  /** The line items whose on-site pieces share this visit. */
  lineIds: string[]
  /** How many on-site PIECES (qty-aware) need this visit — DIY pieces excluded (the
   *  owner films those, so they need no Apnosh visit). */
  onSiteCount: number
  /** $0 once 2+ pieces share the visit; the solo surcharge when exactly one does. */
  soloSurchargeCents: number
}

/** Group a campaign's on-site pieces into Shoot Days (v1: one bucket, 'sd1'). A line's
 *  qty counts as that many pieces (two reels in one line still share one visit). DIY
 *  on-site pieces are excluded — the owner makes those, so Apnosh sends no one. The
 *  surcharge lands only on a day holding exactly one on-site piece. Pure. */
export function shootDaysFromLines(items: LineItem[]): ShootDay[] {
  const byDay = new Map<string, ShootDay>()
  for (const it of items) {
    if (!it.included || it.optOut) continue
    if (it.producer === 'diy') continue
    const m = /^content-(.+)$/.exec(it.serviceId ?? '')
    if (!m || !isOnSitePiece(m[1], it.brief)) continue
    const id = it.brief?.shootDayId ?? 'sd1'
    const n = Math.max(1, it.qty ?? 1)
    const cur = byDay.get(id) ?? { id, lineIds: [], onSiteCount: 0, soloSurchargeCents: 0 }
    cur.lineIds.push(it.id)
    cur.onSiteCount += n
    byDay.set(id, cur)
  }
  return [...byDay.values()].map((sd) => ({ ...sd, soloSurchargeCents: sd.onSiteCount === 1 ? SOLO_VISIT_SURCHARGE_CENTS : 0 }))
}

/** Total visit surcharge (cents) across all of a campaign's Shoot Days. */
export function visitSurchargeCents(items: LineItem[]): number {
  return shootDaysFromLines(items).reduce((s, sd) => s + sd.soloSurchargeCents, 0)
}

/** The ONE price truth for a Content-Menu campaign: the honest line bill PLUS any
 *  solo-visit surcharge, so the cart footer, cost page, and accrued charges all agree.
 *  oneTimeOnDelivery folds the visit in (it bills with the on-site piece on delivery);
 *  visitSurchargeDollars is also surfaced separately so the bill can show the line. */
export interface CampaignBill extends BillingSummary {
  visitSurchargeDollars: number
}
export function campaignBill(items: LineItem[]): CampaignBill {
  const base = summarize(items)
  const visit = visitSurchargeCents(items) / 100
  return { ...base, oneTimeOnDelivery: base.oneTimeOnDelivery + visit, visitSurchargeDollars: visit }
}

/* ── Live-catalog overlay (Phase 4b / G3) ─────────────────────────────────────
   Admin price/service edits reach the store with NO deploy: the client fetches the
   DB-live catalog (getLiveCatalog, via /api/dashboard/catalog-content) and registers
   it here, so serviceById returns the edited price the moment it lands. The committed
   snapshot (PRICED_CATALOG) stays the seed + fallback — before any live catalog is
   registered, and for any service the live read doesn't include, serviceById returns
   the snapshot. Parity (verify-catalog-live-parity) proves live == snapshot for every
   unedited service, so registering the live catalog can NEVER move an unedited price.
   The catalog is GLOBAL (not per-tenant), so a single overlay is correct for everyone. */
const LIVE_OVERLAY = new Map<string, PricedService>()

/** Overlay the DB-live catalog onto serviceById. Idempotent; a later call refreshes prices. */
export function registerLiveServices(list: PricedService[] | null | undefined): void {
  if (!Array.isArray(list)) return
  for (const s of list) if (s && typeof s.id === 'string') LIVE_OVERLAY.set(s.id, s)
}

/** Clear the overlay (tests). */
export function clearLiveServices(): void { LIVE_OVERLAY.clear() }

export function serviceById(id: string): PricedService | undefined {
  return LIVE_OVERLAY.get(id) ?? PRICED_CATALOG.find(s => s.id === id)
}

/** The owner-facing plain name for a service (falls back to the catalog name). */
export function plainNameOf(s: PricedService): string {
  return PLAIN_NAMES[s.id] ?? s.name
}

/** Every catalog service that serves a system goal, paired with its play for that goal.
 *  One O(n) scan over PRICED_CATALOG — the catalog IS the source of truth for which
 *  services a goal pulls in, so tagging a new service makes it available automatically.
 *  buildSystem (compose-plan) tier-filters + orders these instead of reading a fixed list. */
export function playsForGoal(goal: SystemGoal): { service: PricedService; play: GoalPlay }[] {
  const out: { service: PricedService; play: GoalPlay }[] = []
  for (const s of PRICED_CATALOG) {
    for (const p of s.goalPlays ?? []) if (p.goal === goal) out.push({ service: s, play: p })
  }
  return out
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
