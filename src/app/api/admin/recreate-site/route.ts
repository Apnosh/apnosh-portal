/**
 * Re-create the site draft from scratch.
 *
 * Different from refine-site:
 *   - refine-site = partial diff merged onto current draft. Everything not
 *     addressed stays — leads to "different copy, same site" feeling.
 *   - recreate-site = full regeneration. Output is a complete
 *     RestaurantSite, REPLACES draft_data. The only fields preserved are
 *     ones the operator explicitly checks in the "preserve" list.
 *
 * Variants in recreate mode are pushed apart on multiple axes (mood,
 * design system, voice, hero structure) so they're genuinely distinct
 * directions instead of three near-clones.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gatherClientContext, contextToPromptBlock } from '@/lib/site-config/gather-context'
import { RestaurantSiteSchema, RESTAURANT_DEFAULTS } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import { withDesignPrinciples, callDesignModelWithFallback } from '@/lib/site-config/claude-config'
import { STRATEGY_FIRST_INSTRUCTION, variantInstruction } from '@/lib/design-quality'
import { extractJsonFromClaude } from '@/lib/site-config/json-extract'
import { logGeneration } from '@/lib/ai/log-generation'
import { getGoldExamples, goldExamplesPromptSection } from '@/lib/ai/few-shot'
import crypto from 'node:crypto'

// Opus generating 3 full RestaurantSite payloads can take 60-120s.
// Default serverless timeout is 60s on Pro. Bump to the max (300s).
export const maxDuration = 300

interface RecreateRequest {
  clientId: string
  /** Operator's design direction. The driver of the recreation. */
  prompt: string
  /** Sections to preserve verbatim from current draft. */
  preserve?: (keyof RestaurantSite)[]
  /** How many distinct directions to generate. */
  variants?: number
}

const SYSTEM = `You are a world-class brand designer recreating a website from scratch.

The operator gives you:
  1. The full client onboarding context (goals, voice, customer types, locations, etc.)
  2. A design direction prompt
  3. Optionally a list of sections to preserve verbatim from the current draft
  4. The current draft (for reference only — DO NOT preserve unless instructed)

Your job is to produce a COMPLETE RestaurantSite — every section filled in fresh based on the design direction + client context. This is a REIMAGINATION, not a tweak. If the prompt says "make it more upscale", the entire site should feel upscale: hero, about, FAQs, design system, voice, all of it.

Output STRICT JSON only — no markdown fences, no commentary outside the JSON.

The JSON shape MUST be a complete RestaurantSite (every top-level key present). Use the existing client profile to ground locations, offerings, AYCE counts — don't fabricate. But everything that's COPY (headlines, taglines, about story, FAQ wording, voice notes, design system) should be FULLY rewritten according to the design direction.

If the operator listed sections in "preserve", copy those VERBATIM from the current draft into your output. Don't touch them.

For multi-variant mode: each variant must push apart on:
  - Different mood (luxe vs playful vs editorial)
  - Different design system tokens (radius, density, surface, type weight)
  - Different hero structure (claim-first vs invitation-first vs sensory-first)
  - Different voice register (formal vs conversational vs poetic)
NEVER produce three near-identical variants.`.trim()

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

  const body = await req.json().catch(() => null) as RecreateRequest | null
  if (!body?.clientId || !body.prompt?.trim()) {
    return NextResponse.json({ error: 'clientId + prompt required' }, { status: 400 })
  }

  // Load context + current draft
  const ctx = await gatherClientContext(body.clientId)
  if (!ctx.client.name) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('site_configs')
    .select('draft_data')
    .eq('client_id', body.clientId)
    .maybeSingle()
  const currentDraft = (row?.draft_data ?? null) as RestaurantSite | null

  const promptBlock = contextToPromptBlock(ctx)
  const variantCount = Math.max(1, Math.min(3, body.variants ?? 3))
  const preserveList = body.preserve ?? []

  // ===== Few-shot: pull reference gold examples for this vertical =====
  const goldExamples = await getGoldExamples('restaurant', 3)
  const goldSection = goldExamplesPromptSection(goldExamples)

  const userMessage = [
    '## Client onboarding context',
    promptBlock,
    '',
    goldSection,  // empty string if no examples; otherwise injected reference block
    '## Current draft (REFERENCE ONLY — only preserve sections explicitly listed below)',
    '```json',
    currentDraft ? JSON.stringify(currentDraft, null, 2) : '(none)',
    '```',
    '',
    '## Operator design direction',
    body.prompt.trim(),
    '',
    '## Preserve verbatim',
    preserveList.length === 0 ? '(none — fully recreate every section)' : preserveList.map(k => `- ${k}`).join('\n'),
    '',
    variantCount > 1
      ? variantInstruction(variantCount)
      : 'Output a single complete RestaurantSite JSON now.',
  ].filter(Boolean).join('\n')

  const batchId = crypto.randomUUID()
  const startedAt = Date.now()
  let raw: string
  let modelUsed: string
  try {
    const anthropic = new Anthropic()
    const maxTokens = variantCount >= 3 ? 32_000 : variantCount === 2 ? 24_000 : 12_000
    const result = await callDesignModelWithFallback({
      anthropic,
      system: withDesignPrinciples(`${SYSTEM}\n\n${STRATEGY_FIRST_INSTRUCTION}`),
      userMessage,
      maxTokens,
    })
    raw = result.text
    modelUsed = result.model
  } catch (e) {
    // Log the failure too — quality work needs error data
    await logGeneration({
      clientId: body.clientId,
      taskType: 'recreate',
      model: 'unknown',
      inputSummary: { prompt: body.prompt, preserve: preserveList, variantCount, hasGoldExamples: goldExamples.length },
      latencyMs: Date.now() - startedAt,
      errorMessage: e instanceof Error ? e.message : String(e),
      createdBy: user.id,
      batchId,
    })
    return NextResponse.json({
      error: 'Claude request failed',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 502 })
  }
  const latencyMs = Date.now() - startedAt

  // Robust JSON extraction (handles strategy blocks, fences, truncation)
  const extracted = extractJsonFromClaude(raw)
  if ('error' in extracted) {
    return NextResponse.json({
      error: extracted.error,
      raw: extracted.raw,
      hint: 'If this keeps happening, try fewer variants (1 or 2) or a more focused prompt.',
    }, { status: 502 })
  }
  const parsed = extracted.json as Record<string, unknown>

  console.log(`[recreate-site] generated using ${modelUsed}`)

  // ----- Multi-variant: return choices, don't persist -----
  if (variantCount > 1) {
    const variantsRaw = parsed.variants
    if (!Array.isArray(variantsRaw)) {
      return NextResponse.json({ error: 'Variants response missing variants[]', raw: raw.slice(0, 300) }, { status: 502 })
    }

    // Log each variant individually so we can later track which was picked
    const variantsOut = await Promise.all(variantsRaw.map(async (v, i) => {
      const obj = v as { strategy?: string; site?: Record<string, unknown> }
      const site = mergePreserved(obj.site ?? {}, currentDraft, preserveList)
      const generationId = await logGeneration({
        clientId: body.clientId,
        taskType: 'recreate',
        promptId: 'restaurant-recreate',
        promptVersion: 'v1',
        model: modelUsed,
        inputSummary: { prompt: body.prompt, preserve: preserveList, variantCount, hasGoldExamples: goldExamples.length },
        outputSummary: { strategy: obj.strategy, site } as Record<string, unknown>,
        rawText: raw.length > 100_000 ? raw.slice(0, 100_000) : raw,
        variantIndex: i,
        batchId,
        latencyMs,
        createdBy: user.id,
      })
      return {
        generationId,
        strategy: obj.strategy ?? '',
        site,
      }
    }))

    return NextResponse.json({
      success: true,
      mode: 'variants',
      batchId,
      variants: variantsOut,
    })
  }

  // ----- Single direct apply -----
  const site = mergePreserved(
    (parsed.site as Record<string, unknown> | undefined) ?? parsed,
    currentDraft,
    preserveList,
  )

  // Validate (soft) and persist
  const result = RestaurantSiteSchema.safeParse(site)
  if (!result.success) {
    console.warn('[recreate-site] validation issues:', JSON.stringify(result.error.issues.slice(0, 5), null, 2))
  }

  const { error: upErr } = await admin
    .from('site_configs')
    .update({ draft_data: site })
    .eq('client_id', body.clientId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const generationId = await logGeneration({
    clientId: body.clientId,
    taskType: 'recreate',
    promptId: 'restaurant-recreate',
    promptVersion: 'v1',
    model: modelUsed,
    inputSummary: { prompt: body.prompt, preserve: preserveList, variantCount: 1, hasGoldExamples: goldExamples.length },
    outputSummary: { site } as Record<string, unknown>,
    rawText: raw.length > 100_000 ? raw.slice(0, 100_000) : raw,
    batchId,
    latencyMs,
    createdBy: user.id,
  })
  if (generationId) {
    await Promise.all([
      // Mark applied — this generation became the new draft
      import('@/lib/ai/log-generation').then(m => m.markApplied(generationId)),
    ])
  }

  return NextResponse.json({
    success: true,
    mode: 'apply',
    site,
    generationId,
  })
}

/**
 * Merge a Claude-produced new site with selected sections preserved from
 * the current draft. Anything NOT in preserve list comes from Claude.
 * Defaults fill in anything missing entirely.
 */
function mergePreserved(
  fresh: Record<string, unknown>,
  current: RestaurantSite | null,
  preserve: (keyof RestaurantSite)[],
): RestaurantSite {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = { ...RESTAURANT_DEFAULTS, ...fresh }
  if (current) {
    for (const key of preserve) {
      const val = (current as Record<string, unknown>)[key]
      if (val !== undefined) out[key] = val
    }
  }
  return out as RestaurantSite
}
