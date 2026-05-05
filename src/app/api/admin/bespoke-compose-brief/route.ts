/**
 * Bespoke brief composer — automatically writes a deeply-tailored design
 * brief from the client's profile + existing website content. The AM
 * gets a thick, specific brief instead of a blank textarea, then can
 * tweak before generation.
 *
 * Pipeline:
 *   1. Read full client context (profile, brand, locations, reviews)
 *   2. Fetch existing website text content (clients.website)
 *   3. Fetch recent press/social bios if available
 *   4. Send everything to Claude Opus, asking it to compose a brief in
 *      the format the bespoke-generate endpoint expects (mood, typography,
 *      color, per-section, voice rules, what-not-to-do).
 *   5. Return the brief as text so the form can populate the textarea.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { gatherClientContext, contextToPromptBlock } from '@/lib/site-config/gather-context'
import { withDesignPrinciples, callDesignModelWithFallback } from '@/lib/site-config/claude-config'

export const maxDuration = 120

interface ComposeBriefRequest {
  clientId: string
  /** Optional direction the operator wants to bias the brief toward. */
  direction?: string
}

const SYSTEM = `You are a senior brand designer composing a website design brief for a small-business client.

You receive: full client onboarding context (goals, voice, customer types, why-choose, tone tags, photo style, locations) AND the existing website's actual content (so you can see what they currently say + how they speak).

Output: a thick, specific design brief that anchors EVERY visual + copy choice in the client's actual identity. The brief will be read by another Claude agent that generates a complete custom HTML+CSS site, so it must be specific enough that two different agents reading it would produce visually similar sites.

Format the brief with these sections (always include all):

THE BIG IDEA
One sentence. The promise the site has to deliver.

VISUAL DIRECTION
- Typography: name actual Google Fonts. Display + body. Style notes.
- Layout: structural moves (full-bleed, asymmetric, 100vh, etc.)
- Color: hex values for 4-6 colors. WHY each one. Where each used.
- Photography mood: what the photos should depict.
- Micro-interactions: restrained list.

PER-SECTION MOOD
Brief paragraph for each: hero, intro statement (if any), about, offerings/menu, locations, image breaker, testimonials, FAQ, footer.

VOICE RULES
- "Never use" list (cliches to avoid)
- "Always" rules (specific noun, named items, sensory)
- Brand quotes that should appear verbatim somewhere

WHAT NOT TO DO
Concrete bullet list of patterns to avoid.

QUALITY BAR
Single comparison sentence: "should look like X, not Y."

The brief should be 600-1000 words. Specific. Sensory. Anchored entirely in THIS client's profile — never generic.

Output ONLY the brief text. No preamble, no markdown headers wrapping the whole thing, no JSON. Just the brief, ready to paste into a textarea.`.trim()

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

  const body = await req.json().catch(() => null) as ComposeBriefRequest | null
  if (!body?.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  // Gather context
  const ctx = await gatherClientContext(body.clientId)
  if (!ctx.client.name) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  const promptBlock = contextToPromptBlock(ctx)

  // Fetch existing website content to anchor the brief
  let existingSiteText = ''
  if (ctx.client.website) {
    try {
      const res = await fetch(ctx.client.website, {
        headers: { 'User-Agent': 'Mozilla/5.0 Apnosh-BriefComposer/1.0' },
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
          .slice(0, 6_000)
      }
    } catch {
      // skip silently
    }
  }

  const userMessage = [
    '## Client onboarding context',
    promptBlock,
    '',
    existingSiteText && '## Existing website content (their current voice + claims)',
    existingSiteText && existingSiteText,
    '',
    body.direction && '## Operator direction (bias the brief toward this)',
    body.direction && body.direction.trim(),
    '',
    'Compose the design brief now. Use the brand quotes verbatim. Use the actual customer types named in the profile. Use the actual differentiator. Build everything around their specific identity, not a generic template.',
  ].filter(Boolean).join('\n')

  try {
    const anthropic = new Anthropic()
    const result = await callDesignModelWithFallback({
      anthropic,
      system: withDesignPrinciples(SYSTEM),
      userMessage,
      maxTokens: 4_000,
    })
    return NextResponse.json({ success: true, brief: result.text.trim(), model: result.model })
  } catch (e) {
    return NextResponse.json({
      error: 'Claude request failed',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 502 })
  }
}
