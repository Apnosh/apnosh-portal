/**
 * Generate a personalized narrative summary for an audit run.
 *
 * Claude takes the findings + restaurant context and writes a
 * 3-sentence story for the owner: what to focus on, why, and which
 * action would lift the score the most.
 *
 * Costs ~$0.01-0.02 per call. We cache to audit_runs so the same
 * audit doesn't regenerate on every page visit.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AuditResult, Finding } from './index'

const MODEL = 'claude-sonnet-4-5-20250929'

const SYSTEM = `You are Apnosh's marketing strategist writing a personalized 3-sentence summary for a restaurant owner.

You'll be given:
- Owner's restaurant name + (optionally) cuisine type
- Their Apnosh Score (0-100) and per-category scores
- Audit findings with severity, evidence, AND a scoreImpact field
  (potential overall-score points gained if fixed). Use these to identify
  the biggest-leverage actions, not just the lowest-scoring ones.

Write a tight, plain-English summary the owner reads in 15 seconds. RULES:

1. Address the owner directly by their restaurant name in the first sentence.
2. Surface the TOP 1-2 highest-scoreImpact findings (biggest gains for least work).
   Quote actual numbers from the evidence AND name the score impact:
   "Fix X — that's +6 points alone."
3. Recommend a 2-step sequence: "this week" + "next" — be specific and
   tie the recommendation to score impact.
4. Use plain English. No jargon. No "leverage" or "optimize" or "engagement metrics."
5. Be honest. If their score is low, don't soften it. If it's high, celebrate it.
6. Maximum 3 sentences (60-110 words total). Be terse.
7. NO emojis. NO bullet points. Just prose.

You are confident, direct, restaurant-savvy. Think more "experienced food-industry friend" than "marketing consultant."`

interface GeneratedNarrative {
  narrative: string
  model: string
  inputTokens: number
  outputTokens: number
}

export async function generateNarrative(args: {
  audit: AuditResult
  restaurantName: string
  cuisine?: string | null
}): Promise<GeneratedNarrative> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const findingsBrief = args.audit.findings
    .map((f: Finding) => {
      const impact = (f.scoreImpact ?? 0) > 0 ? ` (scoreImpact: +${f.scoreImpact})` : ''
      const ease = f.easeOfFix ? ` [ease: ${f.easeOfFix}/4]` : ''
      return `- [${f.severity}] ${f.headline} — ${f.evidence}${impact}${ease}`
    })
    .join('\n')

  const userPrompt = `Restaurant: ${args.restaurantName}${args.cuisine ? ` (${args.cuisine})` : ''}

Apnosh Score: ${args.audit.scoreOverall}/100
  - Get Found:    ${args.audit.scoreGetFound}/100
  - Look Engaged: ${args.audit.scoreLookEngaged}/100
  - Stay Active:  ${args.audit.scoreStayActive}/100

Findings:
${findingsBrief}

Write the owner-facing 3-sentence summary now.`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  const narrative = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
  return {
    narrative,
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}
