/**
 * Bespoke generation: Claude Opus produces a complete, custom-coded
 * HTML+CSS site for the client. Maximum design freedom — no schema
 * constraints, no template instantiation. The output IS the site.
 *
 * Pipeline:
 *   1. Gather rich client context (profile, brand, locations, gold
 *      examples from past published sites).
 *   2. Optionally fetch reference URLs the operator provided so Claude
 *      can study competitive/inspirational sites.
 *   3. Stream Opus with a "you are a senior brand designer building a
 *      complete custom Next.js + custom CSS site" system prompt.
 *   4. Validate the HTML output is well-formed.
 *   5. Persist into bespoke_sites + append to bespoke_history.
 *   6. Return for serving via /bespoke/sites/[slug].
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gatherClientContext, contextToPromptBlock } from '@/lib/site-config/gather-context'
import { withDesignPrinciples, callDesignModelWithFallback } from '@/lib/site-config/claude-config'
import { logGeneration } from '@/lib/ai/log-generation'
import { getGoldExamples, goldExamplesPromptSection } from '@/lib/ai/few-shot'
import crypto from 'node:crypto'

export const maxDuration = 300

interface BespokeRequest {
  clientId: string
  brief: string
  referenceUrls?: string[]
  notes?: string
}

const SYSTEM = `You are a world-class brand designer + senior front-end engineer producing a COMPLETE custom-coded restaurant website as a single HTML document for a SPECIFIC client.

You will receive:
1. Rich onboarding context about THIS client (goals, voice, customer types, why-choose, tone tags, photo style, brand colors, locations, signature items)
2. Their existing website's actual text content (so you can see how they currently speak)
3. Recent customer reviews verbatim
4. Optional reference URLs for inspiration
5. The operator's design brief

Treat all of this as ground truth. The site must feel like an evolution of THIS specific client's identity, not a generic restaurant template.

CRITICAL — anchor every choice in the client's actual identity:
- Use the brand colors from the Visual brand block as the primary palette (primary_color, secondary_color, accent_color)
- Use the brand fonts from the profile when specified
- Use brand quotes from voice_notes / custom_tone VERBATIM somewhere prominent on the page
- Lead the hero with the unique_differentiator from the profile
- Reference actual location names, addresses, phone numbers, hours from the locations block
- Pull testimonial quotes verbatim from the recent_reviews context — do NOT invent reviews
- Use the customer_types when reasoning about who the site should speak to
- Use the why_choose list as the actual content for the "why this restaurant" section
- Use signature_items / main_offerings to populate the menu/offerings section
- Honor the tone_tags + custom_tone in every line of copy

Output: ONE complete, valid HTML document, starting with <!DOCTYPE html>. Inline all CSS in a single <style> block in the <head>. NO external CSS dependencies except Google Fonts (which you may load via <link>). Use only vanilla HTML + CSS — no JavaScript framework, no React, no build step required.

Design freedom — use sophisticated techniques:
- CSS Grid, asymmetric compositions, full-bleed photography
- Large typography, font-feature-settings (ss01, oldstyle-nums on hours/numbers)
- Considered type scale: hero 7-9rem, h2 3-5rem, body 1rem-1.15rem
- Thoughtful color systems with proper contrast (WCAG AA minimum)
- Micro-interactions: hover states, smooth transitions, restrained motion
- Real photo placeholders using brand-tinted CSS gradients (NEVER stock images, NEVER unsplash, NEVER lorem ipsum images)
- Sticky elements, scroll-snap, view-transitions where they earn their place

Standard sections (order thoughtfully): nav, hero, intro statement, about, offerings/menu, locations (one per location), image breaker, testimonials, FAQ, footer.

AVOID at all costs:
- Generic restaurant phrases: "welcome to", "best in town", "passion-driven", "where friends become family", "premier dining experience", "authentic flavors"
- Stock unsplash/pexels imagery (use brand-tinted CSS gradient placeholders instead)
- Card-heavy SaaS layouts
- Fake testimonials (use real ones from the reviews context, or omit testimonials entirely)
- Cookie-cutter "About us" / "Why choose us" framing
- Newsletter signups in the hero
- Carousel sliders
- Star-counter widgets
- Emoji as decoration

Quality bar: this should look like a $30K branding agency website that the client could publish today. Every line of copy should sound like THIS client wrote it. Every visual choice should feel deliberate, anchored in their actual brand. If a stranger visited the site, they should be able to tell what makes this place specifically different from every other restaurant in 3 seconds.

The output must be ONLY the complete HTML document. No markdown fences, no commentary outside the HTML, no JSON wrapper. Just <!DOCTYPE html>...</html>.`.trim()

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

  const body = await req.json().catch(() => null) as BespokeRequest | null
  if (!body?.clientId || !body.brief?.trim()) {
    return NextResponse.json({ error: 'clientId + brief required' }, { status: 400 })
  }

  // Gather context
  const ctx = await gatherClientContext(body.clientId)
  if (!ctx.client.name) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  const promptBlock = contextToPromptBlock(ctx)
  const goldExamples = await getGoldExamples('restaurant', 2)
  const goldSection = goldExamplesPromptSection(goldExamples)

  // Auto-fetch the client's existing website — anchors the new design in
  // their actual current voice (which we want to evolve, not replace).
  let existingSiteText = ''
  if (ctx.client.website) {
    try {
      const res = await fetch(ctx.client.website, {
        headers: { 'User-Agent': 'Mozilla/5.0 Apnosh-Bespoke/1.0' },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const html = await res.text()
        existingSiteText = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 10_000)
      }
    } catch {
      // skip silently
    }
  }

  // Fetch operator-provided reference URLs (separate from auto-fetched existing site)
  const refContent: string[] = []
  if (body.referenceUrls && body.referenceUrls.length > 0) {
    await Promise.all(body.referenceUrls.slice(0, 4).map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 Apnosh-Bespoke/1.0' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return
        const html = await res.text()
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 8_000)
        refContent.push(`### Reference: ${url}\n${text}`)
      } catch {
        // skip silent
      }
    }))
  }

  const userMessage = [
    '## Client onboarding context',
    promptBlock,
    '',
    existingSiteText && '## Existing website content — current voice + claims (evolve this, do not contradict it)',
    existingSiteText && `Source: ${ctx.client.website}`,
    existingSiteText && existingSiteText,
    existingSiteText && '',
    goldSection,
    refContent.length > 0 ? '## External reference sites (study for inspiration on layout, voice, density — NOT to copy)' : '',
    refContent.length > 0 ? refContent.join('\n\n') : '',
    '',
    '## Operator design brief',
    body.brief.trim(),
    '',
    'Generate the complete HTML document now. Anchor every choice (palette, typography, voice, hero copy, location descriptions, FAQs) in the client onboarding context above — that is THE source of truth for who this client is. Do not invent details that contradict it.',
    '',
    'ONLY output the HTML — no preamble, no JSON, no commentary, no markdown fences. Start with <!DOCTYPE html>.',
  ].filter(Boolean).join('\n')

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
      maxTokens: 32_000,  // big — full HTML doc with rich CSS easily 20K+ tokens
    })
    raw = result.text
    modelUsed = result.model
  } catch (e) {
    await logGeneration({
      clientId: body.clientId,
      taskType: 'design',
      model: modelUsed,
      inputSummary: { brief: body.brief, referenceUrls: body.referenceUrls, mode: 'bespoke' },
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

  // Extract HTML — strip any leading/trailing fences or commentary
  let htmlDoc = raw.trim()
  // If wrapped in ```html ... ```
  const fenceMatch = htmlDoc.match(/```(?:html)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) htmlDoc = fenceMatch[1].trim()
  // Cut anything before <!DOCTYPE if Claude added preamble
  const doctypeIdx = htmlDoc.search(/<!DOCTYPE\s+html/i)
  if (doctypeIdx > 0) htmlDoc = htmlDoc.slice(doctypeIdx)
  // Validate basic structure
  if (!/<!DOCTYPE\s+html/i.test(htmlDoc) || !/<\/html>/i.test(htmlDoc)) {
    return NextResponse.json({
      error: 'Claude did not return a complete HTML document',
      raw: raw.slice(0, 500),
    }, { status: 502 })
  }

  // Persist — upsert to bespoke_sites + append to bespoke_history
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('bespoke_sites')
    .select('version')
    .eq('client_id', body.clientId)
    .maybeSingle()
  const newVersion = (existing?.version ?? 0) + 1

  const generationId = await logGeneration({
    clientId: body.clientId,
    taskType: 'design',
    promptId: 'bespoke-generate',
    promptVersion: 'v1',
    model: modelUsed,
    inputSummary: { brief: body.brief, referenceUrls: body.referenceUrls, mode: 'bespoke', refsFetched: refContent.length },
    outputSummary: { htmlBytes: htmlDoc.length, version: newVersion } as Record<string, unknown>,
    rawText: raw.length > 200_000 ? raw.slice(0, 200_000) : raw,
    batchId,
    latencyMs,
    createdBy: user.id,
  })

  if (existing) {
    const { error } = await admin
      .from('bespoke_sites')
      .update({
        html_doc: htmlDoc,
        reference_urls: body.referenceUrls ?? null,
        brief: body.brief,
        model: modelUsed,
        generation_ms: latencyMs,
        generation_id: generationId,
        version: newVersion,
        generated_at: new Date().toISOString(),
        generated_by: user.id,
        notes: body.notes ?? null,
      })
      .eq('client_id', body.clientId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await admin
      .from('bespoke_sites')
      .insert({
        client_id: body.clientId,
        html_doc: htmlDoc,
        reference_urls: body.referenceUrls ?? null,
        brief: body.brief,
        model: modelUsed,
        generation_ms: latencyMs,
        generation_id: generationId,
        version: newVersion,
        generated_by: user.id,
        notes: body.notes ?? null,
      })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Snapshot to history
  await admin
    .from('bespoke_history')
    .insert({
      client_id: body.clientId,
      html_doc: htmlDoc,
      brief: body.brief,
      reference_urls: body.referenceUrls ?? null,
      model: modelUsed,
      version: newVersion,
      generated_by: user.id,
      notes: body.notes ?? null,
    })

  return NextResponse.json({
    success: true,
    version: newVersion,
    htmlBytes: htmlDoc.length,
    latencyMs,
    generationId,
  })
}
