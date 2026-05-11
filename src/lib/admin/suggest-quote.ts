'use server'

/**
 * AI quote suggestion. Reads a content request + the client's plan
 * state + the pricing rubric, returns a structured recommendation:
 *   - in_plan / quote / escalate
 *   - confidence 0-1
 *   - one-sentence reasoning
 *   - suggested quote (title, line items, strategist message,
 *     turnaround) when recommendedAction === 'quote'
 *
 * Run on request submission and stored on client_tasks.ai_analysis.
 * The strategist queue reads this and renders a confidence badge.
 * The quote builder uses it to pre-fill the form.
 *
 * Cheap. ~$0.003 per call with Sonnet. At 250 requests/day that's
 * ~$0.75/day of Claude spend. Negligible.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 700

export interface SuggestedQuote {
  title: string
  lineItems: Array<{
    label: string
    qty: number
    unitPrice: number
    total: number
    notes?: string
  }>
  strategistMessage: string
  estimatedTurnaroundDays: number
}

export interface QuoteSuggestion {
  recommendedAction: 'in_plan' | 'quote' | 'escalate'
  confidence: number
  reasoning: string
  suggestedQuote?: SuggestedQuote
  model: string
  analyzedAt: string
}

export interface SuggestInput {
  /** The free-text request body. */
  requestText: string
  /** Loose type hint from the request form. */
  requestType?: string | null
  /** Asset links the client provided (if any). */
  assetLinks?: string | null
  /** Optional desired-by date (ISO). */
  desiredDate?: string | null
  /** Platforms the client picked, if any. */
  platforms?: string[]
  clientId: string
}

export async function suggestQuoteForRequest(input: SuggestInput): Promise<QuoteSuggestion | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  // Pull plan state + rubric in parallel.
  const admin = createAdminClient()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const [clientRow, usageRes, rubricRes] = await Promise.all([
    admin
      .from('clients')
      .select('tier, monthly_rate, allotments')
      .eq('id', input.clientId)
      .maybeSingle(),
    admin
      .from('scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', input.clientId)
      .gte('created_at', monthStart),
    admin
      .from('pricing_rubric')
      .select('label, unit_price, category, blurb')
      .eq('active', true)
      .order('display_order', { ascending: true }),
  ])

  const tier = (clientRow.data?.tier as string | null) ?? 'unknown'
  const allotments = (clientRow.data?.allotments as Record<string, number> | null) ?? {}
  const socialAllotment = allotments.social_posts_per_month ?? null
  const used = usageRes.count ?? 0
  const remaining = socialAllotment != null ? Math.max(0, socialAllotment - used) : null
  const rubric = rubricRes.data ?? []

  const planSummary = socialAllotment != null
    ? `Tier: ${tier}. Monthly social allotment: ${socialAllotment} posts. Used so far this month: ${used}. Remaining: ${remaining}.`
    : `Tier: ${tier}. No fixed social allotment defined.`

  const rubricSummary = rubric.length === 0
    ? 'No pricing rubric configured.'
    : rubric
        .map(r => `- ${r.label}: $${Number(r.unit_price).toFixed(0)} (${r.category}${r.blurb ? ' — ' + r.blurb : ''})`)
        .join('\n')

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const userMessage = [
      `=== Client plan ===`,
      planSummary,
      '',
      `=== Pricing rubric ===`,
      rubricSummary,
      '',
      `=== Client request ===`,
      input.requestType ? `Type hint: ${input.requestType}` : '',
      input.platforms?.length ? `Platforms: ${input.platforms.join(', ')}` : '',
      input.desiredDate ? `Desired date: ${input.desiredDate}` : '',
      input.assetLinks ? `Assets attached: ${input.assetLinks.split('\n').length} link(s)` : 'Assets attached: 0',
      '',
      `Description:`,
      input.requestText,
    ].filter(Boolean).join('\n')

    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        'You are a marketing strategist for Apnosh, a restaurant marketing agency.',
        'You will read a client content request, their current monthly plan + usage, and the pricing rubric.',
        '',
        'Your job: classify the request into one of three buckets, and if the bucket is "quote", draft the quote.',
        '',
        'Buckets:',
        '- in_plan: A standard piece of content that fits within the client\'s monthly allotment. No charge. Examples: a single feed post about a dish, a story repost, a simple promo graphic. Only use this if the client has remaining allotment > 0.',
        '- quote: The request needs a custom quote because (a) it exceeds plan allotment, (b) it involves on-site filming, (c) it requires multi-asset production (multi-part reel, full carousel set), (d) it is a bespoke campaign, or (e) it bundles several pieces.',
        '- escalate: The request is ambiguous, far outside scope (a website rebuild from a social request, etc.), or has a red flag the strategist should personally read.',
        '',
        'Output STRICT JSON only — no prose outside the JSON object. Schema:',
        '{',
        '  "recommendedAction": "in_plan" | "quote" | "escalate",',
        '  "confidence": <number 0-1>,',
        '  "reasoning": "<one short sentence justifying the call>",',
        '  "suggestedQuote": {  // only present when recommendedAction is "quote"',
        '    "title": "<short headline for the client to see>",',
        '    "lineItems": [',
        '      { "label": "<from rubric or descriptive>", "qty": <number>, "unitPrice": <number>, "total": <qty * unitPrice>, "notes": "<optional>" }',
        '    ],',
        '    "strategistMessage": "<2-3 sentence pitch to the client explaining scope + why this price>",',
        '    "estimatedTurnaroundDays": <number>',
        '  }',
        '}',
        '',
        'Rules:',
        '- Use line items from the rubric when they fit. You can also create custom labels for anything not in the rubric.',
        '- Each line item total must equal qty * unitPrice exactly.',
        '- If recommending "in_plan", set confidence higher (≥0.85) only when the request is clearly a standard single piece AND the client has remaining allotment.',
        '- If recommending "quote" with confidence < 0.7, lean toward "escalate" instead — strategist should review.',
        '- Be honest about confidence. 0.95 means very sure. 0.55 means the strategist really should look at it.',
        '- Strategist messages should sound like a human pitching the work, not a system. Brief, warm.',
        '- No markdown in your output. JSON only.',
      ].join('\n'),
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = resp.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('')

    // Robust JSON extraction
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }

    const p = parsed as Partial<QuoteSuggestion>
    if (!p.recommendedAction || !['in_plan', 'quote', 'escalate'].includes(p.recommendedAction)) {
      return null
    }

    return {
      recommendedAction: p.recommendedAction,
      confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
      reasoning: typeof p.reasoning === 'string' ? p.reasoning.slice(0, 240) : '',
      suggestedQuote: p.recommendedAction === 'quote' ? sanitizeQuote(p.suggestedQuote) : undefined,
      model: MODEL,
      analyzedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function sanitizeQuote(q: unknown): SuggestedQuote | undefined {
  if (!q || typeof q !== 'object') return undefined
  const sq = q as Partial<SuggestedQuote>
  if (!sq.title || !Array.isArray(sq.lineItems) || sq.lineItems.length === 0) return undefined
  const cleanItems = sq.lineItems
    .map(it => {
      const qty = Math.max(1, Math.floor(Number(it.qty ?? 0)))
      const unitPrice = Math.max(0, Number(it.unitPrice ?? 0))
      const total = qty * unitPrice
      return {
        label: String(it.label ?? '').slice(0, 200),
        qty,
        unitPrice,
        total,
        ...(it.notes ? { notes: String(it.notes).slice(0, 240) } : {}),
      }
    })
    .filter(it => it.label && it.total > 0)
  if (cleanItems.length === 0) return undefined
  return {
    title: String(sq.title).slice(0, 200),
    lineItems: cleanItems,
    strategistMessage: String(sq.strategistMessage ?? '').slice(0, 1000),
    estimatedTurnaroundDays: Math.max(1, Math.min(60, Math.floor(Number(sq.estimatedTurnaroundDays ?? 5)))),
  }
}
