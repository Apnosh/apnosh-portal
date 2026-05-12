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

export interface ClientContextCrossSignal {
  draftId: string
  anonDescriptor: string
  idea: string
  caption: string | null
  outcomeEngagement: number
  proposedVia: string
}

export interface ClientContextJudgment {
  judgment: 'revise' | 'rejected'
  tags: string[]
  note: string | null
  createdAt: string
}

export interface ClientContext {
  clientId: string
  clientName: string | null
  facts: ClientContextFact[]
  topPosts: ClientContextPost[]
  recentThemes: ClientContextTheme[]
  brand: ClientContextBrand
  crossClientSignal: ClientContextCrossSignal[]
  /** Recent revise/reject judgments — what to AVOID next time. */
  rejectionPatterns: ClientContextJudgment[]
  /** Stable string suitable for inlining into a prompt. */
  promptSummary: string
  /** Capture this and pass to ai_generation_inputs.retrieved_* arrays. */
  retrieval: {
    factIds: string[]
    postIds: string[]
    themeIds: string[]
    brandVersion: number | null
    crossClientDraftIds: string[]
    judgmentIds: string[]
  }
}

const POST_LOOKBACK_DAYS = 90
const TOP_POSTS_LIMIT = 10
const THEMES_LIMIT = 3
const FACTS_LIMIT = 50
const CROSS_CLIENT_LIMIT = 5
const JUDGMENT_LIMIT = 10
const JUDGMENT_LOOKBACK_DAYS = 90

export const getClientContext = cache(
  async (clientId: string): Promise<ClientContext> => {
    const supabase = await createServerClient()

    const lookbackIso = new Date(Date.now() - POST_LOOKBACK_DAYS * 86400 * 1000).toISOString()

    const judgmentLookbackIso = new Date(Date.now() - JUDGMENT_LOOKBACK_DAYS * 86400 * 1000).toISOString()

    const [clientRes, factsRes, postsRes, themesRes, brandRes, crossRes, judgRes] = await Promise.all([
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
      // Principle #7: anonymized signal from similar clients
      supabase.rpc('get_cross_client_signal', {
        target_client_id: clientId,
        signal_limit: CROSS_CLIENT_LIMIT,
      }),
      // Principle #8 → #6: recent revise/reject judgments become avoidance instructions for the next AI run.
      // We pull human_judgments where subject is a content_draft for this client.
      supabase
        .from('human_judgments')
        .select('id, judgment, reason_tags, reason_note, created_at, context_snapshot')
        .in('judgment', ['revise', 'rejected'])
        .eq('subject_type', 'content_draft')
        .gte('created_at', judgmentLookbackIso)
        .order('created_at', { ascending: false })
        .limit(JUDGMENT_LIMIT * 3),  // over-fetch; filter to this client below
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

    const crossClientSignal: ClientContextCrossSignal[] = (crossRes.data ?? []).map((r: {
      draft_id: string
      anon_descriptor: string
      idea: string
      caption: string | null
      outcome_engagement: number | null
      proposed_via: string
    }) => ({
      draftId: r.draft_id,
      anonDescriptor: r.anon_descriptor,
      idea: r.idea,
      caption: r.caption,
      outcomeEngagement: Number(r.outcome_engagement ?? 0),
      proposedVia: r.proposed_via,
    }))

    // Filter judgments to ones whose context_snapshot.client_id matches.
    // (We can't filter at the DB level via JSON without a function index;
    // for current volumes this is fine.)
    const rejectionPatternsRaw = (judgRes.data ?? []).filter((j: { context_snapshot?: Record<string, unknown> | null }) => {
      const cid = (j.context_snapshot as Record<string, unknown> | null)?.client_id
      return cid === clientId
    }).slice(0, JUDGMENT_LIMIT)

    const rejectionPatterns: ClientContextJudgment[] = rejectionPatternsRaw.map((j: {
      judgment: string; reason_tags: string[] | null; reason_note: string | null; created_at: string
    }) => ({
      judgment: j.judgment as 'revise' | 'rejected',
      tags: Array.isArray(j.reason_tags) ? j.reason_tags : [],
      note: j.reason_note,
      createdAt: j.created_at,
    }))

    const judgmentIds = (rejectionPatternsRaw as Array<{ id: string }>).map(j => j.id)

    return {
      clientId,
      clientName: (clientRes.data?.name as string) ?? null,
      facts,
      topPosts,
      recentThemes,
      brand,
      crossClientSignal,
      rejectionPatterns,
      promptSummary: buildPromptSummary({
        clientName: (clientRes.data?.name as string) ?? null,
        facts, topPosts, recentThemes, brand, crossClientSignal, rejectionPatterns,
      }),
      retrieval: {
        factIds: facts.map(f => f.id),
        postIds: topPosts.map(p => p.id),
        themeIds: recentThemes.map(t => t.id),
        brandVersion: brand?.version ?? null,
        crossClientDraftIds: crossClientSignal.map(s => s.draftId),
        judgmentIds,
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
  crossClientSignal: ClientContextCrossSignal[]
  rejectionPatterns: ClientContextJudgment[]
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

  if (args.crossClientSignal.length > 0) {
    parts.push(`\n## What's working at similar restaurants (anonymized)`)
    parts.push(`*Use these as inspiration only — never copy. Adapt to this client's voice and facts.*`)
    for (const s of args.crossClientSignal.slice(0, 5)) {
      const c = (s.caption ?? '').slice(0, 120).replace(/\s+/g, ' ').trim()
      const eng = s.outcomeEngagement > 0 ? `[${s.outcomeEngagement} eng]` : '[approved]'
      parts.push(`- ${eng} ${s.anonDescriptor}: ${s.idea}${c ? ` — "${c}${s.caption && s.caption.length > 120 ? '…' : ''}"` : ''}`)
    }
  }

  // The compounding loop: every revise/reject judgment we've captured
  // becomes an avoidance instruction for the next generation.
  // Principle #8 (capture) → principle #6 (retrieve) → better output.
  if (args.rejectionPatterns.length > 0) {
    // Bucket by tag for frequency.
    const tagCounts = new Map<string, number>()
    const tagNotes = new Map<string, string[]>()
    for (const j of args.rejectionPatterns) {
      for (const tag of j.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
        if (j.note) {
          if (!tagNotes.has(tag)) tagNotes.set(tag, [])
          if (tagNotes.get(tag)!.length < 3) tagNotes.get(tag)!.push(j.note)
        }
      }
    }
    const ordered = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])
    if (ordered.length > 0) {
      parts.push(`\n## What this client rejects (avoid these patterns)`)
      parts.push(`*Based on ${args.rejectionPatterns.length} recent revise/reject judgments. Treat as hard constraints.*`)
      for (const [tag, count] of ordered) {
        const notes = tagNotes.get(tag) ?? []
        const noteText = notes.length > 0 ? ` — notes: "${notes.join('"; "')}"` : ''
        parts.push(`- **${tag.replace(/_/g, ' ')}** (${count}×)${noteText}`)
      }
    }
  }

  return parts.join('\n')
}
