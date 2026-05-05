/**
 * Pull content from one or more external URLs (existing website, menu page,
 * GBP listing, social profile, press, etc.) and extract them into a partial
 * RestaurantSite update.
 *
 * Multi-source mode lets the operator paste a website + menu + Google
 * profile in one call. We fetch all in parallel, label each block by kind,
 * and send to Claude in a single combined prompt so it can reason
 * holistically (e.g. menu items inform the hero promise).
 *
 * Strategy:
 *   1. Server-side fetch each URL. Strip HTML to readable text (basic).
 *   2. Send to Claude with a labeled multi-source block + scope hint.
 *   3. Apply as a draft update on the client's site_configs row.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

type SourceKind = 'website' | 'menu' | 'gbp' | 'social' | 'press' | 'auto'

interface SourceInput {
  url: string
  kind?: SourceKind
}

interface ExtractRequest {
  clientId: string
  /** Either a single URL+kind, or an array of sources. */
  url?: string
  kind?: SourceKind
  sources?: SourceInput[]
  /** If present, only update these top-level sections. */
  scope?: (keyof RestaurantSite)[]
  /** If true (default true), apply directly to draft. Else just return. */
  apply?: boolean
}

interface FetchedSource {
  url: string
  kind: SourceKind
  contentType: string
  text: string
  error?: string
}

const SYSTEM = `You are a content extraction assistant for a website builder. You receive raw text content scraped from one or more URLs (each labeled with a "kind" hint), and you output a partial RestaurantSite JSON containing what you can confidently extract across all sources.

You may merge information from different sources — e.g. menu page populates offerings, GBP populates locations + testimonials, website populates about + FAQ, social populates voice cues. The same field from multiple sources should be reconciled (prefer the most authoritative source: GBP for hours, website for tagline, menu page for offerings).

NEVER fabricate. If a field isn't visible in any source, omit it. Output STRICT JSON only — no markdown.

Allowed top-level keys (include only those you have content for):
  identity, brand, hero, locations, offerings, about, testimonials,
  gallery, contact, reservation, social, seo, statBand, footer

Per kind:

"website" — homepage of an existing site. Extract: identity.tagline,
  hero.headline + subhead, about.body, offerings.categories list, FAQs
  if present, social URLs, reservation URL if linked, locations from
  contact info.

"menu" — menu page or PDF text. Extract: offerings.categories with
  populated category descriptions if visible. Map AYCE programs into
  offerings.ayce.

"gbp" — Google Business Profile or Maps listing. Extract:
  locations[*].address, hours, phone, googleMapsUrl. Pull testimonials
  from reviews if visible (rating, author, source: "google").

"social" — Instagram bio, TikTok bio, LinkedIn page. Extract: voice
  cues for brand.voiceNotes, hero.eyebrow + tagline candidates, social
  URLs.

"press" — press article or feature. Extract: testimonials with
  source: "press", quote verbatim.

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
  if (!body?.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  // Normalize to array of sources
  const inputs: SourceInput[] = body.sources?.length
    ? body.sources
    : body.url
      ? [{ url: body.url, kind: body.kind }]
      : []

  if (inputs.length === 0) {
    return NextResponse.json({ error: 'At least one URL is required' }, { status: 400 })
  }

  // Cap to a reasonable number to keep prompt budget sane
  const capped = inputs.slice(0, 6)

  // 1. Fetch all in parallel
  const fetched: FetchedSource[] = await Promise.all(capped.map(async (src) => {
    const url = normalizeUrl(src.url)
    if (!url) return { url: src.url, kind: src.kind ?? 'auto', contentType: '', text: '', error: 'Invalid URL' }
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Apnosh-SiteBuilder/1.0)',
          Accept: 'text/html,*/*',
        },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        return { url, kind: src.kind ?? 'auto', contentType: '', text: '', error: `HTTP ${res.status}` }
      }
      const contentType = res.headers.get('content-type') ?? ''
      const raw = await res.text()
      const text = htmlToText(raw)
      const kind = src.kind === 'auto' || !src.kind ? autoDetectKind(url, text) : src.kind
      return { url, kind, contentType, text }
    } catch (e) {
      return {
        url,
        kind: src.kind ?? 'auto',
        contentType: '',
        text: '',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }))

  const ok = fetched.filter(f => !f.error && f.text.trim())
  if (ok.length === 0) {
    return NextResponse.json({
      error: 'No sources returned readable text',
      sources: fetched.map(f => ({ url: f.url, kind: f.kind, error: f.error || 'empty' })),
    }, { status: 422 })
  }

  // 2. Token budget — each source gets roughly equal share, capped at 50KB each
  const perSourceCap = Math.max(8_000, Math.floor(80_000 / ok.length))
  const blocks = ok.map((f, i) => {
    const truncated = f.text.length > perSourceCap
      ? f.text.slice(0, perSourceCap) + '\n…[truncated]'
      : f.text
    return `### Source ${i + 1} (kind: ${f.kind}) — ${f.url}\n${truncated}`
  }).join('\n\n---\n\n')

  const scopeHint = body.scope?.length
    ? `Restrict your output to these top-level keys ONLY: ${body.scope.join(', ')}.`
    : 'Output every top-level key you have content for across all sources.'

  const userMessage = [
    `## Sources (${ok.length})`,
    blocks,
    '',
    '## Scope',
    scopeHint,
    '',
    'Output the partial RestaurantSite JSON now. Reconcile across sources if multiple cover the same field.',
  ].join('\n')

  // 3. Single Claude call across all sources
  let raw: string
  try {
    const anthropic = new Anthropic()
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
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

  // 4. Parse JSON
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

  // 5. Apply if requested
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
    sources: fetched.map(f => ({
      url: f.url,
      kind: f.kind,
      bytes: f.text.length,
      error: f.error ?? null,
    })),
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

function autoDetectKind(url: string, text: string): SourceKind {
  const u = url.toLowerCase()
  if (u.includes('/menu') || u.endsWith('.pdf') || /menu/.test(text.slice(0, 1000).toLowerCase())) return 'menu'
  if (u.includes('google.com/maps') || u.includes('business.google.com') || u.includes('g.page/')) return 'gbp'
  if (
    u.includes('instagram.com') || u.includes('tiktok.com') ||
    u.includes('facebook.com') || u.includes('linkedin.com') ||
    u.includes('twitter.com') || u.includes('x.com')
  ) return 'social'
  if (u.includes('eater.com') || u.includes('seattletimes.com') || /press|review/.test(text.slice(0, 500).toLowerCase())) return 'press'
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
