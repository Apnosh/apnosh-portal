import 'server-only'
/**
 * Part 3 — Sequence & Schedule (spec §5). Code owns the spine: it phases the
 * priced lines (foundations first, then the ongoing programs) and lays out a
 * week-relative content calendar. The model only RE-THEMES the beat labels to
 * the bet + occasion — it never picks a week (same discipline as never pricing).
 * Falls back to code-written labels when the model is unavailable.
 */
import type { CampaignBrief, ContentBeat, GoalKey, LineItem } from '@/lib/campaigns/types'
import type { Diagnosis, PlanningContext } from './types'
import { callStructuredOutput } from './anthropic'

const KPI: Record<GoalKey, string> = {
  'new-customers': 'New guests discovering you',
  regulars: 'Repeat visits per month',
  'slow-nights': 'Covers on your slow shifts',
  reviews: 'Fresh reviews and a higher rating',
}

/** serviceId keyword -> beat type + channel; null = not a content-producing line. */
function beatKind(id: string): { type: string; channel: string } | null {
  if (/gbp|local-seo/.test(id)) return { type: 'post', channel: 'Google' }
  if (/video/.test(id)) return { type: 'reel', channel: 'Social' }
  if (/social|creator|truck|concierge|pr-media/.test(id)) return { type: 'post', channel: 'Social' }
  if (/newsletter|welcome|email|second|vip/.test(id)) return { type: 'email', channel: 'Email' }
  if (/sms|reminder/.test(id)) return { type: 'sms', channel: 'SMS' }
  if (/review|feedback/.test(id)) return { type: 'post', channel: 'Reviews' }
  if (/ads/.test(id)) return { type: 'post', channel: 'Paid' }
  if (/event|offer|seasonal|giftcard|bar-events/.test(id)) return { type: 'post', channel: 'Social' }
  return null
}

/** Which weeks of the first month a content line lands in. */
function beatsFor(it: LineItem): number[] {
  if (/newsletter/.test(it.serviceId)) return [4] // monthly cadence
  if (it.cadence.kind === 'per-occurrence') {
    const n = Math.min(3, Math.max(1, it.qty ?? 1))
    return Array.from({ length: n }, (_, i) => i + 1)
  }
  if (it.cadence.kind === 'recurring') return [1, 2, 3] // a weekly-ish engine
  return [1] // a one-time program -> a single kickoff beat
}

function phaseRank(it: LineItem): number {
  if (it.stage === 'foundation') return 0
  if (it.cadence.kind === 'one-time') return 1
  return 2
}
function whenLabel(it: LineItem): string {
  return it.stage === 'foundation' || it.cadence.kind === 'one-time' ? 'Setup' : 'Ongoing'
}

interface Skeleton { week: number; type: string; channel: string; service: string; label: string }

function buildSkeleton(items: LineItem[]): Skeleton[] {
  const out: Skeleton[] = []
  for (const it of items) {
    if (!it.included || it.optOut) continue
    if (it.stage === 'foundation') continue // setup work, not a content beat
    const kind = beatKind(it.serviceId)
    if (!kind) continue
    for (const week of beatsFor(it)) {
      if (out.length >= 12) break
      out.push({ week, type: kind.type, channel: kind.channel, service: it.plain || it.name, label: it.plain || it.name })
    }
    if (out.length >= 12) break
  }
  return out.sort((a, b) => a.week - b.week)
}

const BEATS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['beats'],
  properties: {
    beats: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['index', 'label'], properties: { index: { type: 'integer' }, label: { type: 'string' } } },
    },
  },
}
const SYSTEM = `You write a short content calendar for a restaurant. For each numbered beat you are given
its week, type (reel/post/email/sms), channel, and the service behind it. Write one concrete label
for each: what that piece actually says, tied to the plan's bet and occasion. Plain language, under
10 words, no jargon, no em dashes. Keep the same beats; only write the labels.`

async function retheme(skeleton: Skeleton[], d: Diagnosis, occasion?: string): Promise<Skeleton[]> {
  if (!skeleton.length) return skeleton
  const list = skeleton.map((b, i) => `${i}. week ${b.week}, ${b.type} on ${b.channel} (${b.service})`).join('\n')
  const user = `Bet: ${d.bet}\n${occasion ? `Occasion: ${occasion}\n` : ''}\nBeats:\n${list}\n\nWrite a label for each index.`
  const parsed = await callStructuredOutput<{ beats: { index: number; label: string }[] }>({ system: SYSTEM, user, schema: BEATS_SCHEMA, maxTokens: 900 })
  if (!parsed?.beats) return skeleton
  const byIdx = new Map(parsed.beats.filter((b) => typeof b.index === 'number' && b.label?.trim()).map((b) => [b.index, b.label.trim()]))
  return skeleton.map((b, i) => ({ ...b, label: byIdx.get(i) ?? b.label }))
}

/** Phase the lines + lay out (and theme) the content calendar. */
export async function sequencePlan(ctx: PlanningContext, d: Diagnosis, items: LineItem[]): Promise<{ items: LineItem[]; brief: CampaignBrief }> {
  // 1) phase the lines (code): foundations first; tag each line with a `when`.
  const phased = items
    .map((it) => ({ ...it, when: it.when ?? whenLabel(it) }))
    .sort((a, b) => phaseRank(a) - phaseRank(b))

  // 2) lay out the week-relative content calendar (code), then re-theme labels (model).
  const themed = await retheme(buildSkeleton(phased), d, ctx.request.occasion)
  const contentBeats: ContentBeat[] = themed.map((b) => ({ week: b.week, type: b.type, label: b.label, channel: b.channel }))

  const goal = ctx.request.goalKey ?? ctx.business.goalKey
  const brief: CampaignBrief = {
    templateId: 'ai-plan',
    objective: d.bet,
    audienceIds: [],
    channelIds: Array.from(new Set(contentBeats.map((b) => b.channel))),
    kpi: KPI[goal],
    durationWeeks: null,
    projected: '',
    contentBeats,
    spec: { bindingConstraint: d.bindingConstraint, bet: d.bet, ...(ctx.request.occasion ? { occasion: ctx.request.occasion } : {}) },
  }
  return { items: phased, brief }
}
