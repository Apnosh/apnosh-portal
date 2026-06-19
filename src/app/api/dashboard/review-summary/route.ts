/**
 * GET /api/dashboard/review-summary?clientId=… — the "what customers are
 * saying" block under the insights Reviews tab.
 *
 * Two parts, both grounded in this restaurant's real reviews:
 *   - split: a positive / neutral / negative count derived from the star
 *     ratings (the customer's own signal — 4-5 positive, 3 neutral, 1-2
 *     negative). Deterministic, always returned.
 *   - summary + loved + improve: ONE real Claude call that summarizes the
 *     review TEXT into a plain sentence plus the themes guests praise and the
 *     ones they raise as problems. The model is told to use only what appears
 *     in the reviews, so it can never invent a dish or a complaint. Any failure
 *     just drops the summary and keeps the split.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 25

interface RevRow { rating: number; text: string | null; at: string }

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

const SUMMARY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'loved', 'improve'],
  properties: {
    summary: { type: 'string', description: 'One or two short, plain sentences on what guests are saying overall, owner-facing. No em dashes.' },
    loved: { type: 'array', items: { type: 'string' }, description: '2 to 4 very short phrases (2-4 words) guests praise most, drawn ONLY from the reviews, e.g. "the banchan", "friendly staff".' },
    improve: { type: 'array', items: { type: 'string' }, description: '0 to 3 very short phrases (2-4 words) guests raise as problems, drawn ONLY from the reviews. Empty array if guests raise none.' },
  },
}

async function summarize(items: { rating: number; text: string }[], apiKey: string | null): Promise<{ summary: string; loved: string[]; improve: string[] } | null> {
  if (!apiKey || items.length === 0) return null
  const list = items.map((r, i) => `${i + 1}. [${r.rating}-star] ${r.text}`).join('\n')
  const system = `You read a restaurant's customer reviews and tell the owner, plainly, what guests are saying.
Rules:
- Use ONLY what actually appears in the reviews. Never invent a theme, a dish, or a complaint.
- "loved" = the things guests praise most, as short 2-4 word phrases.
- "improve" = real problems guests raise, as short phrases. Use an empty array if guests raise none.
- Warm, plain, owner-facing English. Keep the summary to one or two short sentences. No em dashes. Never mention AI.`
  const user = `Recent reviews (star rating in brackets):\n${list}\n\nSummarize what guests are saying.`

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
    const clean = (arr?: string[]) => (arr ?? []).map((s) => String(s).trim()).filter(Boolean)
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
    admin.from('reviews').select('rating, review_text, posted_at').eq('client_id', clientId).order('posted_at', { ascending: false }).limit(300),
    admin.from('local_reviews').select('rating, text, created_at_platform').eq('client_id', clientId).order('created_at_platform', { ascending: false }).limit(300),
  ])

  const rows: RevRow[] = [
    ...((g.data ?? []) as Record<string, unknown>[]).map((r) => ({ rating: Number(r.rating ?? 0), text: (r.review_text as string) ?? null, at: String(r.posted_at ?? '') })),
    ...((l.data ?? []) as Record<string, unknown>[]).map((r) => ({ rating: Number(r.rating ?? 0), text: (r.text as string) ?? null, at: String(r.created_at_platform ?? '') })),
  ].filter((r) => r.rating > 0)

  const positive = rows.filter((r) => r.rating >= 4).length
  const neutral = rows.filter((r) => r.rating === 3).length
  const negative = rows.filter((r) => r.rating <= 2).length

  // The most recent reviews that actually carry text, for the theme summary.
  const withText = rows
    .filter((r) => r.text && r.text.trim().length > 1)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40)
    .map((r) => ({ rating: r.rating, text: r.text!.trim().slice(0, 400) }))

  const ai = withText.length >= 3 ? await summarize(withText, readApiKey()) : null

  return NextResponse.json({
    split: { positive, neutral, negative, total: rows.length, withText: withText.length },
    summary: ai?.summary ?? null,
    loved: ai?.loved ?? [],
    improve: ai?.improve ?? [],
    source: ai ? 'ai' : 'none',
  })
}
