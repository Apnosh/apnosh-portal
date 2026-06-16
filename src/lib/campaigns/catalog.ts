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
    metric: s.metric, why: s.evidence, market: s.prices[0].market,
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
