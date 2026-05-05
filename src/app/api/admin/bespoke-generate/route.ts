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

const SYSTEM = `You are a world-class brand designer + senior front-end engineer producing a COMPLETE custom-coded restaurant website as a single HTML document.

Output: ONE complete, valid HTML document, starting with <!DOCTYPE html>. Inline all CSS in a single <style> block in the <head>. NO external CSS dependencies except Google Fonts (which you may load via <link>). Use only vanilla HTML + CSS — no JavaScript framework, no React, no build step required.

Design freedom: this is the bespoke premium tier. Every detail is customizable. You should:
- Design a visual identity that feels uniquely tailored to THIS specific client
- Use sophisticated layout techniques: CSS Grid, asymmetric compositions, full-bleed photography, large typography, sticky elements, scroll-triggered transitions where appropriate (CSS-only)
- Use rich typography: Google Fonts loaded via <link>, considered type scale, font-feature-settings
- Use thoughtful color systems: 5-7 colors with proper contrast, gradients where appropriate
- Use micro-interactions: hover states, smooth transitions on all interactive elements
- Honor brand voice in every line of copy — do NOT use generic restaurant phrases
- Lead with the client's actual differentiator from their profile
- Include all standard sections: nav, hero, locations, offerings/menu, about, FAQ, footer
- AVOID generic patterns: "welcome to", "best in town", "passion-driven", "where friends become family"

Quality bar: this should look like a $30K branding agency website, not a template. If it looks like every other restaurant site, you've failed.

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

  // Fetch reference URLs (extract text content for Claude to reason about)
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
    goldSection,
    refContent.length > 0 ? '## Reference sites (study these for inspiration on layout, voice, density)' : '',
    refContent.length > 0 ? refContent.join('\n\n') : '',
    '',
    '## Operator design brief',
    body.brief.trim(),
    '',
    'Generate the complete HTML document now. ONLY output the HTML — no preamble, no JSON, no commentary, no markdown fences. Start with <!DOCTYPE html>.',
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
