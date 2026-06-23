import 'server-only'
/**
 * AI recommender for the create page's own campaign catalog (the ~28 items the
 * owner picks from in the builder). Ranks them for the restaurant's goal + live
 * signals so the create page's "Suggested for you" row + featured card are
 * tailored, not hardcoded. Same discipline as the plan builder: the model
 * proposes catalog ids + a reason; code validates against the closed list. A
 * goal-anchored rules ranker is the fallback.
 */
import type { GoalKey } from '@/lib/campaigns/types'
import type { PlanningContext } from './types'
import { callStructuredOutput } from './anthropic'
import type { UpcomingMoment } from './recommend-plays'

/** The create-page catalog (mirrors CATALOG in apnosh-campaign.jsx). id + a goal
 *  it serves; unknown ids returned by the model are dropped by the client. */
const CREATE_CATALOG: { id: string; title: string; goal: GoalKey }[] = [
  { id: 'reach', title: 'Reach new locals', goal: 'new-customers' },
  { id: 'nights', title: 'Fill your slow nights', goal: 'slow-nights' },
  { id: 'firstvisit', title: 'Win first-time visits', goal: 'new-customers' },
  { id: 'regulars', title: 'Turn first-timers into regulars', goal: 'regulars' },
  { id: 'catering', title: 'Catering and big orders', goal: 'new-customers' },
  { id: 'reviewsplan', title: 'Boost reviews and rating', goal: 'reviews' },
  { id: 'reel', title: 'A short video reel', goal: 'new-customers' },
  { id: 'story', title: 'A story post', goal: 'new-customers' },
  { id: 'carousel', title: 'A carousel post', goal: 'new-customers' },
  { id: 'graphic', title: 'A designed graphic', goal: 'new-customers' },
  { id: 'dish', title: 'Feature a dish', goal: 'new-customers' },
  { id: 'gpost', title: 'A Google Business post', goal: 'new-customers' },
  { id: 'promoevent', title: 'Promote an event', goal: 'slow-nights' },
  { id: 'launch', title: 'Launch a special', goal: 'new-customers' },
  { id: 'creator', title: 'Work with a creator', goal: 'new-customers' },
  { id: 'welcome', title: 'Welcome new subscribers', goal: 'regulars' },
  { id: 'second', title: 'Nudge a second visit', goal: 'regulars' },
  { id: 'news', title: 'Monthly newsletter', goal: 'regulars' },
  { id: 'slowoffer', title: 'Slow-night offer email and text', goal: 'slow-nights' },
  { id: 'birthday', title: 'Birthday treat', goal: 'regulars' },
  { id: 'earlyaccess', title: 'Early access for regulars', goal: 'regulars' },
  { id: 'shoot', title: 'Book a photo and video shoot', goal: 'new-customers' },
  { id: 'gbp', title: 'Polish your Google profile', goal: 'reviews' },
  { id: 'reviewsreply', title: 'Reply to reviews', goal: 'reviews' },
  { id: 'qr', title: 'Add a table QR', goal: 'regulars' },
  { id: 'friction', title: 'Smooth out ordering', goal: 'new-customers' },
  { id: 'giftcard', title: 'Push gift cards', goal: 'new-customers' },
  { id: 'ticket', title: 'Run a ticketed event', goal: 'new-customers' },
  { id: 'winback', title: 'Win back quiet guests', goal: 'regulars' },
]
const VALID = new Set(CREATE_CATALOG.map((c) => c.id))

export interface ItemRec { id: string; reason: string }

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['recommended'],
  properties: { recommended: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } } } },
}
const SYSTEM = `You recommend which marketing campaigns a restaurant should run, picked from a FIXED catalog.
Rank the best ones for THIS restaurant's goal and situation, strongest first. For each, write one
short "why this fits you" reason grounded in a signal you were given (a review theme, a listing gap,
the goal, an upcoming date). Only state a number you were given; never invent data. Plain language,
under 14 words, no jargon, no em dashes. Use only ids from the catalog. Return 6 to 8.`

function signalsBlock(ctx: PlanningContext, moment?: UpcomingMoment): string {
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
  return L.join('\n')
}
const catalogBlock = () => CREATE_CATALOG.map((c) => `- ${c.id} (serves ${c.goal}): ${c.title}`).join('\n')

async function aiRecommend(ctx: PlanningContext, moment?: UpcomingMoment): Promise<ItemRec[] | null> {
  const user = `${signalsBlock(ctx, moment)}\n\nCATALOG:\n${catalogBlock()}\n\nRecommend the best campaigns for this restaurant, strongest first.`
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

export function rulesRecommend(ctx: PlanningContext, moment?: UpcomingMoment): ItemRec[] {
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
  return out.slice(0, 8)
}

export async function recommendCreateItems(ctx: PlanningContext, moment?: UpcomingMoment): Promise<{ recommended: ItemRec[]; source: 'ai' | 'rules' }> {
  const ai = await aiRecommend(ctx, moment)
  if (ai && ai.length) return { recommended: ai, source: 'ai' }
  return { recommended: rulesRecommend(ctx, moment), source: 'rules' }
}
