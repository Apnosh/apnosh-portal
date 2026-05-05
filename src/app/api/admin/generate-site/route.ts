/**
 * Generate a complete RestaurantSite draft from the client's profile data.
 *
 * Pulls every relevant column we collected during onboarding (goals, voice,
 * customer types, differentiators, locations, etc.) and asks Claude to
 * compose a tailored full-site config. Result is validated against the
 * Zod schema and dropped into site_configs.draft_data.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gatherClientContext, contextToPromptBlock } from '@/lib/site-config/gather-context'
import { RestaurantSiteSchema, RESTAURANT_DEFAULTS } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import { withDesignPrinciples, callDesignModelWithFallback } from '@/lib/site-config/claude-config'
import { STRATEGY_FIRST_INSTRUCTION } from '@/lib/design-quality'
import { extractJsonFromClaude } from '@/lib/site-config/json-extract'

export const maxDuration = 300

const SYSTEM = `You are a world-class brand designer + copywriter producing a complete website spec for a small business.

You receive rich onboarding data: business goals, voice notes, customer types, differentiators, locations, reviews. Use ALL of it. The output must feel hand-crafted for THIS specific business — not generic.

Output STRICT JSON only — no markdown fences, no commentary, no leading/trailing text. The JSON shape MUST match this RestaurantSite schema exactly:

{
  "identity": { "displayName": string, "vertical": "restaurant", "templateId": "restaurant-bold", "tagline": string },
  "brand": {
    "primaryColor": "#RRGGBB",
    "secondaryColor": "#RRGGBB",
    "accentColor": "#RRGGBB",
    "fontDisplay": "Anton" | "Bebas Neue" | "Playfair Display" | "Archivo Black" | "Fraunces" | "Space Grotesk" | "Cormorant Garamond" | "Oswald",
    "fontBody": "Inter" | "DM Sans" | "Archivo" | "Lato" | "Open Sans" | "Space Grotesk",
    "logoUrl": null | string,
    "voiceNotes": string,
    "designSystem": {
      "radius": "sharp" | "subtle" | "soft" | "pillowy",
      "density": "airy" | "balanced" | "dense",
      "motion": "none" | "subtle" | "lively",
      "photoTreatment": "natural" | "duotone" | "tinted",
      "surface": "light" | "cream" | "dark",
      "typeWeight": "regular" | "medium" | "bold" | "black"
    }
  },
  "hero": {
    "eyebrow": string (under 28 chars),
    "headline": string (under 72 chars, the brand promise — punchy, not generic),
    "subhead": string (under 220 chars, what they offer + where),
    "photoUrl": null,
    "primaryCta": { "label": string, "url": "#" }
  },
  "locations": [ { "id": kebab-case slug, "name": string, "tagline": string, "address": string, "city": string, "state": string, "zip": string, "phone": null, "phoneHref": null, "email": null, "googleMapsUrl": maps URL, "vibe": one paragraph, "hours": [{label, value}], "features": string[], "isPrimary": boolean, "photoUrl": null } ],
  "offerings": {
    "ayce": { "premium"?: { "enabled": true, "name": ..., "subtitle": ..., "meatCount": int, "sideCount": int, "highlights": string[] }, "supreme"?: same shape },
    "categories": [ { "id": slug, "name": string, "description": string } ]
  },
  "about": {
    "headline": string (the soul of the place in one line),
    "body": string (3 short paragraphs separated by \\n\\n, evocative, NOT marketing-speak),
    "photoUrl": null,
    "values": [ { "title": string (under 40 chars), "body": string (under 220 chars) } ]   // exactly 3 values
  },
  "testimonials": {
    "enabled": boolean (true if reviews provided),
    "heading": string,
    "items": [ { "quote": string, "author": string, "role": string, "rating": int 1-5 or null, "source": "google"|"yelp"|"tripadvisor"|"press"|"customer"|"other"|null, "photoUrl": null } ]
  },
  "gallery": { "enabled": false, "heading": "Photos", "description": "", "photos": [] },
  "contact": {
    "intro": string,
    "faqs": [ { "q": string, "a": string } ]   // 4-5 questions a real customer would ask, with concrete answers
  },
  "reservation": { "enabled": boolean, "provider": string|null, "url": string|null, "ctaLabel": string },
  "social": { "instagram": url|null, "tiktok": url|null, "facebook": url|null, "twitter": null, "youtube": null, "linkedin": null },
  "seo": {
    "title": string (under 70 chars, format: "Brand — what you do · where"),
    "description": string (under 180 chars, includes location + offering + voice flavor),
    "ogImageUrl": null
  },
  "statBand": { "enabled": boolean, "stats": [{ "value": string, "label": string }] (up to 3) },
  "footer": { "tagline": string|null, "copyright": null }
}

Design rules:
- ALWAYS extract the brand voice from tone_tags + custom_tone + voice_notes; reflect it in copy
- The PRIMARY GOAL drives the hero copy. If goal is "make Alki the waterfront destination", lead the headline with waterfront + dining-as-experience.
- Match designSystem to the vibe: KBBQ/steakhouse → bold/black/dark; fine dining → editorial/regular/cream; cafe → soft/medium/cream; brewery → tech-modern; cocktail bar → luxe/duotone/dark
- Pull AYCE counts from main_offerings text if mentioned (e.g. "AYCE Premium 28 meats + 11 sides")
- Generate ONE FAQ per common customer concern: hours/walk-ins, AYCE rules, parking, group bookings, allergies — informed by service_styles and customer_types
- Generate values that reflect THIS business's why-choose list, not generic niceties
- Testimonials: if review quotes are provided, use them verbatim; cap rating field at 5
- Stat band: prefer concrete numbers from main_offerings or location_count, not vanity metrics
- Keep ALL strings within the listed character limits
- Cities like "Seattle" + "Kent" → use proper hours patterns for that timezone
- If a primary color is given, USE IT — don't override with your own
- Tagline is short positioning (≤120 chars), often a derivative of voice_notes`.trim()

interface GenerateRequest { clientId: string }

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

  const body = await req.json().catch(() => null) as GenerateRequest | null
  if (!body?.clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 })

  // 1. Gather context
  const ctx = await gatherClientContext(body.clientId)
  if (!ctx.client.name) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }
  const promptBlock = contextToPromptBlock(ctx)

  // 2. Call Claude (Opus + strategy-first + design principles for top quality)
  let raw: string
  try {
    const anthropic = new Anthropic()
    const result = await callDesignModelWithFallback({
      anthropic,
      system: withDesignPrinciples(`${SYSTEM}\n\n${STRATEGY_FIRST_INSTRUCTION}`),
      userMessage: `${promptBlock}\n\n---\nThink through strategy first, then output the JSON. Use every piece of context above.`,
      maxTokens: 12_000,
    })
    raw = result.text
  } catch (e) {
    return NextResponse.json({
      error: 'Claude request failed',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 502 })
  }

  // 3. Extract JSON
  const extracted = extractJsonFromClaude(raw)
  if ('error' in extracted) {
    return NextResponse.json({
      error: extracted.error,
      raw: extracted.raw,
    }, { status: 502 })
  }
  const parsed = extracted.json

  // 4. Schema validate (lenient — fall back to defaults for any missing field)
  let validated: RestaurantSite
  try {
    const merged = deepMerge(RESTAURANT_DEFAULTS, parsed) as RestaurantSite
    const result = RestaurantSiteSchema.safeParse(merged)
    if (!result.success) {
      // Attempt recovery: keep what passes, default the rest
      console.warn('[generate-site] schema issues:', JSON.stringify(result.error.issues.slice(0, 5), null, 2))
      validated = merged
    } else {
      validated = result.data
    }
  } catch (e) {
    return NextResponse.json({
      error: 'Validation failed',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 502 })
  }

  // 5. Persist as draft (lazy-create row if missing)
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('site_configs')
    .select('client_id')
    .eq('client_id', body.clientId)
    .maybeSingle()

  if (existing) {
    const { error } = await admin
      .from('site_configs')
      .update({
        vertical: 'restaurant',
        template_id: 'restaurant-bold',
        draft_data: validated,
      })
      .eq('client_id', body.clientId)
    if (error) {
      return NextResponse.json({ error: 'Failed to save draft', detail: error.message }, { status: 500 })
    }
  } else {
    const { error } = await admin
      .from('site_configs')
      .insert({
        client_id: body.clientId,
        vertical: 'restaurant',
        template_id: 'restaurant-bold',
        draft_data: validated,
      })
    if (error) {
      return NextResponse.json({ error: 'Failed to insert draft', detail: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, site: validated })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, patch: any): any {
  if (patch == null) return base
  if (Array.isArray(base) || Array.isArray(patch)) return patch ?? base
  if (typeof base !== 'object' || typeof patch !== 'object') return patch ?? base
  const out: Record<string, unknown> = { ...base }
  for (const k of Object.keys(patch)) {
    out[k] = deepMerge(base[k], patch[k])
  }
  return out
}
