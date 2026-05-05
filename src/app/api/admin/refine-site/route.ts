/**
 * Refine the existing site draft with a natural-language prompt.
 *
 * Modes:
 *   - "site"        → Claude may touch any section (whole-site refinement)
 *   - "section"     → restrict edits to a single section (e.g. only hero)
 *   - "section-list"→ restrict edits to specific sections
 *
 * Output is merged on top of the existing draft (NOT replacing). Claude
 * returns ONLY the keys it wants to change.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RestaurantSiteSchema } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import { PARSE_MODEL, withDesignPrinciples, callDesignModelWithFallback } from '@/lib/site-config/claude-config'
import { STRATEGY_FIRST_INSTRUCTION, variantInstruction } from '@/lib/design-quality'
import { extractJsonFromClaude } from '@/lib/site-config/json-extract'

export const maxDuration = 300

interface RefineRequest {
  clientId: string
  prompt: string
  scope?: 'site' | 'section' | 'section-list'
  sections?: (keyof RestaurantSite)[]
  /** Number of distinct variants to produce. 1 = direct apply, 2-3 = pick. */
  variants?: number
  /** "best" = Opus + strategy-first (slower, higher quality). "fast" = Sonnet single-shot. Default "best". */
  quality?: 'best' | 'fast'
}

const SYSTEM_BASE = `You are a world-class brand designer + copywriter refining an existing website draft.

You receive:
1. The current draft as JSON (a RestaurantSite config).
2. A natural-language instruction from the operator.
3. The scope of allowed changes.

Output STRICT JSON only — a PARTIAL update, containing ONLY the keys you want to change. The shape MUST match the corresponding RestaurantSite section keys. Do not include keys you are not changing.

Examples of partial outputs:

Input: "Make the hero more energetic"
Output: { "hero": { "headline": "...", "subhead": "..." } }

Input: "Switch the whole vibe to upscale"
Output: { "brand": { "designSystem": { "radius": "sharp", "density": "airy", ... } }, "hero": { "headline": "..." } }

Constraints:
- Keep all string lengths within constraints (hero.headline ≤72 chars, hero.subhead ≤220, about.body ≤2400, faq.q ≤160, faq.a ≤600, etc.)
- Preserve any field NOT addressed by the instruction
- Preserve required identity fields (vertical, templateId)
- For tone changes, ALWAYS rewrite the copy — don't just nudge adjectives
- If the instruction implies a vibe change, ALSO update designSystem tokens to match
- Hex colors must be valid #RRGGBB format
- Fonts must be one of the allowed fonts: Anton, Bebas Neue, Playfair Display, Archivo Black, Fraunces, Space Grotesk, Cormorant Garamond, Oswald (display); Inter, DM Sans, Archivo, Lato, Open Sans, Space Grotesk (body)`

export async function POST(req: NextRequest) {
  // Admin gate
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as RefineRequest | null
  if (!body?.clientId || !body.prompt?.trim()) {
    return NextResponse.json({ error: 'clientId and prompt are required' }, { status: 400 })
  }

  // Load current draft
  const admin = createAdminClient()
  const { data: row, error: rowErr } = await admin
    .from('site_configs')
    .select('draft_data')
    .eq('client_id', body.clientId)
    .maybeSingle()
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Site config not found — generate first' }, { status: 404 })

  const currentDraft = row.draft_data as RestaurantSite

  // Build scope hint
  const scope = body.scope ?? 'site'
  const sections = body.sections ?? []
  const scopeHint = scope === 'section' && sections[0]
    ? `Edit ONLY this section: "${sections[0]}". Keys at the top level of your output must be exactly { "${sections[0]}": ... }.`
    : scope === 'section-list' && sections.length > 0
      ? `Edit ONLY these sections: ${sections.map(s => `"${s}"`).join(', ')}. Keys at the top level of your output must be from this list.`
      : 'You may edit any section. Edit only what the instruction implies.'

  const variantCount = Math.max(1, Math.min(3, body.variants ?? 1))
  const quality = body.quality ?? 'best'
  const useOpus = quality === 'best'

  const userMessage = [
    '## Current draft',
    '```json',
    JSON.stringify(currentDraft, null, 2),
    '```',
    '',
    '## Operator instruction',
    body.prompt.trim(),
    '',
    '## Scope',
    scopeHint,
    '',
    variantCount > 1
      ? variantInstruction(variantCount)
      : 'Output the partial JSON update now. Only changed keys.',
  ].join('\n')

  // System prompt: layer in design principles + strategy-first when high-quality
  let system = SYSTEM_BASE
  if (useOpus) {
    system = withDesignPrinciples(`${SYSTEM_BASE}\n\n${STRATEGY_FIRST_INSTRUCTION}`)
  }

  let raw: string
  try {
    const anthropic = new Anthropic()
    const maxTokens = variantCount >= 3 ? 24_000 : variantCount === 2 ? 16_000 : 8_192
    if (useOpus) {
      const result = await callDesignModelWithFallback({
        anthropic, system, userMessage, maxTokens,
      })
      raw = result.text
    } else {
      const msg = await anthropic.messages.create({
        model: PARSE_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })
      raw = msg.content
        .filter(c => c.type === 'text')
        .map(c => (c as { type: 'text'; text: string }).text)
        .join('\n')
    }
  } catch (e) {
    return NextResponse.json({
      error: 'Claude request failed',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 502 })
  }

  const extracted = extractJsonFromClaude(raw)
  if ('error' in extracted) {
    return NextResponse.json({
      error: extracted.error,
      raw: extracted.raw,
      hint: 'Try fewer variants or a more focused prompt.',
    }, { status: 502 })
  }
  const parsed = extracted.json as Record<string, unknown>

  // ----- Multi-variant mode: return options without persisting -----
  if (variantCount > 1) {
    const variantsRaw = parsed.variants
    if (!Array.isArray(variantsRaw)) {
      return NextResponse.json({ error: 'Variants response missing variants[]', raw: raw.slice(0, 300) }, { status: 502 })
    }
    return NextResponse.json({
      success: true,
      mode: 'variants',
      variants: variantsRaw.map((v) => {
        const obj = v as { strategy?: string; site?: Record<string, unknown> }
        const merged = deepMerge(currentDraft as unknown, obj.site ?? {}) as RestaurantSite
        return {
          strategy: obj.strategy ?? '',
          patch: obj.site ?? {},
          site: merged,
        }
      }),
    })
  }

  // ----- Single-shot mode: deep-merge + persist (legacy fast path) -----
  // Strip the strategy block if present (Opus mode); we just want the JSON patch
  const patch = parsed.site && typeof parsed.site === 'object'
    ? parsed.site as Record<string, unknown>
    : parsed

  const merged = deepMerge(currentDraft as unknown, patch) as RestaurantSite
  const result = RestaurantSiteSchema.safeParse(merged)
  if (!result.success) {
    console.warn('[refine-site] validation issues:', JSON.stringify(result.error.issues.slice(0, 5), null, 2))
  }

  const { error: upErr } = await admin
    .from('site_configs')
    .update({ draft_data: merged })
    .eq('client_id', body.clientId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    mode: 'apply',
    patch,
    site: merged,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, patch: any): any {
  if (patch == null) return base
  if (Array.isArray(base) || Array.isArray(patch)) return patch ?? base
  if (typeof base !== 'object' || typeof patch !== 'object') return patch ?? base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const k of Object.keys(patch as Record<string, unknown>)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], (patch as Record<string, unknown>)[k])
  }
  return out
}
