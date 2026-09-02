/**
 * The monthly report's data: five chapters computed from the ledgers that
 * already flow. Every chapter is null when its month has nothing true to
 * say (the report renders honest absence, never zero-fill). Sentiment
 * themes join chapter 2 when that engine ships.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedThemes } from '@/lib/review-themes'
import { moveForTheme, titleCase } from '@/lib/reviews/moves'

export interface FoundChapter {
  total: number
  prior: number
  words: Array<{ q: string; n: number }>
}
export interface LovedTheme { theme: string; mentions: number; snippet: string | null }
export interface HeardTheme { theme: string; mentions: number; move: string; operational: boolean }
export interface SaidChapter {
  count: number
  avg: number
  priorCount: number
  quote: string | null
  /** From the cached 90-day theme engine; null when no themes exist yet. */
  loved: LovedTheme[]
  heard: HeardTheme[]
}
export interface WorkedChapter {
  posts: number
  topTitle: string | null
  topReach: number
}
export interface MovedChapter {
  calls: number
  directions: number
  siteClicks: number
  priorCalls: number
  priorDirections: number
  priorSiteClicks: number
}
export interface MonthlyReport {
  year: number
  month: number // 1-12
  monthLabel: string
  sealed: boolean
  found: FoundChapter | null
  said: SaidChapter | null
  worked: WorkedChapter | null
  moved: MovedChapter | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

function monthWindow(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))
  const priorStart = new Date(Date.UTC(year, month - 2, 1))
  return { start, end, priorStart }
}

export async function buildMonthlyReport(
  admin: SupabaseClient,
  clientId: string,
  year: number,
  month: number,
): Promise<MonthlyReport> {
  const { start, end, priorStart } = monthWindow(year, month)
  const now = new Date()
  const sealed = end.getTime() <= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    && (now.getUTCFullYear() > year || now.getUTCMonth() + 1 > month)

  const [searchRows, reviewRows, postRows, gbpRows] = await Promise.all([
    admin.from('search_metrics')
      .select('date, total_impressions, top_queries')
      .eq('client_id', clientId)
      .gte('date', iso(priorStart)).lt('date', iso(end)),
    admin.from('reviews')
      .select('rating, review_text, created_at')
      .eq('client_id', clientId)
      .gte('created_at', priorStart.toISOString()).lt('created_at', end.toISOString()),
    admin.from('content_drafts')
      .select('title, published_at, outcome_summary')
      .eq('client_id', clientId)
      .not('published_at', 'is', null)
      .gte('published_at', start.toISOString()).lt('published_at', end.toISOString()),
    admin.from('gbp_metrics')
      .select('date, directions, calls, website_clicks, location_id')
      .eq('client_id', clientId)
      .gte('date', iso(priorStart)).lt('date', iso(end)),
  ])

  // ── Chapter 1: found ──
  let found: FoundChapter | null = null
  {
    let total = 0, prior = 0
    const byQuery = new Map<string, number>()
    for (const r of searchRows.data ?? []) {
      const inMonth = String(r.date) >= iso(start)
      const imps = Number(r.total_impressions) || 0
      if (inMonth) {
        total += imps
        for (const q of (Array.isArray(r.top_queries) ? r.top_queries : []) as Array<Record<string, unknown>>) {
          const term = String(q.query ?? '').trim().toLowerCase()
          if (term) byQuery.set(term, (byQuery.get(term) ?? 0) + (Number(q.impressions) || 0))
        }
      } else prior += imps
    }
    if (total > 0) {
      const words = [...byQuery.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([q, n]) => ({ q, n }))
      found = { total, prior, words }
    }
  }

  // ── Chapter 2: said (themes join when the sentiment engine ships) ──
  let said: SaidChapter | null = null
  {
    const inMonth = (reviewRows.data ?? []).filter((r) => String(r.created_at) >= start.toISOString())
    const before = (reviewRows.data ?? []).length - inMonth.length
    if (inMonth.length > 0) {
      const avg = inMonth.reduce((a, r) => a + Number(r.rating), 0) / inMonth.length
      const quotable = inMonth
        .filter((r) => typeof r.review_text === 'string' && r.review_text.trim().length >= 30 && r.review_text.trim().length <= 160 && Number(r.rating) >= 4)
        .sort((a, b) => Number(b.rating) - Number(a.rating))[0]
      // Themes ride the engine's rolling window (recent reviews), not the
      // calendar month; the counts above stay monthly.
      const themes = await getCachedThemes(clientId, null, 45).catch(() => null)
      const loved: LovedTheme[] = (themes?.themes ?? [])
        .filter((t) => t.mentions >= 2 && t.praise > t.critical)
        .sort((a, b) => b.praise - a.praise).slice(0, 3)
        .map((t) => ({
          theme: titleCase(t.theme), mentions: t.praise,
          snippet: (t.examples ?? []).find((e) => e.rating >= 4)?.snippet ?? null,
        }))
      const heard: HeardTheme[] = (themes?.themes ?? [])
        .filter((t) => t.critical >= 2)
        .sort((a, b) => b.critical - a.critical).slice(0, 2)
        .map((t) => ({ theme: titleCase(t.theme), mentions: t.critical, ...moveForTheme(t.theme) }))
      said = {
        count: inMonth.length,
        avg: Math.round(avg * 10) / 10,
        priorCount: before,
        quote: quotable ? String(quotable.review_text).trim() : null,
        loved, heard,
      }
    }
  }

  // ── Chapter 3: worked ──
  let worked: WorkedChapter | null = null
  {
    type P = { title: string | null; reach: number }
    const parsed: P[] = (postRows.data ?? []).map((p) => {
      const o = (p.outcome_summary ?? {}) as Record<string, unknown>
      return { title: (p.title as string | null) ?? null, reach: Number(o.reach) || 0 }
    })
    if (parsed.length > 0) {
      const top = [...parsed].sort((a, b) => b.reach - a.reach)[0]
      worked = { posts: parsed.length, topTitle: top.title, topReach: top.reach }
    }
  }

  // ── Chapter 4: moved ──
  let moved: MovedChapter | null = null
  {
    const m = { calls: 0, directions: 0, siteClicks: 0, priorCalls: 0, priorDirections: 0, priorSiteClicks: 0 }
    for (const r of gbpRows.data ?? []) {
      if (r.location_id === 'demo-proof') continue
      const inMonth = String(r.date) >= iso(start)
      if (inMonth) {
        m.calls += Number(r.calls) || 0
        m.directions += Number(r.directions) || 0
        m.siteClicks += Number(r.website_clicks) || 0
      } else {
        m.priorCalls += Number(r.calls) || 0
        m.priorDirections += Number(r.directions) || 0
        m.priorSiteClicks += Number(r.website_clicks) || 0
      }
    }
    if (m.calls + m.directions + m.siteClicks > 0) moved = m
  }

  return {
    year, month, sealed,
    monthLabel: start.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
    found, said, worked, moved,
  }
}
