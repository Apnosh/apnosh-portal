'use server'

/**
 * AI-suggested reply to a social comment or DM.
 *
 * Reads the comment text + a small amount of brand context (tier,
 * restaurant name, voice notes if any) and asks Claude for a short,
 * warm, on-brand reply.
 *
 * Returns null if Claude can't form a confident reply (e.g. very
 * angry or off-topic comment that needs a human).
 *
 * Same cost profile as suggest-quote (~$0.001 per call with
 * a smaller max_tokens). Per-client daily rate limited.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 250
const DAILY_LIMIT_DEFAULT = 100

export interface ReplySuggestion {
  reply: string
  confidence: number
  tone: 'warm' | 'neutral' | 'cautious' | 'escalate'
  reasoning: string
  model: string
  generatedAt: string
}

export interface SuggestReplyInput {
  clientId: string
  /** What the customer wrote. */
  commentText: string
  /** Optional: name/handle of the commenter. */
  commenterName?: string | null
  /** Optional: which post the comment is on (helps context). */
  postCaption?: string | null
  /** 'comment' vs 'dm' — affects tone slightly. */
  kind: 'comment' | 'dm' | 'mention'
}

export async function suggestReply(input: SuggestReplyInput): Promise<ReplySuggestion | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!input.commentText || input.commentText.trim().length < 2) return null

  const admin = createAdminClient()

  // Per-client daily cap on AI replies. Cheap insurance.
  const limit = parseInt(process.env.SUGGEST_REPLY_DAILY_LIMIT ?? `${DAILY_LIMIT_DEFAULT}`, 10) || 0
  if (limit > 0) {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const { count } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', input.clientId)
      .eq('event_type', 'ai.reply_suggested')
      .gte('occurred_at', dayStart.toISOString())
    if ((count ?? 0) >= limit) return null
  }

  // Light brand context. We could pull voice notes / pillars later;
  // for v1 the restaurant name is enough to keep the reply non-generic.
  const { data: client } = await admin
    .from('clients')
    .select('name, business_subtype')
    .eq('id', input.clientId)
    .maybeSingle()
  const brand = (client?.name as string | null) ?? 'the restaurant'
  const subtype = (client?.business_subtype as string | null) ?? null

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const ctx: string[] = [`Brand: ${brand}`]
    if (subtype) ctx.push(`Type: ${subtype}`)
    if (input.postCaption) {
      ctx.push(`Post the comment is on: "${input.postCaption.slice(0, 240)}"`)
    }
    ctx.push(`Channel: ${input.kind === 'dm' ? 'direct message' : input.kind === 'mention' ? 'someone tagged you in their content' : 'comment on your post'}`)
    if (input.commenterName) ctx.push(`From: @${input.commenterName}`)
    ctx.push('')
    ctx.push(`Their message:`)
    ctx.push(`"${input.commentText.trim()}"`)

    const resp = await claude.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        'You write social replies for restaurants on behalf of the owner.',
        'Voice: warm, brief, human. Sounds like a real person at the restaurant — not a brand bot.',
        'No corporate-speak. No "We appreciate your feedback." No "Thank you for reaching out."',
        '',
        'Output STRICT JSON only. Schema:',
        '{',
        '  "reply": "<the suggested reply, 1-3 sentences max, can include 1 emoji if it fits>",',
        '  "confidence": <number 0-1>,',
        '  "tone": "warm" | "neutral" | "cautious" | "escalate",',
        '  "reasoning": "<one short sentence on why this reply>"',
        '}',
        '',
        'Tone rules:',
        '- warm: positive comment, fan, compliment, question with happy intent → friendly, on-brand. confidence ≥ 0.8.',
        '- neutral: factual question (hours, location, menu) → answer if obvious from context, else suggest the customer DM or call. confidence 0.6-0.8.',
        '- cautious: comment is mildly negative or ambiguous → acknowledge, invite them to DM to make it right. confidence 0.5-0.7.',
        '- escalate: clear complaint, anger, accusation, or anything that could damage brand if mishandled → set confidence < 0.5 and put "Needs human review" in the reply. The owner will write their own.',
        '',
        'If you don\'t know a specific fact (hours, address, menu price), don\'t make it up — suggest the customer DM the restaurant.',
        '',
        'Length: shorter is better. 1 sentence beats 3.',
        'No markdown in your output. JSON only.',
      ].join('\n'),
      messages: [{ role: 'user', content: ctx.join('\n') }],
    })

    const text = resp.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('')
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }

    const p = parsed as Partial<ReplySuggestion>
    if (!p.reply || typeof p.reply !== 'string') return null
    const tone: ReplySuggestion['tone'] =
      p.tone === 'warm' || p.tone === 'neutral' || p.tone === 'cautious' || p.tone === 'escalate'
        ? p.tone : 'neutral'

    void admin.from('events').insert({
      client_id: input.clientId,
      event_type: 'ai.reply_suggested',
      actor_role: 'system',
      summary: `AI ${tone} reply suggested`,
      payload: {
        tone,
        confidence: p.confidence ?? null,
        kind: input.kind,
      },
    })

    return {
      reply: p.reply.slice(0, 600).trim(),
      confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
      tone,
      reasoning: typeof p.reasoning === 'string' ? p.reasoning.slice(0, 240) : '',
      model: MODEL,
      generatedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}
