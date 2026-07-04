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
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 25

interface Topic { name: string; positive: number; negative: number; mentions: number; direction: 'up' | 'down' | 'flat'; quote: string }

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
          quote: { type: 'string', description: 'One short phrase a guest actually wrote about this topic, a few words, verbatim.' },
        },
      },
    },
  },
}

async function analyze(items: { rating: number; text: string }[], counts: { positive: number; neutral: number; negative: number; total: number }, apiKey: string | null): Promise<{ summary: string; rawTopics: { name?: string; positive?: number[]; negative?: number[]; quote?: string }[] } | null> {
  if (!apiKey || items.length === 0) return null
  const list = items.map((r, i) => `${i + 1}. [${r.rating}-star] ${r.text}`).join('\n')
  const system = `You read a restaurant's customer reviews and break down what guests say by TOPIC, for the owner.
Rules:
- Use ONLY what actually appears in the reviews below. Never invent a topic, a dish, or a complaint.
- A topic is a concrete thing guests mention: a specific dish, service, wait time, value, ambiance, cleanliness, portion size, etc. Name the dish when guests do.
- For each topic, list the review numbers that speak POSITIVELY about it and the ones that speak NEGATIVELY about it. One review can appear under several topics, and can be positive on one topic and negative on another (e.g. "great food but slow service").
- Only include a topic that at least two reviews mention.
- quote: a few words a guest actually wrote about the topic, verbatim.
- summary must match the OVERALL picture from the rating counts you are given.
- Warm, plain, owner-facing English. No em dashes. Never mention AI.`
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
    const parsed = JSON.parse(text) as { summary?: string; topics?: { name?: string; positive?: number[]; negative?: number[]; quote?: string }[] }
    if (!parsed.summary) return null
    return { summary: parsed.summary.trim(), rawTopics: parsed.topics ?? [] }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function buildTopics(raw: { name?: string; positive?: number[]; negative?: number[]; quote?: string }[], items: { rating: number; text: string }[]): Topic[] {
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
    let quote = String(t.quote ?? '').trim()
    if (quote && !grounded(quote, haystack)) quote = ''
    out.push({ name, positive: pos.length, negative: neg.length, mentions, direction, quote })
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

  const rows = [
    ...g.map((r) => ({ rating: Number(r.rating ?? 0), text: (r.review_text as string) ?? null, at: String(r.posted_at ?? '') })),
    ...l.map((r) => ({ rating: Number(r.rating ?? 0), text: (r.text as string) ?? null, at: String(r.created_at_platform ?? '') })),
  ].filter((r) => r.rating > 0)

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
  const items = withTextRows.map((r) => ({ rating: r.rating, text: redact(r.text!.trim()).slice(0, 400) }))

  const ai = items.length >= 3 ? await analyze(items, counts, readApiKey()) : null
  const topics = ai ? buildTopics(ai.rawTopics, items) : []

  return NextResponse.json({ summary: ai?.summary ?? null, topics, source: ai ? 'ai' : 'none' })
}
