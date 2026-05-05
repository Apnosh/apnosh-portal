/**
 * Centralized Claude model + system prompt config for site builder
 * design endpoints. Change once here, every endpoint picks it up.
 */

import { DESIGN_PRINCIPLES } from '@/lib/design-quality'

/**
 * The "best quality" model for design tasks. Slower but produces
 * dramatically better copy + design choices. Use for any AM-facing
 * design moment (generate, refine, palette generation).
 */
export const DESIGN_MODEL = 'claude-opus-4-1-20250805'

/**
 * The "fast" fallback for tasks where speed matters more than design
 * polish (HTML scraping, structural parsing).
 */
export const PARSE_MODEL = 'claude-sonnet-4-20250514'

/**
 * Wrap a domain-specific system prompt with the shared design quality
 * framework. Inject DESIGN_PRINCIPLES first so they steer everything.
 */
export function withDesignPrinciples(systemPrompt: string): string {
  return `${DESIGN_PRINCIPLES}\n\n---\n\n${systemPrompt}`
}
