/**
 * Tool: generate_post_ideas
 *
 * Generates 3-5 specific Google Business Profile post ideas tailored
 * to the client. Uses Claude with their menu + brand voice + recent
 * activity (already in the agent's context snapshot) so ideas are
 * grounded, not generic.
 *
 * Returns structured ideas the agent can echo to the owner. Owner
 * picks one → agent then calls post_to_gbp to actually publish.
 * Non-destructive (just text), but requires_confirmation so the
 * owner sees the ideas before they're saved as part of a turn.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderFactsForPrompt } from '../facts'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

const anthropic = new Anthropic()

export interface GeneratePostIdeasInput {
  count?: number              // 3-5; default 3
  theme?: string              // optional: "weekend special", "new menu item", etc.
  post_type_hint?: 'update' | 'offer' | 'event'
}

export const GENERATE_POST_IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    count: { type: 'integer', minimum: 1, maximum: 5, description: 'How many ideas to generate. Default 3.' },
    theme: { type: 'string', maxLength: 100, description: 'Optional theme/angle the owner wants (e.g. "weekend special", "new menu item").' },
    post_type_hint: { type: 'string', enum: ['update', 'offer', 'event'], description: 'Bias ideas toward a specific GBP post type.' },
  },
  additionalProperties: false,
} as const

export interface PostIdea {
  post_type: 'update' | 'offer' | 'event'
  title: string
  body: string
  call_to_action_type: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL' | null
  reason: string             // why this idea fits this client right now
}

export interface GeneratePostIdeasOutput {
  ideas: PostIdea[]
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<GeneratePostIdeasOutput> {
  const input = rawInput as GeneratePostIdeasInput
  const count = input.count ?? 3
  const admin = createAdminClient()

  /* Pull just enough context to make ideas specific. */
  const [factsText, menuRes] = await Promise.all([
    renderFactsForPrompt(ctx.clientId, 0.5),
    admin.from('menu_items')
      .select('name, description, price_cents, category, is_featured')
      .eq('client_id', ctx.clientId)
      .order('is_featured', { ascending: false })
      .limit(20),
  ])
  const menu = (menuRes.data ?? []) as Array<{
    name: string; description: string | null; price_cents: number | null;
    category: string | null; is_featured: boolean | null;
  }>

  const menuLines = menu.map(m => {
    const price = m.price_cents != null ? `$${(m.price_cents / 100).toFixed(2)}` : ''
    return `- ${m.name}${price ? ` (${price})` : ''}${m.category ? ` [${m.category}]` : ''}${m.is_featured ? ' ⭐' : ''}`
  }).join('\n')

  const themeHint = input.theme ? `\nThe owner asked specifically for ideas around: "${input.theme}"` : ''
  const typeHint = input.post_type_hint ? `\nBias toward post_type="${input.post_type_hint}".` : ''

  const systemPrompt = `You generate Google Business Profile post ideas for a single restaurant client. Return ONLY valid JSON matching the schema -- no preamble, no markdown, no explanation outside the JSON.

The client's known facts:
${factsText}

Their menu (top items):
${menuLines || '(empty)'}
${themeHint}${typeHint}

Generate ${count} distinct GBP post ideas. Each idea must be specific to THIS restaurant -- reference a real menu item, a real signature, or a real fact about them. Never generic ("come visit us!"). Each idea must include:
  - post_type: "update" | "offer" | "event"
  - title: ≤80 chars, punchy
  - body: 80-200 chars, plain English
  - call_to_action_type: "ORDER" / "BOOK" / "SHOP" / "LEARN_MORE" / "SIGN_UP" / "CALL" or null
  - reason: one sentence on why this idea fits this client right now (reference their actual data)

Return JSON in this exact shape:
{ "ideas": [ { "post_type": "...", "title": "...", "body": "...", "call_to_action_type": "...", "reason": "..." }, ... ] }`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Generate ${count} post ideas.` }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  /* Strip ```json fences if Claude wrapped the response despite
     instructions. */
  const jsonText = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  const parsed = JSON.parse(jsonText) as GeneratePostIdeasOutput
  if (!parsed.ideas || !Array.isArray(parsed.ideas)) {
    throw new Error('Claude returned invalid post ideas shape')
  }
  return parsed
}

registerToolHandler('generatePostIdeas', handler as never)
