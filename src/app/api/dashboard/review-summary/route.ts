/**
 * GET /api/dashboard/review-summary?clientId=… — the "what customers are
 * saying" block under the insights Reviews tab.
 *
 * Two parts, both grounded in this restaurant's real reviews:
 *   - split: a positive / neutral / negative count derived from the star
 *     ratings (the customer's own signal — 4+ positive, 3 neutral, under 3
 *     negative). Deterministic; every rating lands in exactly one bucket so the
 *     three always sum to the total. Counted over ALL collected reviews.
 *   - summary + loved + improve: ONE real Claude call over the recent written
 *     reviews, anchored to the overall split so it never contradicts the bar.
 *     The model is told to use only what guests wrote, and we additionally drop
 *     any theme phrase whose words don't appear in the reviews, so a fabricated
 *     theme can't reach the owner. Any failure drops the summary, keeps the split.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 25

interface RevRow { rating: number; text: string | null; at: string }
interface Split { positive: number; neutral: number; negative: number; total: number; withText: number }

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

// Page through a review table so the split reflects every collected review, not
// just the first 1000 (PostgREST's hard cap). Safety bound at 4000 rows.
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

// Drop obvious PII before any review text leaves for the model. Review prose is
// public, but emails / phone numbers can slip into it; the model never needs them.
function redact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]')
}

const SUMMARY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'loved', 'improve'],
  properties: {
    summary: { type: 'string', description: 'One or two short, plain sentences on what guests are saying overall, owner-facing, consistent with the overall positive/negative counts given. No em dashes.' },
    loved: { type: 'array', items: { type: 'string' }, description: '2 to 4 very short phrases (2-4 words) guests praise most, drawn ONLY from the reviews, e.g. "the banchan", "friendly staff".' },
    improve: { type: 'array', items: { type: 'string' }, description: '0 to 3 very short phrases (2-4 words) guests raise as problems, drawn ONLY from the reviews. Empty array if guests raise none.' },
  },
}

// Keep a theme only if at least one of its meaningful words actually appears in
// the reviews, so a paraphrase survives but a fabricated theme is dropped.
function groundThemes(arr: string[], haystack: string): string[] {
  return arr.filter((p) => p.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 4 && haystack.includes(w)))
}

async function summarize(items: { rating: number; text: string }[], split: Split, apiKey: string | null): Promise<{ summary: string; loved: string[]; improve: string[] } | null> {
  if (!apiKey || items.length === 0) return null
  const list = items.map((r, i) => `${i + 1}. [${r.rating}-star] ${r.text}`).join('\n')
  const system = `You read a restaurant's customer reviews and tell the owner, plainly, what guests are saying.
Rules:
- Use ONLY what actually appears in the reviews below. Never invent a theme, a dish, or a complaint.
- The summary must match the OVERALL picture from the rating counts you are given (do not call guests unhappy when most ratings are positive, or vice versa).
- "loved" = the things guests praise most, as short 2-4 word phrases.
- "improve" = real problems guests raise, as short phrases. Use an empty array if guests raise none.
- Warm, plain, owner-facing English. Keep the summary to one or two short sentences. No em dashes. Never mention AI.`
  const user = `Overall across all ${split.total} reviews: ${split.positive} positive, ${split.neutral} neutral, ${split.negative} negative.

Recent written reviews (star rating in brackets):
${list}

Summarize what guests are saying, consistent with the overall counts above.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 16000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 900,
        output_config: { format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    const parsed = JSON.parse(text) as { summary?: string; loved?: string[]; improve?: string[] }
    if (!parsed.summary) return null
    const haystack = items.map((i) => i.text.toLowerCase()).join(' ')
    const clean = (arr?: string[]) => groundThemes((arr ?? []).map((s) => String(s).trim()).filter(Boolean), haystack)
    return { summary: parsed.summary.trim(), loved: clean(parsed.loved).slice(0, 4), improve: clean(parsed.improve).slice(0, 3) }
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
  const [g, l] = await Promise.all([
    fetchAll(admin, 'reviews', 'rating, review_text, posted_at', 'posted_at', clientId),
    fetchAll(admin, 'local_reviews', 'rating, text, created_at_platform', 'created_at_platform', clientId),
  ])

  const rows: RevRow[] = [
    ...g.map((r) => ({ rating: Number(r.rating ?? 0), text: (r.review_text as string) ?? null, at: String(r.posted_at ?? '') })),
    ...l.map((r) => ({ rating: Number(r.rating ?? 0), text: (r.text as string) ?? null, at: String(r.created_at_platform ?? '') })),
  ].filter((r) => r.rating > 0)

  // Ranges, not equality, so every rating in [1,5] (including 3.5 / 2.5) lands in
  // exactly one bucket and the three always sum to the total.
  const positive = rows.filter((r) => r.rating >= 4).length
  const neutral = rows.filter((r) => r.rating >= 3 && r.rating < 4).length
  const negative = rows.filter((r) => r.rating < 3).length

  // The most recent reviews that carry text, for the theme summary (PII-redacted).
  const withTextRows = rows
    .filter((r) => r.text && r.text.trim().length > 1)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40)
  const split: Split = { positive, neutral, negative, total: rows.length, withText: withTextRows.length }
  const items = withTextRows.map((r) => ({ rating: r.rating, text: redact(r.text!.trim()).slice(0, 400) }))

  const ai = items.length >= 3 ? await summarize(items, split, readApiKey()) : null

  return NextResponse.json({
    split,
    summary: ai?.summary ?? null,
    loved: ai?.loved ?? [],
    improve: ai?.improve ?? [],
    source: ai ? 'ai' : 'none',
  })
}
