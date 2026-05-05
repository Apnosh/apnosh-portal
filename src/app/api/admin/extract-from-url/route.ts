/**
 * Pull content from an external URL (existing website, menu page, GBP
 * listing, social profile) and extract it into a partial RestaurantSite
 * update.
 *
 * Strategy:
 *   1. Server-side fetch the URL. Strip HTML to readable text (basic).
 *   2. Send to Claude with the kind hint ("website" / "menu" / "gbp" /
 *      "social") so it knows what shape to extract.
 *   3. Apply as a draft update on the client's site_configs row.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

interface ExtractRequest {
  clientId: string
  url: string
  /** What kind of source — affects the extraction prompt. */
  kind?: 'website' | 'menu' | 'gbp' | 'social' | 'auto'
  /** If present, only update these top-level sections. */
  scope?: (keyof RestaurantSite)[]
  /** If true (default false), apply directly to draft. Else just return. */
  apply?: boolean
}

const SYSTEM = `You are a content extraction assistant for a website builder. You receive raw text content scraped from a URL plus a "kind" hint, and you output a partial RestaurantSite JSON containing what you can confidently extract.

NEVER fabricate. If a field isn't visible in the source content, omit it. Output STRICT JSON only — no markdown.

Allowed top-level keys (include only those you have content for):
  identity, brand, hero, locations, offerings, about, testimonials,
  gallery, contact, reservation, social, seo, statBand, footer

Per kind:

"website" — homepage of an existing site. Extract: identity.tagline,
  hero.headline + subhead, about.body, offerings.categories list, FAQs
  if present, social URLs, reservation URL if linked, locations from
  contact info.

"menu" — menu page or PDF text. Extract: offerings.categories with
  populated category descriptions if visible. (Detailed item rows
  belong in the menu_items table — out of scope here, but list the
  top categories you see.) Map AYCE programs into offerings.ayce.

"gbp" — Google Business Profile page or listing. Extract:
  locations[*].address, hours, phone, googleMapsUrl. Pull testimonials
  from reviews if visible (use rating, author, source: "google").

"social" — Instagram bio, TikTok bio, LinkedIn page. Extract: voice
  cues for brand.voiceNotes, hero.eyebrow + tagline candidates.

Constraints:
- All hex colors valid #RRGGBB
- Keep string lengths within RestaurantSite limits
- Locations must include id (kebab-case), name, address, city, state, zip, hours[], features[], isPrimary
- Testimonials with quotes verbatim from the source
- DO NOT make up names, hours, or phone numbers — extract or omit`.trim()

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

  const body = await req.json().catch(() => null) as ExtractRequest | null
  if (!body?.clientId || !body.url?.trim()) {
    return NextResponse.json({ error: 'clientId and url are required' }, { status: 400 })
  }

  const url = normalizeUrl(body.url)
  if (!url) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })

  // 1. Fetch
  let pageText: string
  let contentType = ''
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Apnosh-SiteBuilder/1.0)',
        Accept: 'text/html,*/*',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Source returned HTTP ${res.status}` }, { status: 502 })
    }
    contentType = res.headers.get('content-type') ?? ''
    const raw = await res.text()
    pageText = htmlToText(raw).slice(0, 60_000) // cap for token budget
  } catch (e) {
    return NextResponse.json({
      error: 'Could not fetch URL',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 502 })
  }

  if (!pageText.trim()) {
    return NextResponse.json({ error: 'Source page returned no readable text' }, { status: 422 })
  }

  // 2. Detect kind if auto
  const kind = body.kind === 'auto' || !body.kind ? autoDetectKind(url, pageText) : body.kind

  const scopeHint = body.scope?.length
    ? `Restrict your output to these top-level keys ONLY: ${body.scope.join(', ')}.`
    : 'Output every top-level key you have content for.'

  const userMessage = [
    `## Source URL\n${url}`,
    `## Source kind\n${kind}`,
    `## Content type\n${contentType}`,
    `## Scope\n${scopeHint}`,
    '## Extracted page text (truncated)',
    pageText,
    '',
    'Output the partial RestaurantSite JSON now.',
  ].join('\n')

  let raw: string
  try {
    const anthropic = new Anthropic()
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6144,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    })
    raw = msg.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('\n')
  } catch (e) {
    return NextResponse.json({
      error: 'Claude request failed',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 502 })
  }

  // 3. Parse
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Claude returned non-JSON', raw: raw.slice(0, 300) }, { status: 502 })
  }
  let patch: Record<string, unknown>
  try {
    patch = JSON.parse(jsonMatch[0])
  } catch (e) {
    return NextResponse.json({
      error: 'JSON parse failed',
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 502 })
  }

  // 4. Apply if requested
  let appliedSite: RestaurantSite | null = null
  if (body.apply !== false) {
    const admin = createAdminClient()
    const { data: row } = await admin
      .from('site_configs')
      .select('draft_data')
      .eq('client_id', body.clientId)
      .maybeSingle()
    if (!row) {
      return NextResponse.json({ error: 'Site config not found — generate first' }, { status: 404 })
    }
    const currentDraft = row.draft_data as RestaurantSite
    const merged = deepMerge(currentDraft as unknown, patch) as RestaurantSite
    const { error: upErr } = await admin
      .from('site_configs')
      .update({ draft_data: merged })
      .eq('client_id', body.clientId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    appliedSite = merged
  }

  return NextResponse.json({
    success: true,
    kind,
    patch,
    site: appliedSite,
  })
}

// ----- Helpers -----

function normalizeUrl(input: string): string | null {
  let v = input.trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v
  try {
    const u = new URL(v)
    return u.href
  } catch {
    return null
  }
}

function autoDetectKind(url: string, text: string): ExtractRequest['kind'] {
  const u = url.toLowerCase()
  if (u.includes('/menu') || u.endsWith('.pdf') || /menu/.test(text.slice(0, 1000).toLowerCase())) return 'menu'
  if (u.includes('google.com/maps') || u.includes('business.google.com')) return 'gbp'
  if (u.includes('instagram.com') || u.includes('tiktok.com') || u.includes('facebook.com') || u.includes('linkedin.com')) return 'social'
  return 'website'
}

/** Bare-bones HTML-to-text. Strips scripts, styles, tags, normalizes whitespace. */
function htmlToText(html: string): string {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  const noTags = noScripts.replace(/<[^>]+>/g, ' ')
  const decoded = noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return decoded.replace(/\s+/g, ' ').trim()
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
