/**
 * Centralized Claude model + system prompt config for site builder
 * design endpoints. Change once here, every endpoint picks it up.
 */

import Anthropic from '@anthropic-ai/sdk'
import { DESIGN_PRINCIPLES } from '@/lib/design-quality'

/**
 * The "best quality" model for design tasks. Slower but produces
 * dramatically better copy + design choices. Use for any AM-facing
 * design moment (generate, refine, palette generation).
 *
 * Ordered fallback list — if the first model errors (not-found,
 * overloaded, rate-limit), the call retries with the next.
 */
export const DESIGN_MODELS = [
  'claude-opus-4-1-20250805',  // Opus 4.1 — best quality
  'claude-opus-4-20250514',    // Opus 4 — proven fallback
  'claude-sonnet-4-5',         // Sonnet 4.5 alias if available
  'claude-sonnet-4-20250514',  // Sonnet 4 — guaranteed available
] as const

export const DESIGN_MODEL = DESIGN_MODELS[0]

/**
 * The "fast" fallback for tasks where speed matters more than design
 * polish (HTML scraping, structural parsing).
 */
export const PARSE_MODEL = 'claude-sonnet-4-20250514'

/**
 * Try DESIGN_MODELS in order until one succeeds. Returns both the model
 * that worked and the response. Errors only if every model fails.
 */
export async function callDesignModelWithFallback(args: {
  anthropic: Anthropic
  system: string
  userMessage: string
  maxTokens: number
}): Promise<{ model: string; text: string }> {
  let lastErr: Error | null = null
  for (const model of DESIGN_MODELS) {
    try {
      const msg = await args.anthropic.messages.create({
        model,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: [{ role: 'user', content: args.userMessage }],
      })
      const text = msg.content
        .filter(c => c.type === 'text')
        .map(c => (c as { type: 'text'; text: string }).text)
        .join('\n')
      return { model, text }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      console.warn(`[claude-config] model ${model} failed:`, lastErr.message)
      // Don't fall through on auth/billing errors — retry won't help
      const m = lastErr.message.toLowerCase()
      if (m.includes('authentication') || m.includes('api_key') || m.includes('credit') || m.includes('billing')) {
        throw lastErr
      }
      // Otherwise continue to next model
    }
  }
  throw lastErr ?? new Error('All design models failed')
}

/**
 * Wrap a domain-specific system prompt with the shared design quality
 * framework. Inject DESIGN_PRINCIPLES first so they steer everything.
 */
export function withDesignPrinciples(systemPrompt: string): string {
  return `${DESIGN_PRINCIPLES}\n\n---\n\n${systemPrompt}`
}
