/**
 * GET /api/dashboard/suggestions?clientId=… — the tailored Home "stack".
 *
 * Gathers this restaurant's real signals (approvals, reviews, broken/missing
 * connections, the primary metric trend, the next planning moment), turns them
 * into grounded candidate cards, then makes ONE real Claude call that SELECTS
 * and rewords the best up-to-5 (one reads as "Do this next"). The model only
 * picks candidates by id and may reword copy; it never invents a card or a
 * link, so every action stays real. Any failure falls back to the deterministic
 * ranking — the home is never blocked or wrong.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInbox } from '@/lib/dashboard/get-inbox'
import { getHomeMetrics } from '@/lib/dashboard/get-home-metrics'
import { getMarketingCalendar, daysUntil } from '@/lib/dashboard/marketing-calendar'
import { buildCandidates, markLead, type Suggestion, type SuggestionFacts } from '@/lib/dashboard/suggestions'

export const maxDuration = 20

const METRIC_TAB: Record<string, string> = { interactions: 'Customers', reach: 'Reach', bookings: 'Bookings', reputation: 'Reviews', loyalty: 'Email' }
const ORDER = ['interactions', 'reach', 'bookings', 'reputation', 'loyalty']

function planLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'next week'
  return `in ${Math.round(days / 7)} weeks`
}

// Primary metric week-over-week, mirroring the home transform: the last bucket
// is the in-progress week (partial while GBP lags), so headline off the prior
// complete week, then skip empty trailing weeks.
function primaryDelta(hm: { metrics?: { key: string; hasData?: boolean; week?: { total?: number }[] }[] } | null): SuggestionFacts['metric'] {
  const metrics = hm?.metrics ?? []
  const m = ORDER.map((k) => metrics.find((x) => x.key === k)).find((x) => x && x.hasData)
  if (!m) return null
  const weeks = m.week ?? []
  let ti = Math.max(0, weeks.length - 2)
  while (ti > 0 && (weeks[ti]?.total ?? 0) === 0) ti--
  const total = weeks[ti]?.total ?? 0
  const prev = weeks[ti - 1]?.total ?? 0
  const weekPct = prev === 0 ? (total > 0 ? 100 : 0) : Math.round(((total - prev) / prev) * 100)
  return { label: METRIC_TAB[m.key] ?? m.key, weekPct, monthPct: 0 }
}

function readApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    return m ? m[1].trim() : null
  } catch { return null }
}

const CARD_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      description: 'Up to 5 chosen cards, most important first. The first should read as the single next step.',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'eyebrow', 'title', 'body'],
        properties: {
          id: { type: 'string', description: 'Must be one of the candidate ids exactly' },
          eyebrow: { type: 'string', description: 'A 1-3 word uppercase tag, e.g. DO THIS NEXT, GOOD NEWS, HEADS UP' },
          title: { type: 'string', description: 'Short, warm, plain headline. Keep every number/fact from the candidate.' },
          body: { type: 'string', description: 'One short plain sentence. No em dashes.' },
        },
      },
    },
  },
}

async function refine(candidates: Suggestion[], businessName: string): Promise<Suggestion[] | null> {
  const apiKey = readApiKey()
  if (!apiKey || candidates.length === 0) return null

  const list = candidates.map((c) => `- id "${c.id}" [${c.eyebrow}]: ${c.title} — ${c.body}`).join('\n')
  const system = `You are the trusted operator behind a busy restaurant owner's dashboard. From a list of candidate cards, pick the up-to-5 most useful to surface right now and write each as a calm, friendly, plain-English card the owner will actually act on.
Rules:
- Only choose from the candidate ids given. Never invent a card, a number, or a fact.
- Keep every number and concrete fact from the candidate; you may rephrase for warmth and brevity.
- The FIRST card must be the single most important next step; give it the eyebrow "DO THIS NEXT".
- Vary the other eyebrows naturally (e.g. GOOD NEWS, HEADS UP, WORTH A REPLY, OPPORTUNITY).
- Short sentences. No em dashes. Never mention AI, models, or automation.
- Order by what matters most to the owner today.`
  const user = `Restaurant: ${businessName || 'this restaurant'}
Candidate cards:
${list}

Choose and rewrite the best up to 5.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 14000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1500,
        output_config: { format: { type: 'json_schema', schema: CARD_SCHEMA } },
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    const parsed = JSON.parse(text) as { cards?: { id: string; eyebrow: string; title: string; body: string }[] }
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const seen = new Set<string>()
    const out: Suggestion[] = []
    for (const card of parsed.cards ?? []) {
      const base = byId.get(card.id)
      if (!base || seen.has(card.id)) continue
      seen.add(card.id)
      out.push({ ...base, eyebrow: card.eyebrow?.trim() || base.eyebrow, title: card.title?.trim() || base.title, body: card.body?.trim() || base.body })
      if (out.length >= 5) break
    }
    return out.length ? out : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  const admin = createAdminClient()
  const social = ['instagram', 'facebook', 'tiktok']

  const [inbox, reviewRes, pcRes, hm, bizRes] = await Promise.all([
    getInbox(clientId, access.userId).catch(() => []),
    admin.from('reviews').select('author_name, rating, response_text').eq('client_id', clientId).is('response_text', null).order('rating', { ascending: true }).limit(50),
    admin.from('platform_connections').select('platform, access_token').eq('client_id', clientId),
    getHomeMetrics(clientId).catch(() => null),
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
  ])

  // approvals / tasks from the inbox
  const approvalsCount = inbox.filter((i) => i.kind === 'approval' || i.kind === 'post_review').length
  const tasksCount = inbox.filter((i) => i.kind === 'task').length

  // reviews — unanswered count + the lowest-rated one waiting
  const unansweredRows = reviewRes.data ?? []
  const lowestRow = unansweredRows[0]
  const reviews = {
    unanswered: unansweredRows.length,
    lowest: lowestRow ? { author: (lowestRow.author_name as string) || 'A guest', rating: Number(lowestRow.rating ?? 0) } : null,
  }

  // connections — broken social links (row exists but token dropped) + whether
  // any social is connected at all
  const pcs = pcRes.data ?? []
  const connectedSocial = pcs.filter((p) => p.access_token && social.includes(p.platform as string)).map((p) => p.platform as string)
  const broken = pcs.filter((p) => !p.access_token && social.includes(p.platform as string)).map((p) => p.platform as string)
  const connections = { broken, missingSocial: connectedSocial.length === 0 }

  // next planning moment within ~3 weeks
  const cal = getMarketingCalendar(new Date(), 30)
  const moment = cal.find((m) => daysUntil(m.date) >= 0 && m.weight >= 3)
  const plan = moment ? { label: moment.label, daysLabel: planLabel(daysUntil(moment.date)), hook: moment.hook } : null

  const facts: SuggestionFacts = {
    approvalsCount,
    tasksCount,
    metric: primaryDelta(hm as unknown as Parameters<typeof primaryDelta>[0]),
    reviews,
    connections,
    plan,
  }

  const candidates = buildCandidates(facts)
  const refined = await refine(candidates, (bizRes.data?.name as string) ?? '')
  const suggestions = markLead((refined ?? candidates).slice(0, 5))

  return NextResponse.json({ suggestions, source: refined ? 'ai' : 'ranked' })
}
