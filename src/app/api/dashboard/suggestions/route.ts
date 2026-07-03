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
import { assembleSignals } from '@/lib/campaigns/planning/signals'

export const maxDuration = 30

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
      description: 'Up to 5 chosen cards, most important first. The first is the single next step.',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'title', 'body'],
        properties: {
          id: { type: 'string', description: 'Must be one of the candidate ids exactly' },
          title: { type: 'string', description: 'Short, warm, plain headline. Keep every number and fact from the candidate exactly.' },
          body: { type: 'string', description: 'One short plain sentence. Keep every number from the candidate exactly. No em dashes.' },
        },
      },
    },
  },
}

// True only when `candidate` carries exactly the same multiset of numbers as
// `base`, so an AI rewrite can never drop, round, or invent a figure shown to
// the owner. (Eyebrow + link are kept deterministic, so this guards the copy.)
function numbersPreserved(base: string, candidate?: string): boolean {
  if (!candidate) return false
  const nums = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).sort()
  const a = nums(base), b = nums(candidate)
  return a.length === b.length && a.every((n, i) => n === b[i])
}

async function refine(candidates: Suggestion[], businessName: string): Promise<Suggestion[] | null> {
  const apiKey = readApiKey()
  if (!apiKey || candidates.length === 0) return null

  const list = candidates.map((c) => `- id "${c.id}" [${c.eyebrow}]: ${c.title} — ${c.body}`).join('\n')
  const system = `You are the trusted operator behind a busy restaurant owner's dashboard. From a list of candidate cards, pick the up-to-5 most useful to surface right now and write each as a calm, friendly, plain-English card the owner will actually act on.
Rules:
- Only choose from the candidate ids given. Never invent a card, a number, or a fact.
- Keep every number and concrete fact from the candidate EXACTLY; you may only rephrase the surrounding words for warmth and brevity.
- Return the cards in priority order: the FIRST card is the single most important next step.
- Short sentences. No em dashes. Never mention AI, models, or automation.`
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
    const parsed = JSON.parse(text) as { cards?: { id: string; title?: string; body?: string }[] }
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const seen = new Set<string>()
    const out: Suggestion[] = []
    for (const card of parsed.cards ?? []) {
      const base = byId.get(card.id)
      if (!base || seen.has(card.id)) continue
      seen.add(card.id)
      // Accept the model's wording only when it preserves every number from the
      // candidate; otherwise keep the grounded copy. Eyebrow + link come from
      // the candidate (spread), so the model can never show a wrong figure or a
      // dead link — only reword, reorder, and select.
      const title = numbersPreserved(base.title, card.title) ? (card.title!.trim() || base.title) : base.title
      const body = numbersPreserved(base.body, card.body) ? (card.body!.trim() || base.body) : base.body
      out.push({ ...base, title, body })
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

  const [inbox, reviewRes, pcRes, hm, bizRes, sig, campRes] = await Promise.all([
    getInbox(clientId, access.userId).catch(() => []),
    admin.from('reviews').select('author_name, rating, response_text').eq('client_id', clientId).is('response_text', null).order('rating', { ascending: true }).limit(50),
    admin.from('platform_connections').select('platform, access_token').eq('client_id', clientId),
    getHomeMetrics(clientId).catch(() => null),
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    assembleSignals(clientId).catch(() => null),
    // Does the account already have a campaign live? Steps down the "start a campaign" nudges.
    admin.from('campaigns').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'shipped'),
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

  // connections — a dropped link is a channel_connections error/expired/
  // disconnected row, which getInbox already surfaces as kind:'connection'
  // (with the platform label as senderName). It is NOT a null token on
  // platform_connections (deauth DELETES that row), so use the inbox signal.
  // missingSocial = no social platform connected at all (drives "Connect IG").
  const pcs = pcRes.data ?? []
  const connectedSocial = pcs.filter((p) => p.access_token && social.includes(p.platform as string))
  const broken = inbox.filter((i) => i.kind === 'connection').map((i) => i.senderName || '').filter(Boolean) as string[]
  const connections = { broken, missingSocial: connectedSocial.length === 0 }

  // the nearest few planning moments worth a post, so the deck has a few real
  // cards to flip through even on a quiet week
  const cal = getMarketingCalendar(new Date(), 45)
  const plans = cal
    .filter((m) => daysUntil(m.date) >= 0 && m.weight >= 3)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
    .slice(0, 3)
    .map((m) => ({ label: m.label, daysLabel: planLabel(daysUntil(m.date)), hook: m.hook }))

  // Marketing quick-wins from the live planning signals: the weakest found-ness
  // channel, plus what guests praise / gripe about most. Code owns the facts +
  // the fix link; the AI pass only rewords.
  const worstChannel = (sig?.presence ?? []).filter((p) => p.completeness < 70 && p.gaps.length).sort((a, b) => a.completeness - b.completeness)[0]
  const shortCh = (n: string) => (/google/i.test(n) ? 'Google' : n)
  const themes = sig?.reputation.themes ?? []
  const praised = themes.filter((t) => t.good).sort((a, b) => b.mentions - a.mentions)[0]
  const gripe = themes.filter((t) => !t.good).sort((a, b) => b.mentions - a.mentions)[0]
  const quickWins = {
    listingFix: worstChannel ? { channel: shortCh(worstChannel.name), gap: worstChannel.gaps[0] } : undefined,
    feature: praised?.label,
    fixTheme: gripe?.label,
  }

  const facts: SuggestionFacts = {
    approvalsCount,
    tasksCount,
    metric: primaryDelta(hm as unknown as Parameters<typeof primaryDelta>[0]),
    reviews,
    connections,
    plans,
    quickWins,
    hasActiveCampaigns: (campRes.count ?? 0) > 0,
  }

  const candidates = buildCandidates(facts)
  const refined = await refine(candidates, (bizRes.data?.name as string) ?? '')
  const chosen = refined ?? candidates

  // Obligations (waiting approvals, a low review, a dropped connection) must
  // never be silently dropped by the AI selection: Home pins them and reads an
  // empty deck as "all caught up", so an omitted obligation would be a lie.
  // Force every obligation candidate to the front (highest priority first),
  // preferring the model's reworded copy when it kept the card. Soft cards then
  // fill the remaining slots in the model's chosen order.
  const chosenById = new Map(chosen.map((c) => [c.id, c]))
  const obligationCards = candidates
    .filter((c) => c.obligation)
    .map((c) => chosenById.get(c.id) ?? c)
    .sort((a, b) => b.priority - a.priority)
  const oblIds = new Set(obligationCards.map((c) => c.id))
  const softCards = chosen.filter((c) => !oblIds.has(c.id))

  // Backfill the deck up to 5 from the remaining grounded candidates the model
  // left out. The AI's job is to order, reword, and choose the lead — not to
  // shrink the stack: the owner asked for "up to 5 at a time", so whenever there
  // are several real signals, show several (a single curated card reads empty).
  const usedIds = new Set([...oblIds, ...softCards.map((c) => c.id)])
  const backfill = candidates.filter((c) => !usedIds.has(c.id)).sort((a, b) => b.priority - a.priority)
  // Dedup by id before capping — a fact source can yield the same id twice (e.g.
  // two dropped connections sharing a channel label), and a doubled card would
  // also double the "DO THIS NEXT" label that markLead sets.
  const ordered = [...new Map([...obligationCards, ...softCards, ...backfill].map((c) => [c.id, c])).values()]
  const suggestions = markLead(ordered.slice(0, 5))

  return NextResponse.json({ suggestions, source: refined ? 'ai' : 'ranked' })
}
