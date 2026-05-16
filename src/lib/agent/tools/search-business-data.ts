/**
 * Tool: search_business_data
 *
 * Read-only data lookups for the agent. Lets it answer questions like
 *   "how many visitors last week?"
 *   "what's our Google rating?"
 *   "what are our top search queries?"
 *   "what menu items do we have?"
 * without dumping every metric into the system prompt.
 *
 * Non-destructive + does NOT require confirmation -- the agent calls
 * it inline during a turn, gets the result, and uses it in its
 * next text response.
 *
 * Each query type is a small aggregation function so the agent can't
 * just write raw SQL. Adding a new query type is one function +
 * one enum entry.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

export type BusinessDataQuery =
  | 'website_summary'
  | 'website_top_pages'
  | 'search_summary'
  | 'search_top_queries'
  | 'gbp_actions_summary'
  | 'gbp_reviews_summary'
  | 'gbp_recent_reviews'
  | 'menu_overview'
  | 'menu_signature_items'

export interface SearchBusinessDataInput {
  query: BusinessDataQuery
  days_back?: number     // default 30; ignored by some queries
  limit?: number         // for list queries (top_pages, top_queries, recent_reviews)
}

export const SEARCH_BUSINESS_DATA_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      enum: [
        'website_summary',
        'website_top_pages',
        'search_summary',
        'search_top_queries',
        'gbp_actions_summary',
        'gbp_reviews_summary',
        'gbp_recent_reviews',
        'menu_overview',
        'menu_signature_items',
      ],
      description: 'Which data lookup to perform. Pick the most specific one for the question.',
    },
    days_back: {
      type: 'integer',
      minimum: 1,
      maximum: 365,
      description: 'Lookback window in days. Default 30. Ignored by menu_* queries.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      description: 'Max rows to return for list queries. Default 5.',
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const

type Output = Record<string, unknown>

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<Output> {
  const input = rawInput as SearchBusinessDataInput
  const daysBack = input.days_back ?? 30
  const limit = input.limit ?? 5
  const cutoffDate = isoDate(daysAgo(daysBack))
  const admin = createAdminClient()

  switch (input.query) {
    case 'website_summary': {
      const { data } = await admin
        .from('website_metrics')
        .select('date, visitors, sessions, page_views')
        .eq('client_id', ctx.clientId)
        .gte('date', cutoffDate)
      const rows = (data ?? []) as Array<{ visitors: number; sessions: number; page_views: number }>
      const sum = rows.reduce(
        (acc, r) => ({
          visitors: acc.visitors + (r.visitors ?? 0),
          sessions: acc.sessions + (r.sessions ?? 0),
          page_views: acc.page_views + (r.page_views ?? 0),
        }),
        { visitors: 0, sessions: 0, page_views: 0 },
      )
      return { days_back: daysBack, rows_found: rows.length, ...sum }
    }

    case 'website_top_pages': {
      /* top_pages is stored as JSONB on each row; we flatten across
         the window and sum views per path. */
      const { data } = await admin
        .from('website_metrics')
        .select('top_pages')
        .eq('client_id', ctx.clientId)
        .gte('date', cutoffDate)
      const totals = new Map<string, number>()
      for (const r of (data ?? []) as Array<{ top_pages: Array<{ path: string; views: number }> | null }>) {
        for (const p of r.top_pages ?? []) {
          totals.set(p.path, (totals.get(p.path) ?? 0) + (p.views ?? 0))
        }
      }
      const ranked = Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([path, views]) => ({ path, views }))
      return { days_back: daysBack, top_pages: ranked }
    }

    case 'search_summary': {
      const { data } = await admin
        .from('search_metrics')
        .select('date, total_impressions, total_clicks, avg_position')
        .eq('client_id', ctx.clientId)
        .gte('date', cutoffDate)
      const rows = (data ?? []) as Array<{ total_impressions: number; total_clicks: number; avg_position: number | null }>
      const sumImpr = rows.reduce((s, r) => s + (r.total_impressions ?? 0), 0)
      const sumClicks = rows.reduce((s, r) => s + (r.total_clicks ?? 0), 0)
      const positions = rows.map(r => r.avg_position).filter((p): p is number => p != null)
      const avgPos = positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : null
      return {
        days_back: daysBack,
        rows_found: rows.length,
        total_impressions: sumImpr,
        total_clicks: sumClicks,
        avg_position: avgPos != null ? Number(avgPos.toFixed(2)) : null,
        ctr: sumImpr > 0 ? Number((sumClicks / sumImpr * 100).toFixed(2)) : null,
      }
    }

    case 'search_top_queries': {
      const { data } = await admin
        .from('search_metrics')
        .select('top_queries')
        .eq('client_id', ctx.clientId)
        .gte('date', cutoffDate)
      const totals = new Map<string, { clicks: number; impressions: number; positionSum: number; n: number }>()
      for (const r of (data ?? []) as Array<{ top_queries: Array<{ query: string; clicks: number; impressions: number; position: number }> | null }>) {
        for (const q of r.top_queries ?? []) {
          const ex = totals.get(q.query) ?? { clicks: 0, impressions: 0, positionSum: 0, n: 0 }
          ex.clicks += q.clicks ?? 0
          ex.impressions += q.impressions ?? 0
          ex.positionSum += q.position ?? 0
          ex.n += 1
          totals.set(q.query, ex)
        }
      }
      const ranked = Array.from(totals.entries())
        .sort((a, b) => b[1].clicks - a[1].clicks)
        .slice(0, limit)
        .map(([query, m]) => ({
          query,
          clicks: m.clicks,
          impressions: m.impressions,
          avg_position: m.n > 0 ? Number((m.positionSum / m.n).toFixed(1)) : null,
        }))
      return { days_back: daysBack, top_queries: ranked }
    }

    case 'gbp_actions_summary': {
      const { data } = await admin
        .from('gbp_metrics')
        .select('date, directions, calls, website_clicks, bookings, food_orders, food_menu_clicks, conversations, impressions_total')
        .eq('client_id', ctx.clientId)
        .gte('date', cutoffDate)
      const rows = (data ?? []) as Array<Record<string, number | null>>
      const sum = (k: string) => rows.reduce((s, r) => s + ((r[k] as number | null) ?? 0), 0)
      return {
        days_back: daysBack,
        rows_found: rows.length,
        impressions: sum('impressions_total'),
        directions: sum('directions'),
        calls: sum('calls'),
        website_clicks: sum('website_clicks'),
        bookings: sum('bookings'),
        food_orders: sum('food_orders'),
        food_menu_clicks: sum('food_menu_clicks'),
        conversations: sum('conversations'),
      }
    }

    case 'gbp_reviews_summary': {
      const { data } = await admin
        .from('reviews')
        .select('rating, created_at, response_text')
        .eq('client_id', ctx.clientId)
        .gte('created_at', new Date(daysAgo(daysBack).getTime()).toISOString())
      const rows = (data ?? []) as Array<{ rating: number | null; created_at: string; response_text: string | null }>
      const n = rows.length
      const avgRating = n > 0
        ? Number((rows.reduce((s, r) => s + (r.rating ?? 0), 0) / n).toFixed(2))
        : null
      const counts = [1, 2, 3, 4, 5].map(star => ({
        rating: star,
        count: rows.filter(r => r.rating === star).length,
      }))
      const responded = rows.filter(r => r.response_text && r.response_text.length > 0).length
      return {
        days_back: daysBack,
        total_reviews: n,
        avg_rating: avgRating,
        rating_distribution: counts,
        responded,
        unresponded: n - responded,
      }
    }

    case 'gbp_recent_reviews': {
      const { data } = await admin
        .from('reviews')
        .select('rating, comment, reviewer_display_name, created_at, response_text')
        .eq('client_id', ctx.clientId)
        .order('created_at', { ascending: false })
        .limit(limit)
      return {
        reviews: (data ?? []).map(r => ({
          rating: r.rating,
          comment: r.comment,
          reviewer: r.reviewer_display_name,
          created_at: r.created_at,
          has_response: !!(r.response_text && (r.response_text as string).length > 0),
        })),
      }
    }

    case 'menu_overview': {
      const { data } = await admin
        .from('menu_items')
        .select('category, is_featured')
        .eq('client_id', ctx.clientId)
      const rows = (data ?? []) as Array<{ category: string | null; is_featured: boolean | null }>
      const categories = new Map<string, number>()
      for (const r of rows) {
        const c = r.category ?? 'Uncategorized'
        categories.set(c, (categories.get(c) ?? 0) + 1)
      }
      return {
        total_items: rows.length,
        featured_count: rows.filter(r => r.is_featured).length,
        by_category: Array.from(categories.entries()).map(([category, count]) => ({ category, count })),
      }
    }

    case 'menu_signature_items': {
      const { data } = await admin
        .from('menu_items')
        .select('id, name, description, price_cents, category, photo_url')
        .eq('client_id', ctx.clientId)
        .eq('is_featured', true)
        .order('name', { ascending: true })
        .limit(limit)
      return {
        signature_items: (data ?? []).map(i => ({
          id: i.id,
          name: i.name,
          description: i.description,
          price: i.price_cents != null ? `$${((i.price_cents as number) / 100).toFixed(2)}` : null,
          category: i.category,
          has_photo: !!i.photo_url,
        })),
      }
    }

    default:
      return { error: `Unknown query type: ${(input as { query: string }).query}` }
  }
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

registerToolHandler('searchBusinessData', handler as never)
