/**
 * Bespoke critique loop. Claude reads its own generated HTML, scores
 * it against the brief + client identity, identifies the weakest
 * sections, and (optionally) rewrites them.
 *
 * Pipeline:
 *   1. Load current bespoke_sites.html_doc + brief + client context
 *   2. Send Claude: brief + context + the full HTML; ask for a JSON
 *      critique with per-section scores + the bottom-2 sections to
 *      rewrite + a one-line rewrite instruction per weak section.
 *   3. If `apply: true`, loop the weak sections through the same
 *      splice-replace logic the section-regen endpoint uses.
 *   4. Return the critique (so the AM can review) plus the new
 *      version number if anything was applied.
 *
 * Future: render the HTML to PNG and feed pixels to Claude vision so
 * the critique catches what text reasoning can't (spacing, contrast,
 * hero proportions). Endpoint signature is stable across that change.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gatherClientContext, contextToPromptBlock } from '@/lib/site-config/gather-context'
import { withDesignPrinciples, callDesignModelWithFallback } from '@/lib/site-config/claude-config'
import { logGeneration } from '@/lib/ai/log-generation'
import crypto from 'node:crypto'

export const maxDuration = 300

const VALID_SECTIONS = [
  'nav', 'hero', 'intro', 'about', 'offerings',
  'locations', 'breaker', 'testimonials', 'faq', 'footer',
] as const
type SectionName = typeof VALID_SECTIONS[number]

interface CritiqueRequest {
  clientId: string
  /** Whether to also rewrite the weakest sections after critiquing. Default: true. */
  apply?: boolean
  /** How many of the weakest sections to rewrite. Default: 2. */
  maxRewrites?: number
}

interface SectionScore {
  section: SectionName
  /** 1-10 */
  score: number
  /** What's wrong, ≤140 chars */
  issue: string
  /** One-line rewrite instruction for the section-regen endpoint */
  fix: string
}

interface CritiqueOutput {
  overallScore: number
  brand: string
  /** One-paragraph editor's note on the site as a whole */
  summary: string
  sections: SectionScore[]
  /** Sections to rewrite, ordered worst-first */
  rewriteQueue: SectionName[]
}

const SYSTEM = `You are a senior brand designer + creative director performing a rigorous quality review of a custom-coded restaurant website.

You will receive:
1. The complete HTML document (one long string)
2. The original design brief
3. Rich client onboarding context (ground truth — voice, brand colors, customer types, why-choose, signature items)

Your job: score the site mercilessly against the brief AND against the client's actual identity, then return a JSON object identifying the weakest sections and how to fix each.

Scoring rubric (per section, 1-10):
- 10: Belongs in a Communication Arts Annual. Specific, sensory, anchored in this client's actual identity.
- 7-8: Solid. Coherent voice, clear hierarchy, no clichés. Could ship as-is.
- 4-6: Generic-feeling. Reads like a template. Copy uses safe words ("welcome", "passion", "experience"). Visuals don't earn their place.
- 1-3: Broken or off-brand. Wrong voice. Invented facts. Missing required content.

Pay special attention to:
- Hero copy: does it lead with the unique_differentiator? Or generic "welcome to..."?
- About: does it sound like THIS client wrote it, or like a template?
- Offerings: are signature_items / main_offerings actually named?
- Locations: real addresses + hours, or filler?
- Testimonials: pulled VERBATIM from recent_reviews, or invented?
- Voice across the whole page: tone_tags + custom_tone honored?
- Visual system: does it use the brand_colors from the profile? Or random palette?
- Anti-patterns: emoji decoration, "where friends become family", carousel/slider markup, stock-image references, newsletter signup in hero — these are auto-failures.

Output ONLY a single JSON object, no markdown fences, no preamble. Schema:
{
  "overallScore": <1-10>,
  "brand": "<one-line characterization of the site's actual brand position>",
  "summary": "<1-paragraph editor's note: what's working, what's not, what to fix first>",
  "sections": [
    { "section": "<name>", "score": <1-10>, "issue": "<≤140 char critique>", "fix": "<one-line rewrite instruction>" }
  ],
  "rewriteQueue": ["<section>", "<section>"]
}

Section names MUST be one of: nav, hero, intro, about, offerings, locations, breaker, testimonials, faq, footer. Only include sections that actually exist in the HTML. The rewriteQueue should list the lowest-scoring sections worst-first, max 4 entries.`.trim()

/** Locate a <section data-section="X">…</section> block. (Same as in regenerate-section.) */
function findSectionBlock(html: string, name: SectionName): { tag: string; start: number; end: number } | null {
  const tags = name === 'nav'
    ? ['nav', 'header', 'section']
    : name === 'footer'
      ? ['footer', 'section']
      : ['section', 'div']
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*data-section\\s*=\\s*["']${name}["'][^>]*>`, 'i')
    const openMatch = re.exec(html)
    if (!openMatch) continue
    const start = openMatch.index
    const opener = new RegExp(`<${tag}\\b`, 'gi')
    const closer = new RegExp(`</${tag}\\s*>`, 'gi')
    let depth = 1
    let cursor = start + openMatch[0].length
    while (depth > 0) {
      opener.lastIndex = cursor
      closer.lastIndex = cursor
      const o = opener.exec(html)
      const c = closer.exec(html)
      if (!c) return null
      if (o && o.index < c.index) {
        depth++
        cursor = o.index + o[0].length
      } else {
        depth--
        cursor = c.index + c[0].length
        if (depth === 0) return { tag, start, end: cursor }
      }
    }
  }
  return null
}

const REWRITE_SYSTEM = `You are a senior brand designer + front-end engineer rewriting ONE section of a custom HTML+CSS restaurant website to fix a specific quality issue.

You receive:
1. The COMPLETE current HTML document (visual system + voice context)
2. The specific <section> block being rewritten
3. A critique describing what's wrong with this section
4. Rich client onboarding context

Rules:
- Keep the SAME visual system (palette, typography, spacing, voice, density). New section must feel like it belongs.
- ONLY rewrite the requested section. Reuse existing CSS classes/custom-properties.
- Preserve the exact data-section="..." attribute on the wrapper element.
- Anchor copy in client onboarding ground truth.
- Address the critique directly — don't paper over it.

Output: ONLY the replacement element. No markdown fences, no commentary, no surrounding HTML. Just the single element.`.trim()

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

  const body = await req.json().catch(() => null) as CritiqueRequest | null
  if (!body?.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const apply = body.apply !== false  // default true
  const maxRewrites = Math.min(Math.max(body.maxRewrites ?? 2, 0), 4)

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('bespoke_sites')
    .select('html_doc, brief, version, reference_urls')
    .eq('client_id', body.clientId)
    .maybeSingle()

  if (!existing?.html_doc) {
    return NextResponse.json({ error: 'No bespoke site exists for this client yet — generate one first.' }, { status: 404 })
  }

  const ctx = await gatherClientContext(body.clientId)
  const promptBlock = contextToPromptBlock(ctx)

  const critiqueUserMessage = [
    '## Client onboarding context (ground truth)',
    promptBlock,
    '',
    '## Original design brief',
    existing.brief ?? '(no brief on file)',
    '',
    '## Current HTML document (one string)',
    '```html',
    existing.html_doc,
    '```',
    '',
    'Score this site against the brief and the client\'s actual identity. Return ONLY the JSON object — no fences, no preamble.',
  ].join('\n')

  const batchId = crypto.randomUUID()
  const startedAt = Date.now()
  const anthropic = new Anthropic()

  // Step 1 — critique
  let critique: CritiqueOutput
  let critiqueModel = 'opus-fallback-chain'
  let critiqueRaw = ''
  try {
    const result = await callDesignModelWithFallback({
      anthropic,
      system: withDesignPrinciples(SYSTEM),
      userMessage: critiqueUserMessage,
      maxTokens: 6_000,
    })
    critiqueRaw = result.text
    critiqueModel = result.model
    let jsonText = critiqueRaw.trim()
    const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (fence) jsonText = fence[1].trim()
    const firstBrace = jsonText.indexOf('{')
    const lastBrace = jsonText.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) jsonText = jsonText.slice(firstBrace, lastBrace + 1)
    critique = JSON.parse(jsonText) as CritiqueOutput
    if (!Array.isArray(critique.sections)) throw new Error('critique.sections is not an array')
  } catch (e) {
    await logGeneration({
      clientId: body.clientId,
      taskType: 'design',
      promptId: 'bespoke-critique',
      promptVersion: 'v1',
      model: critiqueModel,
      inputSummary: { mode: 'bespoke-critique', apply, maxRewrites },
      latencyMs: Date.now() - startedAt,
      errorMessage: e instanceof Error ? e.message : String(e),
      rawText: critiqueRaw.slice(0, 50_000),
      createdBy: user.id,
      batchId,
    })
    return NextResponse.json({
      error: 'Critique failed',
      detail: e instanceof Error ? e.message : String(e),
      raw: critiqueRaw.slice(0, 1000),
    }, { status: 502 })
  }

  await logGeneration({
    clientId: body.clientId,
    taskType: 'design',
    promptId: 'bespoke-critique',
    promptVersion: 'v1',
    model: critiqueModel,
    inputSummary: { mode: 'bespoke-critique', apply, maxRewrites, version: existing.version },
    outputSummary: { overallScore: critique.overallScore, sectionCount: critique.sections.length, rewriteQueue: critique.rewriteQueue },
    rawText: critiqueRaw,
    batchId,
    latencyMs: Date.now() - startedAt,
    createdBy: user.id,
  })

  if (!apply || !critique.rewriteQueue?.length || maxRewrites === 0) {
    return NextResponse.json({
      success: true,
      critique,
      applied: false,
      version: existing.version,
    })
  }

  // Step 2 — rewrite the weakest sections, sequentially. We pass the
  // EVOLVING html_doc to each subsequent rewrite so later passes see
  // earlier improvements (better visual coherence than parallel rewrites).
  let currentHtml = existing.html_doc
  const rewrites: { section: SectionName; fix: string; bytes: number }[] = []
  const fixesBySection = new Map(critique.sections.map(s => [s.section, s.fix]))
  const queue = critique.rewriteQueue
    .filter((s): s is SectionName => VALID_SECTIONS.includes(s as SectionName))
    .slice(0, maxRewrites)

  for (const sectionName of queue) {
    const block = findSectionBlock(currentHtml, sectionName)
    if (!block) continue  // section either not present or not marked
    const fix = fixesBySection.get(sectionName) || `Rewrite the ${sectionName} section to be more anchored in this client's identity. Tighter, more specific, more sensory.`
    const sectionHtml = currentHtml.slice(block.start, block.end)

    const rewriteUserMessage = [
      '## Client onboarding context (ground truth)',
      promptBlock,
      '',
      '## Original design brief',
      existing.brief ?? '(no brief on file)',
      '',
      '## Critique of this section (what to fix)',
      fix,
      '',
      '## Section being rewritten',
      `data-section="${sectionName}"`,
      '',
      '## Current section HTML (replace this)',
      '```html',
      sectionHtml,
      '```',
      '',
      '## FULL CURRENT DOCUMENT (visual + voice context — only the above section is being changed)',
      '```html',
      currentHtml,
      '```',
      '',
      `Return ONLY the replacement element. Preserve data-section="${sectionName}". No fences, no commentary.`,
    ].join('\n')

    let raw = ''
    let model = critiqueModel
    const sectionStart = Date.now()
    try {
      const result = await callDesignModelWithFallback({
        anthropic,
        system: withDesignPrinciples(REWRITE_SYSTEM),
        userMessage: rewriteUserMessage,
        maxTokens: 12_000,
      })
      raw = result.text
      model = result.model
    } catch (e) {
      await logGeneration({
        clientId: body.clientId,
        taskType: 'design',
        promptId: 'bespoke-critique-rewrite',
        promptVersion: 'v1',
        model,
        inputSummary: { mode: 'bespoke-critique-rewrite', section: sectionName, fix },
        latencyMs: Date.now() - sectionStart,
        errorMessage: e instanceof Error ? e.message : String(e),
        createdBy: user.id,
        batchId,
      })
      continue  // skip this section, keep going
    }

    let replacement = raw.trim()
    const fence = replacement.match(/```(?:html)?\s*([\s\S]*?)\s*```/)
    if (fence) replacement = fence[1].trim()
    const dsRe = new RegExp(`data-section\\s*=\\s*["']${sectionName}["']`)
    if (!dsRe.test(replacement)) continue  // skip — bad output
    const firstOpen = replacement.search(/<[a-zA-Z]/)
    if (firstOpen > 0) replacement = replacement.slice(firstOpen)
    const lastCloseIdx = replacement.lastIndexOf('>')
    if (lastCloseIdx >= 0) replacement = replacement.slice(0, lastCloseIdx + 1)

    currentHtml = currentHtml.slice(0, block.start) + replacement + currentHtml.slice(block.end)
    rewrites.push({ section: sectionName, fix, bytes: replacement.length })

    await logGeneration({
      clientId: body.clientId,
      taskType: 'design',
      promptId: 'bespoke-critique-rewrite',
      promptVersion: 'v1',
      model,
      inputSummary: { mode: 'bespoke-critique-rewrite', section: sectionName, fix, batchId },
      outputSummary: { sectionBytes: replacement.length },
      rawText: raw.length > 100_000 ? raw.slice(0, 100_000) : raw,
      batchId,
      latencyMs: Date.now() - sectionStart,
      createdBy: user.id,
    })
  }

  // If no rewrites succeeded, just return the critique
  if (rewrites.length === 0) {
    return NextResponse.json({
      success: true,
      critique,
      applied: false,
      version: existing.version,
      note: 'No sections could be rewritten — likely missing data-section markers. Regenerate the full site once to enable critique-and-refine.',
    })
  }

  // Persist
  const newVersion = (existing.version ?? 0) + 1
  const totalLatency = Date.now() - startedAt
  const noteBlurb = `Critique loop: rewrote ${rewrites.map(r => r.section).join(', ')} (overall ${critique.overallScore}/10)`

  const finalGenId = await logGeneration({
    clientId: body.clientId,
    taskType: 'design',
    promptId: 'bespoke-critique',
    promptVersion: 'v1',
    model: critiqueModel,
    inputSummary: { mode: 'bespoke-critique-applied', batchId, rewrites: rewrites.map(r => r.section) },
    outputSummary: { htmlBytes: currentHtml.length, version: newVersion, overallScore: critique.overallScore },
    batchId,
    latencyMs: totalLatency,
    createdBy: user.id,
  })

  const { error: updErr } = await admin
    .from('bespoke_sites')
    .update({
      html_doc: currentHtml,
      model: critiqueModel,
      generation_ms: totalLatency,
      generation_id: finalGenId,
      version: newVersion,
      generated_at: new Date().toISOString(),
      generated_by: user.id,
      notes: noteBlurb,
    })
    .eq('client_id', body.clientId)
  if (updErr) return NextResponse.json({ error: updErr.message, critique }, { status: 500 })

  await admin
    .from('bespoke_history')
    .insert({
      client_id: body.clientId,
      html_doc: currentHtml,
      brief: existing.brief,
      reference_urls: existing.reference_urls,
      model: critiqueModel,
      version: newVersion,
      generated_by: user.id,
      notes: noteBlurb,
    })

  return NextResponse.json({
    success: true,
    critique,
    applied: true,
    version: newVersion,
    rewrites,
    htmlBytes: currentHtml.length,
    latencyMs: totalLatency,
  })
}
