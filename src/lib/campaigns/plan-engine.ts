/**
 * The plan engine — the complex backend the owner never sees. Given a
 * monthly budget and what the owner already has, it returns the best plan:
 *  - foundations always (the table stakes),
 *  - growth services added by leverage priority until the budget is full,
 *  - anything the owner already has pre-opted-out (and not counted).
 *
 * One-time costs are amortised to a monthly-equivalent so a single budget
 * dial governs the whole plan. Owner-facing surfaces render the result as
 * Plays; this module is where the optimisation lives.
 */
import { serviceById, serviceToLine } from '@/lib/campaigns/catalog'
import type { GoalKey, LineItem } from '@/lib/campaigns/types'

/** Onboarding capability → the service ids it makes redundant. */
export const HAS_MAP: Record<string, string[]> = {
  'A good website': ['site-menu'],
  'A good website with our menu on it': ['site-menu'],
  'A customer list': ['crm-list'],
  'A customer list (emails / phone numbers)': ['crm-list'],
  'Someone posting on social': ['gbp-posts'],
  'Someone posting on social regularly': ['gbp-posts'],
  'Someone answering reviews': ['review-responses'],
  'Someone answering our reviews': ['review-responses'],
}

interface Candidate { id: string; kind: 'foundation' | 'growth'; priority?: number }

/** Ranked candidate sets per goal — the leverage order the engine packs to. */
const CANDIDATES_BY_GOAL: Record<GoalKey, Candidate[]> = {
  regulars: [
    { id: 'gbp-setup', kind: 'foundation' }, { id: 'site-menu', kind: 'foundation' }, { id: 'tracking', kind: 'foundation' }, { id: 'crm-list', kind: 'foundation' },
    { id: 'second-visit', kind: 'growth', priority: 1 }, { id: 'welcome-seq', kind: 'growth', priority: 2 },
    { id: 'review-engine', kind: 'growth', priority: 3 }, { id: 'review-responses', kind: 'growth', priority: 4 },
    { id: 'loyalty', kind: 'growth', priority: 5 }, { id: 'birthday', kind: 'growth', priority: 6 },
    { id: 'gbp-posts', kind: 'growth', priority: 7 }, { id: 'winback', kind: 'growth', priority: 8 },
  ],
  'new-customers': [
    { id: 'gbp-setup', kind: 'foundation' }, { id: 'site-menu', kind: 'foundation' }, { id: 'tracking', kind: 'foundation' }, { id: 'photo-library', kind: 'foundation' },
    { id: 'local-seo', kind: 'growth', priority: 1 }, { id: 'gbp-posts', kind: 'growth', priority: 2 },
    { id: 'review-engine', kind: 'growth', priority: 3 }, { id: 'video-engine', kind: 'growth', priority: 4 },
    { id: 'social-mgmt', kind: 'growth', priority: 5 }, { id: 'second-visit', kind: 'growth', priority: 6 },
    { id: 'paid-ads', kind: 'growth', priority: 7 },
  ],
  'slow-nights': [
    { id: 'gbp-setup', kind: 'foundation' }, { id: 'site-menu', kind: 'foundation' }, { id: 'tracking', kind: 'foundation' }, { id: 'sms-found', kind: 'foundation' }, { id: 'crm-list', kind: 'foundation' },
    { id: 'sms-program', kind: 'growth', priority: 1 }, { id: 'offer-eng', kind: 'growth', priority: 2 },
    { id: 'event-pkg', kind: 'growth', priority: 3 }, { id: 'gbp-posts', kind: 'growth', priority: 4 },
    { id: 'second-visit', kind: 'growth', priority: 5 }, { id: 'loyalty', kind: 'growth', priority: 6 },
  ],
  reviews: [
    { id: 'gbp-setup', kind: 'foundation' }, { id: 'site-menu', kind: 'foundation' }, { id: 'tracking', kind: 'foundation' }, { id: 'review-claim', kind: 'foundation' },
    { id: 'review-engine', kind: 'growth', priority: 1 }, { id: 'review-responses', kind: 'growth', priority: 2 },
    { id: 'feedback-loop', kind: 'growth', priority: 3 }, { id: 'photo-library', kind: 'growth', priority: 4 },
    { id: 'second-visit', kind: 'growth', priority: 5 },
  ],
}

/** Monthly-equivalent load — recurring at face, one-time amortised over 6 months. */
function monthlyLoad(id: string): number {
  const s = serviceById(id)
  if (!s) return 0
  const p = s.prices[0]
  return p.kind === 'monthly' ? p.amount : p.amount / 6
}

export interface PlanResult { items: LineItem[]; ownedSaved: number; ownedCount: number }

/** Goal-specific answers re-shape the plan: boost the right services up the
 * priority order, or mark a capability as owned. */
const CONTEXT_RULES: { match: RegExp; boost?: string[]; owned?: string[] }[] = [
  { match: /instagram/i, boost: ['social-mgmt', 'video-engine', 'gbp-posts'] },
  { match: /google/i,    boost: ['local-seo', 'gbp-posts'] },
  { match: /yelp/i,      boost: ['review-claim', 'review-responses', 'review-engine'] },
  { match: /email\/SMS|have.*list/i, owned: ['crm-list'] },
  { match: /no direct line/i, boost: ['crm-list', 'welcome-seq'] },
]
function contextHints(context?: string): { boost: Set<string>; owned: Set<string> } {
  const boost = new Set<string>(), owned = new Set<string>()
  if (context) for (const r of CONTEXT_RULES) if (r.match.test(context)) { r.boost?.forEach(b => boost.add(b)); r.owned?.forEach(o => owned.add(o)) }
  return { boost, owned }
}

export function planForBudget(budgetMonthly: number, has: string[], goal: GoalKey, context?: string): PlanResult {
  const hints = contextHints(context)
  const owned = new Set([...has.flatMap(h => HAS_MAP[h] ?? []), ...hints.owned])
  const candidates = CANDIDATES_BY_GOAL[goal] ?? CANDIDATES_BY_GOAL.regulars
  const items: LineItem[] = []
  let load = 0
  let ownedSaved = 0
  let ownedCount = 0

  const include = (id: string, i: number) => {
    const s = serviceById(id)
    if (!s) return
    const li = serviceToLine(s, `li-${id}-${i}`)
    if (owned.has(id)) { li.optOut = 'have-it'; ownedSaved += li.price; ownedCount++ }
    items.push(li)
  }

  // Foundations: always present; owned ones are pre-opted-out and don't load.
  candidates.filter(c => c.kind === 'foundation').forEach((c, i) => {
    include(c.id, i)
    if (!owned.has(c.id)) load += monthlyLoad(c.id)
  })

  // Growth: by leverage (context boosts pull services up), while the budget holds.
  const prio = (c: Candidate) => c.priority! - (hints.boost.has(c.id) ? 100 : 0)
  candidates.filter(c => c.kind === 'growth').sort((a, b) => prio(a) - prio(b)).forEach((c, i) => {
    if (owned.has(c.id)) { include(c.id, 100 + i); return }
    const l = monthlyLoad(c.id)
    if (load + l <= budgetMonthly) { include(c.id, 100 + i); load += l }
  })

  return { items, ownedSaved, ownedCount }
}

/** The highest-leverage service a bit more budget would unlock, and the
 * extra monthly it'd take — so the owner sees the next move up. */
export function nextUnlock(budgetMonthly: number, has: string[], goal: GoalKey, context?: string): { name: string; addlMonthly: number } | null {
  const hints = contextHints(context)
  const owned = new Set([...has.flatMap(h => HAS_MAP[h] ?? []), ...hints.owned])
  const candidates = CANDIDATES_BY_GOAL[goal] ?? CANDIDATES_BY_GOAL.regulars
  let load = 0
  candidates.filter(c => c.kind === 'foundation' && !owned.has(c.id)).forEach(c => { load += monthlyLoad(c.id) })
  let unlock: { id: string; load: number } | null = null
  // Pack in the same boosted order planForBudget uses, so the "next move up"
  // is always the first service the plan couldn't fit — never one already in it.
  const prio = (c: Candidate) => c.priority! - (hints.boost.has(c.id) ? 100 : 0)
  for (const c of candidates.filter(c => c.kind === 'growth').sort((a, b) => prio(a) - prio(b))) {
    if (owned.has(c.id)) continue
    const l = monthlyLoad(c.id)
    if (load + l <= budgetMonthly) load += l
    else if (!unlock) unlock = { id: c.id, load: l }
  }
  if (!unlock) return null
  const s = serviceById(unlock.id)
  const headroom = budgetMonthly - load
  const addl = Math.max(5, Math.ceil((unlock.load - headroom) / 5) * 5)
  return { name: s?.name ?? unlock.id, addlMonthly: addl }
}
