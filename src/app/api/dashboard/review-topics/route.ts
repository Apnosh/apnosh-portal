/**
 * GET /api/dashboard/review-topics?clientId=… — the AI aspect analysis for the
 * insights Reviews view: a plain owner-facing summary + per-topic positive /
 * negative counts with a direction (improving / slipping).
 *
 * Split out from review-summary so the fast deterministic data (rating,
 * histogram, replies, sources) paints instantly and this slower model call
 * fills in the topic breakdown after.
 *
 * Grounded: the model only tags WHICH reviews speak positively / negatively
 * about each topic; the counts and the direction are computed here from the
 * real review order, so a topic can never claim more mentions than there are
 * reviews, and topic names / quotes must appear in the reviews.
 */
import { after, NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 25

interface TopicEvidence { rating: number; text: string; at: string; side: 'positive' | 'negative' }
interface Topic { name: string; positive: number; negative: number; mentions: number; direction: 'up' | 'down' | 'flat'; quote: string; negQuote: string; /** the actual reviews behind the count, so it can be checked rather than believed */ evidence: TopicEvidence[] }

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

async function fetchAll(admin: SupabaseClient, table: string, cols: string, dateCol: string, clientId: string): Promise<Record<string, unknown>[]> {
  const page = 1000
  const out: Record<string, unknown>[] = []
  for (let from = 0; from < 4000; from += page) {
    const res = await admin.from(table).select(cols).eq('client_id', clientId).order(dateCol, { ascending: false }).range(from, from + page - 1)
    const batch = (res.data ?? []) as unknown as Record<string, unknown>[]
    out.push(...batch)
    if (batch.length < page) break
  }
  return out
}

function redact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]')
}

function grounded(phrase: string, haystack: string): boolean {
  return phrase.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 4 && haystack.includes(w))
}

const ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'topics'],
  properties: {
    summary: { type: 'string', description: 'One or two short, plain, warm owner-facing sentences on the overall picture, consistent with the positive/negative counts given. No em dashes.' },
    topics: {
      type: 'array',
      description: 'The concrete topics guests mention (a dish, service, wait time, value, ambiance, cleanliness, etc). Only topics that at least two reviews mention.',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'positive', 'negative'],
        properties: {
          name: { type: 'string', description: '1-3 words, concrete. Name the dish when guests do, e.g. "Brisket", "Service", "Wait time", "Value".' },
          positive: { type: 'array', items: { type: 'integer' }, description: 'Review numbers that speak POSITIVELY about this topic.' },
          negative: { type: 'array', items: { type: 'integer' }, description: 'Review numbers that speak NEGATIVELY about this topic.' },
          quotePos: { type: 'string', description: 'A few words a guest actually wrote speaking POSITIVELY about this topic, verbatim. Empty string if no positive mention.' },
          quoteNeg: { type: 'string', description: 'A few words a guest actually wrote speaking NEGATIVELY about this topic, verbatim. Empty string if no negative mention.' },
        },
      },
    },
  },
}

async function analyze(items: { rating: number; text: string }[], counts: { positive: number; neutral: number; negative: number; total: number }, apiKey: string | null, lang: 'en' | 'es'): Promise<{ summary: string; rawTopics: { name?: string; positive?: number[]; negative?: number[]; quotePos?: string; quoteNeg?: string }[] } | null> {
  if (!apiKey || items.length === 0) return null
  const list = items.map((r, i) => `${i + 1}. [${r.rating}-star] ${r.text}`).join('\n')
  /* The prompt used to end 'owner-facing English', so a Spanish-reading owner got
     Spanish reviews summarised into English topic names. The owner's language is
     recorded; the quotes stay in the guest's words either way. */
  const system = `You read a restaurant's customer reviews and break down what guests say by TOPIC, for the owner.
Rules:
- Use ONLY what actually appears in the reviews below. Never invent a topic, a dish, or a complaint.
- A topic is a concrete thing guests mention: a specific dish, service, wait time, value, ambiance, cleanliness, portion size, etc. Name the dish when guests do.
- For each topic, list the review numbers that speak POSITIVELY about it and the ones that speak NEGATIVELY about it. One review can appear under several topics, and can be positive on one topic and negative on another (e.g. "great food but slow service").
- Only include a topic that at least two reviews mention.
- quotePos / quoteNeg: a few words a guest actually wrote about the topic, verbatim — one where they praise it, one where they knock it. Leave a side empty if there's no such mention.
- summary must match the OVERALL picture from the rating counts you are given.
- Warm, plain and owner-facing. No em dashes. Never mention AI.
- WRITE THE TOPIC NAMES AND THE SUMMARY IN ${lang === 'es' ? 'SPANISH' : 'ENGLISH'}, whatever language the reviews themselves are in. This is the owner's own reading language. Quotes stay exactly as the guest wrote them, in their language, never translated.`
  const user = `Overall across all ${counts.total} reviews: ${counts.positive} positive, ${counts.neutral} neutral, ${counts.negative} negative.

Reviews, newest first (number, star rating, text):
${list}

Break the topics down and give the overall summary.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 18000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1600,
        output_config: { format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    const parsed = JSON.parse(text) as { summary?: string; topics?: { name?: string; positive?: number[]; negative?: number[]; quotePos?: string; quoteNeg?: string }[] }
    if (!parsed.summary) return null
    return { summary: parsed.summary.trim(), rawTopics: parsed.topics ?? [] }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function buildTopics(raw: { name?: string; positive?: number[]; negative?: number[]; quotePos?: string; quoteNeg?: string }[], items: { rating: number; text: string; at: string }[]): Topic[] {
  const N = items.length
  const half = Math.max(1, Math.floor(N / 2))
  const haystack = items.map((i) => i.text.toLowerCase()).join(' ')
  const out: Topic[] = []
  for (const t of raw) {
    const name = String(t.name ?? '').trim()
    if (!name || !grounded(name, haystack)) continue
    const to0 = (arr?: number[]) => (arr ?? []).map((n) => Number(n) - 1).filter((i) => Number.isInteger(i) && i >= 0 && i < N)
    const posSet = new Set(to0(t.positive))
    const negSet = new Set(to0(t.negative))
    for (const i of [...posSet]) if (negSet.has(i)) { posSet.delete(i); negSet.delete(i) }
    const pos = [...posSet]; const neg = [...negSet]
    const mentions = pos.length + neg.length
    if (mentions < 2) continue
    const rPos = pos.filter((i) => i < half).length; const rNeg = neg.filter((i) => i < half).length
    const oPos = pos.filter((i) => i >= half).length; const oNeg = neg.filter((i) => i >= half).length
    let direction: Topic['direction'] = 'flat'
    if (rPos + rNeg >= 1 && oPos + oNeg >= 1) {
      const rNet = (rPos - rNeg) / (rPos + rNeg)
      const oNet = (oPos - oNeg) / (oPos + oNeg)
      if (rNet - oNet > 0.34) direction = 'up'
      else if (rNet - oNet < -0.34) direction = 'down'
    }
    let quote = String(t.quotePos ?? '').trim()
    if (quote && !grounded(quote, haystack)) quote = ''
    let negQuote = String(t.quoteNeg ?? '').trim()
    if (negQuote && !grounded(negQuote, haystack)) negQuote = ''
    /* THE REVIEWS BEHIND THE NUMBER. The owner who fired an agency over invented
       figures said she would count them herself, and until now she could not:
       the indices that produced the count were resolved here and thrown away.
       They are the same rows the count is made of, so a tap can show exactly
       what was counted. Capped so one popular topic cannot carry fifty reviews
       into the payload. */
    const eviOf = (idx: number[], side: 'positive' | 'negative'): TopicEvidence[] =>
      idx.map((i) => ({ rating: items[i].rating, text: items[i].text.slice(0, 240), at: items[i].at, side }))
    const evidence = [...eviOf(pos, 'positive'), ...eviOf(neg, 'negative')]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12)
    out.push({ name, positive: pos.length, negative: neg.length, mentions, direction, quote, negQuote, evidence })
  }
  // Most-talked-about topics first; ties broken by net sentiment.
  out.sort((a, b) => {
    if (b.mentions !== a.mentions) return b.mentions - a.mentions
    const na = (a.positive - a.negative) / a.mentions
    const nb = (b.positive - b.negative) / b.mentions
    return nb - na
  })
  return out.slice(0, 8)
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  const admin = createAdminClient()
  const [g, l] = await Promise.all([
    fetchAll(admin, 'reviews', 'rating, review_text, posted_at', 'posted_at', clientId),
    fetchAll(admin, 'local_reviews', 'rating, text, created_at_platform', 'created_at_platform', clientId),
  ])

  /* ?from&to (YYYY-MM-DD): read only the reviews posted in that span, the same days the Insights
     graph shows (owner 2026-09-15); the window is part of the cache signature below */
  const from = req.nextUrl.searchParams.get('from') ?? '', to = req.nextUrl.searchParams.get('to') ?? ''
  const inWindow = (at: string) => { const d = at.slice(0, 10); return (!from || d >= from) && (!to || d <= to) }
  const rows = [
    ...g.map((r) => ({ rating: Number(r.rating ?? 0), text: (r.review_text as string) ?? null, at: String(r.posted_at ?? '') })),
    ...l.map((r) => ({ rating: Number(r.rating ?? 0), text: (r.text as string) ?? null, at: String(r.created_at_platform ?? '') })),
  ].filter((r) => r.rating > 0 && inWindow(r.at))

  const lang = await (async () => {
    try {
      const { getClientLanguage } = await import('@/lib/i18n/language')
      return await getClientLanguage(clientId)
    } catch { return 'en' as const }
  })()
  /* THE READ IS CACHED PER WINDOW AND SERVED AT ONCE (owner 2026-09-15: "what people say
     should load instantly; it doesn't need to update more than once a day"). One cache row per
     client holds a map of windows; a window's entry is served straight from the cache whenever
     it exists, and is recomputed in the background when it is older than a day or the reviews
     behind it changed. The first read of a window is the only one that waits on the model. */
  const winKey = `${from || 'all'}:${to || 'all'}`
  const sig = `v4:${lang}:${winKey}:${rows.length}:${rows.reduce((m, r) => (r.at > m ? r.at : m), '')}`
  type Entry = { summary: string | null; topics: Topic[]; sig: string; computed_at: string }
  type Store = { windows?: Record<string, Entry>; summary?: string | null; topics?: Topic[] }
  const DAY = 24 * 60 * 60 * 1000
  let store: Store | null = null
  try {
    const { data: cached } = await admin.from('review_topic_cache').select('payload, review_sig, computed_at').eq('client_id', clientId).maybeSingle()
    if (cached?.payload) {
      store = cached.payload as Store
      /* an older row (one window, top-level summary/topics) counts as the all-time window */
      if (!store.windows && Array.isArray(store.topics)) store = { windows: { 'all:all': { summary: store.summary ?? null, topics: store.topics, sig: String(cached.review_sig ?? ''), computed_at: String(cached.computed_at ?? new Date(0).toISOString()) } } }
    }
  } catch { /* cache table absent — compute live */ }

  const counts = {
    positive: rows.filter((r) => r.rating >= 4).length,
    neutral: rows.filter((r) => r.rating >= 3 && r.rating < 4).length,
    negative: rows.filter((r) => r.rating < 3).length,
    total: rows.length,
  }
  const withTextRows = rows
    .filter((r) => r.text && r.text.trim().length > 1)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50)
  const items = withTextRows.map((r) => ({ rating: r.rating, text: redact(r.text!.trim()).slice(0, 400), at: r.at }))

  /* compute this window and write it into the map (other windows kept) */
  const compute = async (): Promise<Entry | null> => {
    const ai = items.length >= 3 ? await analyze(items, counts, readApiKey(), lang) : null
    if (!ai) return null
    const entry: Entry = { summary: ai.summary, topics: buildTopics(ai.rawTopics, items), sig, computed_at: new Date().toISOString() }
    try {
      const { data: latest } = await admin.from('review_topic_cache').select('payload').eq('client_id', clientId).maybeSingle()
      const cur = (latest?.payload as Store | null) ?? store ?? {}
      const windows = { ...(cur.windows ?? {}), [winKey]: entry }
      await admin.from('review_topic_cache').upsert(
        { client_id: clientId, payload: { windows }, review_sig: sig, computed_at: entry.computed_at },
        { onConflict: 'client_id' },
      )
    } catch { /* ignore cache write failure */ }
    return entry
  }

  const entry = store?.windows?.[winKey]
  if (entry) {
    const fresh = Date.now() - Date.parse(entry.computed_at) < DAY
    if (!fresh && entry.sig !== sig) after(async () => { try { await compute() } catch { /* next open tries again */ } })
    return NextResponse.json({ summary: entry.summary ?? null, topics: entry.topics ?? [], source: 'cache' })
  }
  const made = await compute()
  return NextResponse.json({ summary: made?.summary ?? null, topics: made?.topics ?? [], source: made ? 'ai' : 'none' })
}
