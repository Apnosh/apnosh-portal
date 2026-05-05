/**
 * Bespoke section regeneration. Rewrites ONE <section data-section="X">
 * block of the current bespoke HTML doc — leaves the rest untouched.
 *
 * Pipeline:
 *   1. Load current bespoke_sites.html_doc for the client
 *   2. Locate the <section data-section="X">...</section> block (or
 *      header/footer for nav/footer)
 *   3. Send Claude: full doc as style/voice context + the target block +
 *      operator instruction; ask for ONLY the replacement block
 *   4. Splice the replacement back in
 *   5. Save as a new version, snapshot to bespoke_history
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

interface RegenSectionRequest {
  clientId: string
  section: SectionName
  instruction?: string
}

const SYSTEM = `You are a senior brand designer + front-end engineer editing ONE section of an existing custom HTML+CSS restaurant website.

You will receive:
1. The COMPLETE current HTML document (so you understand the visual system, color palette, typography, voice, and surrounding sections)
2. The specific <section> block being regenerated
3. The operator's instruction for how this section should change
4. Rich client onboarding context (ground truth for voice + facts)

Your job:
- Keep the SAME visual system as the rest of the page (palette, typography, spacing scale, voice, density). The new section must look like it belongs.
- ONLY rewrite the requested section. Do not touch anything else.
- Respect existing CSS class naming patterns / custom properties — reuse them where possible. If you need new styles, inline them in a <style> block INSIDE the returned section element so they don't pollute the rest of the document.
- Preserve the exact data-section="..." attribute on the wrapper element.
- Anchor copy in client onboarding ground truth — never invent facts that contradict the profile.

Output: ONLY the replacement element, starting with the opening tag (e.g. <section data-section="hero" ...>) and ending with its matching closing tag. NO markdown fences, NO commentary, NO surrounding HTML, NO <html>/<body> wrappers. Just the single element.`.trim()

/** Locate a <section data-section="X">…</section> block (or header/footer for nav/footer). Returns indices or null. */
function findSectionBlock(html: string, name: SectionName): { tag: string; start: number; end: number } | null {
  // Try common tag names — Claude typically uses <section>, but nav→<header>/<nav>, footer→<footer>
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
    // Walk forward balancing same-tag opens/closes (rare but possible with nested <section>)
    const opener = new RegExp(`<${tag}\\b`, 'gi')
    const closer = new RegExp(`</${tag}\\s*>`, 'gi')
    opener.lastIndex = start + openMatch[0].length
    closer.lastIndex = start + openMatch[0].length
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

  const body = await req.json().catch(() => null) as RegenSectionRequest | null
  if (!body?.clientId || !body.section) {
    return NextResponse.json({ error: 'clientId + section required' }, { status: 400 })
  }
  if (!VALID_SECTIONS.includes(body.section)) {
    return NextResponse.json({ error: `section must be one of: ${VALID_SECTIONS.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('bespoke_sites')
    .select('html_doc, brief, version, reference_urls')
    .eq('client_id', body.clientId)
    .maybeSingle()

  if (!existing?.html_doc) {
    return NextResponse.json({ error: 'No bespoke site exists for this client yet — generate one first.' }, { status: 404 })
  }

  const block = findSectionBlock(existing.html_doc, body.section)
  if (!block) {
    return NextResponse.json({
      error: `Could not find <section data-section="${body.section}"> in current site. The site was likely generated before section markers were required — regenerate the full site once to enable per-section editing.`,
    }, { status: 422 })
  }

  const currentSectionHtml = existing.html_doc.slice(block.start, block.end)

  // Gather context for grounding
  const ctx = await gatherClientContext(body.clientId)
  const promptBlock = contextToPromptBlock(ctx)

  const userMessage = [
    '## Client onboarding context (ground truth)',
    promptBlock,
    '',
    '## Operator design brief (for the full site — keep this in mind)',
    existing.brief ?? '(no brief on file)',
    '',
    '## Section being regenerated',
    `data-section="${body.section}"`,
    '',
    '## Operator instruction',
    body.instruction?.trim() || `Improve the "${body.section}" section. Make it stronger, more anchored in this client's identity. Tighter copy, more deliberate visual hierarchy.`,
    '',
    '## Current section HTML (the one you are replacing)',
    '```html',
    currentSectionHtml,
    '```',
    '',
    '## FULL CURRENT DOCUMENT (for visual + voice context — do not modify, only the section above)',
    '```html',
    existing.html_doc,
    '```',
    '',
    'Return ONLY the replacement element. Preserve data-section="' + body.section + '". No fences, no commentary.',
  ].join('\n')

  const batchId = crypto.randomUUID()
  const startedAt = Date.now()
  let raw = ''
  let modelUsed = 'opus-fallback-chain'

  try {
    const anthropic = new Anthropic()
    const result = await callDesignModelWithFallback({
      anthropic,
      system: withDesignPrinciples(SYSTEM),
      userMessage,
      maxTokens: 16_000,
    })
    raw = result.text
    modelUsed = result.model
  } catch (e) {
    await logGeneration({
      clientId: body.clientId,
      taskType: 'design',
      model: modelUsed,
      inputSummary: { mode: 'bespoke-section-regen', section: body.section, instruction: body.instruction },
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

  // Extract — strip fences if Claude added them despite instructions
  let replacement = raw.trim()
  const fenceMatch = replacement.match(/```(?:html)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) replacement = fenceMatch[1].trim()

  // Validate — must contain data-section="<name>" and balance properly
  const dsRe = new RegExp(`data-section\\s*=\\s*["']${body.section}["']`)
  if (!dsRe.test(replacement)) {
    return NextResponse.json({
      error: `Replacement did not preserve data-section="${body.section}"`,
      raw: raw.slice(0, 500),
    }, { status: 502 })
  }
  // Quick sanity — strip any leading text before the first opening tag
  const firstOpen = replacement.search(/<[a-zA-Z]/)
  if (firstOpen > 0) replacement = replacement.slice(firstOpen)
  // Strip trailing junk after last closing tag
  const lastCloseIdx = replacement.lastIndexOf('>')
  if (lastCloseIdx >= 0) replacement = replacement.slice(0, lastCloseIdx + 1)

  // Splice back in
  const newHtml = existing.html_doc.slice(0, block.start) + replacement + existing.html_doc.slice(block.end)
  const newVersion = (existing.version ?? 0) + 1

  const generationId = await logGeneration({
    clientId: body.clientId,
    taskType: 'design',
    promptId: 'bespoke-regenerate-section',
    promptVersion: 'v1',
    model: modelUsed,
    inputSummary: {
      mode: 'bespoke-section-regen',
      section: body.section,
      instruction: body.instruction,
      previousVersion: existing.version,
    },
    outputSummary: { htmlBytes: newHtml.length, version: newVersion, sectionBytes: replacement.length },
    rawText: raw.length > 200_000 ? raw.slice(0, 200_000) : raw,
    batchId,
    latencyMs,
    createdBy: user.id,
  })

  // Update + history
  const { error: updErr } = await admin
    .from('bespoke_sites')
    .update({
      html_doc: newHtml,
      model: modelUsed,
      generation_ms: latencyMs,
      generation_id: generationId,
      version: newVersion,
      generated_at: new Date().toISOString(),
      generated_by: user.id,
      notes: `Section regen: ${body.section}${body.instruction ? ` — ${body.instruction}` : ''}`,
    })
    .eq('client_id', body.clientId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  await admin
    .from('bespoke_history')
    .insert({
      client_id: body.clientId,
      html_doc: newHtml,
      brief: existing.brief,
      reference_urls: existing.reference_urls,
      model: modelUsed,
      version: newVersion,
      generated_by: user.id,
      notes: `Section regen: ${body.section}${body.instruction ? ` — ${body.instruction}` : ''}`,
    })

  return NextResponse.json({
    success: true,
    version: newVersion,
    section: body.section,
    htmlBytes: newHtml.length,
    sectionBytes: replacement.length,
    latencyMs,
    generationId,
  })
}
