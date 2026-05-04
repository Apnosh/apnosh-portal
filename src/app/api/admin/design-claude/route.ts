/**
 * Claude design generator — takes a vibe prompt + business context, returns
 * a full brand spec (palette, fonts, design system tokens, voice notes).
 *
 * Auth: admin only. Returns 401 for non-admins. Service-role-friendly.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const FONT_OPTIONS = [
  'Anton', 'Bebas Neue', 'Playfair Display', 'Archivo Black',
  'Fraunces', 'Space Grotesk', 'Cormorant Garamond', 'Oswald',
  'Inter', 'DM Sans', 'Archivo', 'Lato', 'Open Sans',
]

const SYSTEM = `You are a world-class brand designer producing a complete design spec for a small-business website. Output STRICT JSON only — no markdown, no commentary outside the JSON.

The JSON shape MUST be:
{
  "brand": {
    "primaryColor": "#RRGGBB",       // dominant brand color
    "secondaryColor": "#RRGGBB",     // foreground/secondary surface (often near-black or near-white)
    "accentColor": "#RRGGBB",        // softer accent for highlights
    "fontDisplay": "Anton" | "Bebas Neue" | "Playfair Display" | "Archivo Black" | "Fraunces" | "Space Grotesk" | "Cormorant Garamond" | "Oswald",
    "fontBody": "Inter" | "DM Sans" | "Archivo" | "Lato" | "Open Sans" | "Space Grotesk",
    "voiceNotes": "<one sentence describing the brand voice>"
  },
  "designSystem": {
    "radius": "sharp" | "subtle" | "soft" | "pillowy",
    "density": "airy" | "balanced" | "dense",
    "motion": "none" | "subtle" | "lively",
    "photoTreatment": "natural" | "duotone" | "tinted",
    "surface": "light" | "cream" | "dark",
    "typeWeight": "regular" | "medium" | "bold" | "black"
  },
  "rationale": "<one or two sentences explaining the design choices>"
}

Design principles:
- Choose colors that pass WCAG AA contrast for text-on-primary use cases
- Match font weight to the vertical: bold/black for restaurants & sports bars, regular/medium for fine dining or boutique retail
- Surface "dark" pairs with motion "subtle" + photo "duotone" for moody venues
- Surface "cream" feels artisan, surface "light" feels modern/minimal
- Density "airy" reads upscale, "dense" reads editorial/utilitarian
- Pillowy radius reads casual/playful, sharp radius reads classic/luxe
`.trim()

export async function POST(req: NextRequest) {
  // Admin-only gate
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

  const body = await req.json().catch(() => null) as {
    prompt?: string
    context?: { displayName?: string; tagline?: string; vertical?: string }
  } | null

  const prompt = body?.prompt?.trim()
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  const ctx = body?.context ?? {}
  const userMessage = [
    `Vibe / direction: ${prompt}`,
    `Business name: ${ctx.displayName ?? '(unnamed)'}`,
    `Tagline: ${ctx.tagline ?? '(none)'}`,
    `Vertical: ${ctx.vertical ?? 'restaurant'}`,
    '',
    `Allowed display fonts: ${FONT_OPTIONS.slice(0, 8).join(', ')}`,
    `Allowed body fonts: Inter, DM Sans, Archivo, Lato, Open Sans, Space Grotesk`,
    '',
    'Return the JSON spec now.',
  ].join('\n')

  try {
    const anthropic = new Anthropic()
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = msg.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('\n')

    // Extract JSON — Claude may wrap in ```json``` despite instructions
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Claude returned non-JSON response', raw: text.slice(0, 200) }, { status: 502 })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch (e) {
      return NextResponse.json({ error: 'Failed to parse Claude JSON', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (e) {
    return NextResponse.json({
      error: 'Claude request failed',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
