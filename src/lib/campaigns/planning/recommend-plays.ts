import 'server-only'
/**
 * AI play recommender for the campaign discovery feed. Ranks the closed set of
 * prebuilt campaign templates for THIS restaurant's goal + live signals (the
 * same brain as the plan builder: model proposes ids + reasons, code validates
 * against the catalog). Falls back to a goal-anchored rules ranker, so the feed
 * always has recommendations.
 */
import { CAMPAIGN_TEMPLATES, TEMPLATE_BY_ID } from '@/lib/campaigns/data/campaign-templates'
import type { GoalKey } from '@/lib/campaigns/types'
import type { PlanningContext } from './types'
import { callStructuredOutput } from './anthropic'

export interface PlayRec { id: string; reason: string }
export interface UpcomingMoment { label: string; daysLabel: string }

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['recommended'],
  properties: {
    recommended: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } },
    },
  },
}

const SYSTEM = `You recommend prebuilt marketing campaigns for a restaurant from a FIXED list. Pick the best
plays for THIS restaurant's goal and situation, most important first, and put the single strongest
play first. For each, write one short "why this fits you" reason grounded in a specific signal you
were given (a review theme, a listing gap, the goal, an upcoming date). Only state a number if you
were given it; never invent data. Plain language, under 14 words, no jargon, no em dashes. Use only
campaign ids from the list.`

function signalsBlock(ctx: PlanningContext, moment?: UpcomingMoment): string {
  const { business, signals } = ctx
  const rep = signals.reputation
  const L: string[] = []
  L.push(`Restaurant: ${business.name} (${business.archetype})`)
  L.push(`Primary goal: ${business.goal} [${ctx.request.goalKey ?? business.goalKey}]`)
  if (rep.rating != null) L.push(`Rating: ${rep.rating}${rep.ratingCount ? ` from ${rep.ratingCount} reviews` : ''}`)
  if (rep.trend != null) L.push(`Review volume vs last month: ${rep.trend >= 0 ? '+' : ''}${rep.trend}`)
  if (rep.themes.length) L.push(`Guests mention: ${rep.themes.map((t) => `${t.label} (${t.good ? 'praise' : 'gripe'})`).join(', ')}`)
  const weakPresence = signals.presence.filter((p) => p.completeness < 70)
  if (weakPresence.length) L.push(`Getting-found gaps: ${weakPresence.map((p) => `${p.name} ${p.completeness}%`).join(', ')}`)
  if (signals.segments.length) L.push(`Guest segments: ${signals.segments.map((s) => `${s.name} ${s.count}`).join(', ')}`)
  if (moment) L.push(`Coming up: ${moment.label} (${moment.daysLabel})`)
  return L.join('\n')
}

function templatesBlock(): string {
  return CAMPAIGN_TEMPLATES.map((t) => `- ${t.id} (${t.category}, goal ${t.goalKey}): ${t.name}. ${t.tagline}. ${t.objective}`).join('\n')
}

async function aiRecommend(ctx: PlanningContext, moment?: UpcomingMoment): Promise<PlayRec[] | null> {
  const user = `${signalsBlock(ctx, moment)}\n\nCAMPAIGNS:\n${templatesBlock()}\n\nRecommend the best plays for this restaurant, strongest first.`
  const parsed = await callStructuredOutput<{ recommended: PlayRec[] }>({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 900 })
  if (!parsed?.recommended) return null
  const seen = new Set<string>()
  const out: PlayRec[] = []
  for (const r of parsed.recommended) {
    if (r && typeof r.id === 'string' && TEMPLATE_BY_ID[r.id] && r.reason?.trim() && !seen.has(r.id)) {
      seen.add(r.id)
      out.push({ id: r.id, reason: r.reason.trim() })
    }
  }
  return out.length ? out.slice(0, 6) : null
}

/* ── Deterministic fallback ── goal-anchored, then signal nudges, then baselines. */
const GOAL_PLAYS: Record<GoalKey, string[]> = {
  'new-customers': ['discover', 'new-menu', 'event'],
  regulars: ['regulars', 'recurring-night', 'winback'],
  'slow-nights': ['fill-shifts', 'recurring-night', 'event'],
  reviews: ['reviews', 'discover'],
}
const REASON: Record<string, string> = {
  'fill-shifts': 'Turn your quiet shifts into covers',
  'recurring-night': 'Build a weekly habit your regulars plan around',
  winback: 'Bring back guests who drifted away',
  'new-menu': 'Got something new? Get people in to try it',
  discover: 'Be found by nearby diners who have never been in',
  regulars: 'Turn new faces into regulars',
  reviews: 'Lift your rating with fresh reviews',
  event: 'Pack your next big date',
}
const BASELINES = ['fill-shifts', 'recurring-night', 'winback', 'new-menu', 'discover']

export function rulesRecommend(ctx: PlanningContext, moment?: UpcomingMoment): PlayRec[] {
  const goal = ctx.request.goalKey ?? ctx.business.goalKey
  const rep = ctx.signals.reputation
  const ordered: { id: string; reason: string; pr: number }[] = []
  const push = (id: string, reason: string, pr: number) => { if (TEMPLATE_BY_ID[id]) ordered.push({ id, reason, pr }) }

  if (moment) push('event', `${moment.label} is ${moment.daysLabel} — pack the date`, 100)
  ;(GOAL_PLAYS[goal] ?? []).forEach((id, i) => push(id, REASON[id] ?? 'A strong fit for your goal', 80 - i))
  if (rep.rating != null && rep.rating < 4.3) push('reviews', `Your rating is ${rep.rating} stars — fresh reviews nudge it up`, 60)
  if (ctx.signals.presence.some((p) => p.completeness < 70)) push('discover', 'Tighten where you show up so new locals find you', 58)
  BASELINES.forEach((id, i) => push(id, REASON[id] ?? '', 40 - i))

  const byId = new Map<string, { id: string; reason: string; pr: number }>()
  for (const r of ordered.sort((a, b) => b.pr - a.pr)) if (!byId.has(r.id)) byId.set(r.id, r)
  return [...byId.values()].sort((a, b) => b.pr - a.pr).slice(0, 6).map(({ id, reason }) => ({ id, reason }))
}

export async function recommendPlays(ctx: PlanningContext, moment?: UpcomingMoment): Promise<{ recommended: PlayRec[]; source: 'ai' | 'rules' }> {
  const ai = await aiRecommend(ctx, moment)
  if (ai && ai.length) return { recommended: ai, source: 'ai' }
  return { recommended: rulesRecommend(ctx, moment), source: 'rules' }
}
