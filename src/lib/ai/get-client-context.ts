/**
 * Retrieval helper for every AI call. Per principle #6 in
 * docs/AI-FIRST-PRINCIPLES.md: AI never runs blind on just a prompt.
 *
 * Before any AI generation about a client, call this to assemble:
 *   - active client_knowledge_facts (structured KB)
 *   - top-performing recent social posts (last 90d, by total_interactions)
 *   - last 3 editorial themes + their pillars
 *   - brand voice samples (last 5 approved captions or drafts)
 *   - current brand_brand_guidelines record (with version)
 *   - cross-client signal (anonymized patterns from similar clients) -- TODO
 *
 * The result feeds the AI prompt and also gets recorded in
 * ai_generation_inputs so we can audit "why did the AI say X" and
 * later analyze "does richer retrieval improve outputs".
 *
 * Designed to be cheap: one parallel batch of small selects, bounded
 * by recency or count. Total round-trips: 5.
 */

import { cache } from 'react'
import { createClient as createServerClient } from '@/lib/supabase/server'

export interface ClientContextFact {
  id: string
  category: string
  fact: string
  confidence: string
}

export interface ClientContextPost {
  id: string
  caption: string | null
  reach: number
  totalInteractions: number
  postedAt: string | null
  platform: string | null
}

export interface ClientContextTheme {
  id: string
  month: string | null
  themeName: string | null
  themeBlurb: string | null
  pillars: unknown
  version: number
}

export type ClientContextBrand = {
  brandVoice: unknown
  visualStyle: unknown
  colors: unknown
  version: number
} | null

export interface ClientContext {
  clientId: string
  clientName: string | null
  facts: ClientContextFact[]
  topPosts: ClientContextPost[]
  recentThemes: ClientContextTheme[]
  brand: ClientContextBrand
  /** Stable string suitable for inlining into a prompt. */
  promptSummary: string
  /** Capture this and pass to ai_generation_inputs.retrieved_* arrays. */
  retrieval: {
    factIds: string[]
    postIds: string[]
    themeIds: string[]
    brandVersion: number | null
  }
}

const POST_LOOKBACK_DAYS = 90
const TOP_POSTS_LIMIT = 10
const THEMES_LIMIT = 3
const FACTS_LIMIT = 50

export const getClientContext = cache(
  async (clientId: string): Promise<ClientContext> => {
    const supabase = await createServerClient()

    const lookbackIso = new Date(Date.now() - POST_LOOKBACK_DAYS * 86400 * 1000).toISOString()

    const [clientRes, factsRes, postsRes, themesRes, brandRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name')
        .eq('id', clientId)
        .maybeSingle(),
      supabase
        .from('client_knowledge_facts')
        .select('id, category, fact, confidence')
        .eq('client_id', clientId)
        .eq('active', true)
        .order('recorded_at', { ascending: false })
        .limit(FACTS_LIMIT),
      supabase
        .from('social_posts')
        .select('id, caption, reach, total_interactions, posted_at, platform')
        .eq('client_id', clientId)
        .gte('posted_at', lookbackIso)
        .order('total_interactions', { ascending: false, nullsFirst: false })
        .limit(TOP_POSTS_LIMIT),
      supabase
        .from('editorial_themes')
        .select('id, month, theme_name, theme_blurb, pillars, version')
        .eq('client_id', clientId)
        .order('month', { ascending: false })
        .limit(THEMES_LIMIT),
      supabase
        .from('client_brands')
        .select('brand_voice, visual_style, colors, version')
        .eq('client_id', clientId)
        .maybeSingle(),
    ])

    const facts: ClientContextFact[] = (factsRes.data ?? []).map(f => ({
      id: f.id as string,
      category: f.category as string,
      fact: f.fact as string,
      confidence: (f.confidence as string) ?? 'medium',
    }))
    const topPosts: ClientContextPost[] = (postsRes.data ?? []).map(p => ({
      id: p.id as string,
      caption: (p.caption as string) ?? null,
      reach: Number(p.reach ?? 0),
      totalInteractions: Number(p.total_interactions ?? 0),
      postedAt: (p.posted_at as string) ?? null,
      platform: (p.platform as string) ?? null,
    }))
    const recentThemes: ClientContextTheme[] = (themesRes.data ?? []).map(t => ({
      id: t.id as string,
      month: (t.month as string) ?? null,
      themeName: (t.theme_name as string) ?? null,
      themeBlurb: (t.theme_blurb as string) ?? null,
      pillars: t.pillars,
      version: Number(t.version ?? 1),
    }))
    const brand = brandRes.data
      ? {
          brandVoice: brandRes.data.brand_voice,
          visualStyle: brandRes.data.visual_style,
          colors: brandRes.data.colors,
          version: Number(brandRes.data.version ?? 1),
        }
      : null

    return {
      clientId,
      clientName: (clientRes.data?.name as string) ?? null,
      facts,
      topPosts,
      recentThemes,
      brand,
      promptSummary: buildPromptSummary({
        clientName: (clientRes.data?.name as string) ?? null,
        facts, topPosts, recentThemes, brand,
      }),
      retrieval: {
        factIds: facts.map(f => f.id),
        postIds: topPosts.map(p => p.id),
        themeIds: recentThemes.map(t => t.id),
        brandVersion: brand?.version ?? null,
      },
    }
  },
)

/**
 * Render a stable, human-readable context block for inlining into AI
 * prompts. Keep this short and structured — the AI is asked to
 * generate output that respects this, so it should be the "always
 * remember this" preamble.
 */
function buildPromptSummary(args: {
  clientName: string | null
  facts: ClientContextFact[]
  topPosts: ClientContextPost[]
  recentThemes: ClientContextTheme[]
  brand: ClientContextBrand
}): string {
  const parts: string[] = []

  parts.push(`# Client: ${args.clientName ?? 'unknown'}`)

  if (args.brand) {
    parts.push(`\n## Brand voice (v${args.brand.version})`)
    if (args.brand.brandVoice) parts.push(JSON.stringify(args.brand.brandVoice))
  }

  if (args.facts.length > 0) {
    parts.push(`\n## Known facts about this client (${args.facts.length})`)
    const byCategory = new Map<string, string[]>()
    for (const f of args.facts) {
      if (!byCategory.has(f.category)) byCategory.set(f.category, [])
      byCategory.get(f.category)!.push(f.fact)
    }
    for (const [cat, list] of byCategory) {
      parts.push(`- **${cat}**: ${list.join(' / ')}`)
    }
  }

  if (args.recentThemes.length > 0) {
    parts.push(`\n## Recent editorial themes`)
    for (const t of args.recentThemes) {
      parts.push(`- ${t.month}: ${t.themeName ?? '(untitled)'} — ${t.themeBlurb ?? ''}`.trim())
    }
  }

  if (args.topPosts.length > 0) {
    parts.push(`\n## Top-performing recent posts (last ${POST_LOOKBACK_DAYS}d, top ${args.topPosts.length})`)
    for (const p of args.topPosts.slice(0, 5)) {
      const c = (p.caption ?? '').slice(0, 140).replace(/\s+/g, ' ').trim()
      parts.push(`- [${p.totalInteractions} engagements] ${c}${p.caption && p.caption.length > 140 ? '…' : ''}`)
    }
  }

  return parts.join('\n')
}
