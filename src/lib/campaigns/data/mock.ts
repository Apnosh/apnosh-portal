/**
 * v2 prototype mock data. Treated as already-collected onboarding input +
 * a sample AI-drafted campaign, assembled from the REAL priced catalog so
 * the prototype exercises true names, prices, metrics and evidence.
 */
import { PRICED_CATALOG, type PricedService } from '@/lib/campaigns/data/priced-catalog'
import type { BillingCadence, CampaignDraft, LineItem } from '@/lib/campaigns/types'

/** Plain-language overlay (the Simple layer) keyed by catalog id. */
const OVERLAY: Record<string, { plain: string; does: string; eta: string }> = {
  'gbp-setup':        { plain: 'Show up on Google',     does: 'Be the top answer for nearby diners', eta: '~3 days' },
  'site-menu':        { plain: 'Fix your site & menu',  does: 'The page first-timers check first',    eta: '~1 week' },
  'tracking':         { plain: 'Turn on tracking',      does: 'So every line gets a real number',     eta: '~2 days' },
  'welcome-seq':      { plain: 'Welcome new guests',    does: 'Nudge first-timers back in two weeks',  eta: '~1 week' },
  'second-visit':     { plain: 'Win the 2nd visit',     does: 'Turn first-timers into regulars',       eta: '~1 week' },
  'loyalty':          { plain: 'Reward your regulars',  does: 'Members come back ~20% more often',      eta: '~2 weeks' },
  'review-engine':    { plain: 'Collect fresh reviews', does: 'Invite every guest to review',          eta: '~1 week' },
  'review-responses': { plain: 'Answer every review',   does: 'Lifts your rating and review count',     eta: 'ongoing' },
}

function cadenceOf(s: PricedService): { price: number; cadence: BillingCadence } {
  const p = s.prices[0]
  if (p.kind === 'monthly') return { price: p.amount, cadence: { kind: 'recurring', every: 'monthly' } }
  if (p.kind === 'per-unit') return { price: p.amount, cadence: { kind: 'per-occurrence', unit: p.unit ?? 'unit' } }
  return { price: p.amount, cadence: { kind: 'one-time' } }
}

function lineFrom(id: string, i: number): LineItem | null {
  const s = PRICED_CATALOG.find(x => x.id === id)
  if (!s) return null
  const o = OVERLAY[id]
  const { price, cadence } = cadenceOf(s)
  return {
    id: `li-${i}`,
    serviceId: s.id,
    name: s.name,
    plain: o?.plain ?? s.name,
    does: o?.does ?? '',
    stage: s.section,
    price,
    cadence,
    eta: o?.eta ?? '~1 week',
    metric: s.metric,
    why: s.evidence,
    market: s.prices[0].market,
    included: true,
    lock: 'editable',
  }
}

const DEMO_IDS = ['gbp-setup', 'site-menu', 'tracking', 'welcome-seq', 'second-visit', 'loyalty', 'review-engine', 'review-responses']

export const MOCK_CAMPAIGN: CampaignDraft = {
  id: 'camp-1',
  name: 'First visit → regular',
  intent: 'full-plan',
  path: 'ai',
  budgetMonthly: 800,
  items: DEMO_IDS.map((id, i) => lineFrom(id, i)).filter((x): x is LineItem => x !== null),
}

/** A blank campaign — the DIY path starts here. */
export const EMPTY_CAMPAIGN: CampaignDraft = {
  id: 'camp-diy', name: 'New campaign', intent: 'full-plan', path: 'diy', budgetMonthly: 800, items: [],
}

/** Express single-deliverable order — the smallest the builder must handle. */
export const SINGLE_ITEM_CAMPAIGN: CampaignDraft = {
  id: 'camp-single',
  name: 'One Instagram Reel',
  intent: 'single-item',
  path: 'ai',
  budgetMonthly: 0,
  items: [{
    id: 'li-single', serviceId: 'reel-1', name: 'Short-form video (Reel)',
    plain: 'One Instagram Reel', does: 'A scroll-stopping reel of your signature dish',
    stage: 'awareness', price: 120, cadence: { kind: 'per-occurrence', unit: 'reel' }, qty: 1, eta: '~5 days',
    metric: { label: 'Reach & profile visits', expect: 'One strong reel can out-reach a month of posts' },
    why: 'Short-form video is the top discovery surface for younger diners.',
    included: true, lock: 'editable',
  }],
}
