/**
 * AI helper for the email_specialist surface. Drafts subject +
 * preview + body grounded in the standard retrieval contract
 * (brand voice, top posts, judgments, cross-client signal). Logs
 * to ai_generations + ai_generation_inputs for full audit.
 *
 * Used by:
 *   POST /api/work/campaigns/draft      (new campaign)
 *   POST /api/work/campaigns/[id]/redraft (existing campaign)
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientContext } from '@/lib/ai/get-client-context'

const MODEL = 'claude-sonnet-4-6'

export interface Brief {
  theme: string
  offer?: string | null
  cta?: string | null
  audience: string
}

export interface EmailJSON {
  subject: string
  preview_text: string
  body_text: string
  why?: string
}

export interface GenerateEmailResult {
  email: EmailJSON | null
  parseError: string | null
  generationId: string | undefined
}

export async function generateEmail(clientId: string, brief: Brief, userId: string): Promise<GenerateEmailResult> {
  const context = await getClientContext(clientId)

  const systemPrompt = `You are an email copywriter for a restaurant. You write subject lines that get opened and bodies people actually read on their phone.

Output JSON only:
  { "subject": "5-9 words, no clickbait, no all caps",
    "preview_text": "preview line (~80 chars) that complements the subject",
    "body_text": "the email body in plain text, ~120-220 words",
    "why": "one line on the voice + retrieval signals you used" }

Rules:
- Match the client's voice EXACTLY. No corporate filler.
- Body opens with a HOOK in the first line (no "Hi everyone").
- One clear CTA at the bottom. The CTA from the brief if given, else "Order online".
- If an offer is included, name it specifically.
- Audience-aware: lapsed = win-back tone, loyalty = appreciation tone, new-local = welcome tone, all-subscribers = inclusive.
- Sentences short. Paragraphs short. Mobile-first reading.
- NO emojis. NO hashtags. NO signoffs like "Cheers, [Brand]" — that gets added by the template.
- Avoid the rejection patterns in this client's history.`

  const userPrompt = `Draft a marketing email.

## Brief
Theme: ${brief.theme}
Offer: ${brief.offer ?? '(none — informational/build-relationship)'}
CTA: ${brief.cta ?? 'Order online'}
Audience: ${brief.audience}

${context.promptSummary}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: EmailJSON | null = null
  let parseError: string | null = null

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    inputTokens = msg.usage.input_tokens
    outputTokens = msg.usage.output_tokens
    const block = msg.content.find(c => c.type === 'text')
    rawOutput = block ? (block as { type: 'text'; text: string }).text : ''
    const jsonStart = rawOutput.indexOf('{')
    const jsonEnd = rawOutput.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON in response')
    parsed = JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1))
  } catch (e: unknown) {
    parseError = e instanceof Error ? e.message : String(e)
  }

  const completedAt = new Date()
  const admin = createAdminClient()
  const aiGenInsert = await admin
    .from('ai_generations')
    .insert({
      client_id: clientId,
      task_type: 'generate',
      model: MODEL,
      input_summary: { kind: 'email_campaign', brief },
      output_summary: {
        kind: 'email_campaign', error: parseError,
        subject_chars: parsed?.subject?.length ?? null,
        body_chars: parsed?.body_text?.length ?? null,
        why: parsed?.why ?? null,
      },
      raw_text: rawOutput.slice(0, 8000),
      latency_ms: completedAt.getTime() - startedAt.getTime(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error_message: parseError,
      created_by: userId,
    })
    .select('id')
    .maybeSingle()

  const generationId = aiGenInsert.data?.id as string | undefined
  if (generationId) {
    await admin.from('ai_generation_inputs').insert({
      generation_id: generationId,
      client_id: clientId,
      prompt: userPrompt.slice(0, 8000),
      retrieved_facts: context.retrieval.factIds,
      retrieved_posts: context.retrieval.postIds,
      retrieved_drafts: context.retrieval.crossClientDraftIds,
      retrieved_judgments: context.retrieval.judgmentIds,
      brand_voice_version: context.retrieval.brandVersion,
      theme_version: null,
      cross_client_signal: context.crossClientSignal.length > 0
        ? { count: context.crossClientSignal.length, descriptors: context.crossClientSignal.map(s => s.anonDescriptor) }
        : null,
      model: MODEL,
    })
  }

  return { email: parsed, parseError, generationId }
}
