import 'server-only'
/**
 * AI recommender for the create page's own campaign catalog (the 29 items the
 * owner picks from in the builder). Ranks them for the restaurant's goal + live
 * signals so the create page's "Suggested for you" row + featured card are
 * tailored, not hardcoded. Same discipline as the plan builder: the model
 * proposes catalog ids + a reason; code validates against the closed list. A
 * goal-anchored rules ranker is the fallback.
 */
import type { PlanningContext, UpcomingMoment } from './types'
import { callStructuredOutput } from './anthropic'
import type { GoalKey } from '@/lib/campaigns/types'
import { CREATE_CATALOG } from '@/lib/campaigns/data/create-catalog'

const VALID = new Set(CREATE_CATALOG.map((c) => c.id))
const GOAL_OF = new Map(CREATE_CATALOG.map((c) => [c.id, c.goal]))

export interface ItemRec { id: string; reason: string }
/** What the account already has live, so we never re-recommend a running campaign as the top pick. */
export interface ActivePlans { goals: GoalKey[]; names: string[] }
const NO_ACTIVE: ActivePlans = { goals: [], names: [] }

// Push catalog items whose goal is already covered by a live standing plan to the BACK, keeping order
// within each group. So an owner already running a new-customers plan never sees it recommended first.
function deprioritizeCovered(recs: ItemRec[], covered: Set<GoalKey>): ItemRec[] {
  if (!covered.size) return recs
  const fresh: ItemRec[] = [], back: ItemRec[] = []
  for (const r of recs) { (covered.has(GOAL_OF.get(r.id) as GoalKey) ? back : fresh).push(r) }
  return [...fresh, ...back]
}

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['recommended'],
  properties: { recommended: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } } } },
}
const SYSTEM = `You recommend which marketing campaigns a restaurant should run, picked from a FIXED catalog.
Rank the best ones for THIS restaurant's goal and situation, strongest first. For each, write one
short "why this fits you" reason grounded in a signal you were given (a review theme, a listing gap,
the goal, an upcoming date). Only state a number you were given; never invent data. Plain language,
under 14 words, no jargon, no em dashes. Use only ids from the catalog. Return 6 to 8.
Do NOT recommend a campaign the owner is already running (listed under "Already live"); suggest what is
not yet covered or the natural next step instead.`

function signalsBlock(ctx: PlanningContext, moment: UpcomingMoment | undefined, active: ActivePlans): string {
  const { business, signals } = ctx
  const rep = signals.reputation
  const L: string[] = []
  L.push(`Restaurant: ${business.name} (${business.archetype})`)
  L.push(`Primary goal: ${business.goal} [${ctx.request.goalKey ?? business.goalKey}]`)
  if (rep.rating != null) L.push(`Rating: ${rep.rating}${rep.ratingCount ? ` from ${rep.ratingCount} reviews` : ''}`)
  if (rep.themes.length) L.push(`Guests mention: ${rep.themes.map((t) => `${t.label} (${t.good ? 'praise' : 'gripe'})`).join(', ')}`)
  const weak = signals.presence.filter((p) => p.completeness < 70)
  if (weak.length) L.push(`Getting-found gaps: ${weak.map((p) => `${p.name} ${p.completeness}%`).join(', ')}`)
  if (moment) L.push(`Coming up: ${moment.label} (${moment.daysLabel})`)
  if (active.names.length) L.push(`Already live (do NOT recommend these again): ${active.names.join('; ')}`)
  if (active.goals.length) L.push(`Goals already covered by a live plan: ${active.goals.join(', ')} — prefer other goals or the next step.`)
  return L.join('\n')
}
const catalogBlock = () => CREATE_CATALOG.map((c) => `- ${c.id} (serves ${c.goal}): ${c.title}`).join('\n')

async function aiRecommend(ctx: PlanningContext, moment: UpcomingMoment | undefined, active: ActivePlans): Promise<ItemRec[] | null> {
  const user = `${signalsBlock(ctx, moment, active)}\n\nCATALOG:\n${catalogBlock()}\n\nRecommend the best campaigns for this restaurant, strongest first.`
  const parsed = await callStructuredOutput<{ recommended: ItemRec[] }>({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 1000 })
  if (!parsed?.recommended) return null
  const seen = new Set<string>()
  const out: ItemRec[] = []
  for (const r of parsed.recommended) {
    if (r && typeof r.id === 'string' && VALID.has(r.id) && r.reason?.trim() && !seen.has(r.id)) {
      seen.add(r.id)
      out.push({ id: r.id, reason: r.reason.trim() })
    }
  }
  return out.length ? out.slice(0, 8) : null
}

const REASON_BY_GOAL: Record<GoalKey, string> = {
  'new-customers': 'Gets you in front of new local guests',
  regulars: 'Brings guests back more often',
  'slow-nights': 'Drives covers on your quiet shifts',
  reviews: 'Lifts your rating with fresh reviews',
}

export function rulesRecommend(ctx: PlanningContext, moment?: UpcomingMoment, active: ActivePlans = NO_ACTIVE): ItemRec[] {
  const goal = ctx.request.goalKey ?? ctx.business.goalKey
  const rep = ctx.signals.reputation
  const out: ItemRec[] = []
  const push = (id: string, reason: string) => { if (VALID.has(id) && !out.some((o) => o.id === id)) out.push({ id, reason }) }

  if (moment) push('promoevent', `${moment.label} is ${moment.daysLabel} — fill the date`)
  if (rep.rating != null && rep.rating < 4.3) push('reviewsplan', `Your rating is ${rep.rating} stars — fresh reviews nudge it up`)
  if (ctx.signals.presence.some((p) => p.completeness < 70)) push('gbp', 'Tidy your Google profile so new locals find you')
  for (const c of CREATE_CATALOG.filter((c) => c.goal === goal)) push(c.id, REASON_BY_GOAL[goal])
  // fill with broadly-useful staples
  for (const id of ['dish', 'reel', 'winback', 'slowoffer', 'news']) {
    const c = CREATE_CATALOG.find((x) => x.id === id)
    if (c) push(c.id, REASON_BY_GOAL[c.goal])
  }
  return deprioritizeCovered(out, new Set(active.goals)).slice(0, 8)
}

export async function recommendCreateItems(ctx: PlanningContext, moment?: UpcomingMoment, active: ActivePlans = NO_ACTIVE): Promise<{ recommended: ItemRec[]; source: 'ai' | 'rules' }> {
  const covered = new Set(active.goals)
  const ai = await aiRecommend(ctx, moment, active)
  if (ai && ai.length) return { recommended: deprioritizeCovered(ai, covered), source: 'ai' }
  return { recommended: rulesRecommend(ctx, moment, active), source: 'rules' }
}
