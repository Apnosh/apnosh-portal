/**
 * Tool: weekly_recap
 *
 * Generate a "what happened this week" recap for the owner -- traffic,
 * GBP actions, reviews, search performance, recent changes published.
 * Owner asks "what's new this week?" → agent calls this → returns a
 * structured summary the agent then narrates in plain English.
 *
 * Non-destructive read-only; doesn't require confirmation.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

export interface WeeklyRecapInput {
  weeks_back?: number    // 1 = this week, 2 = last 2 weeks. Default 1.
}

export const WEEKLY_RECAP_SCHEMA = {
  type: 'object',
  properties: {
    weeks_back: { type: 'integer', minimum: 1, maximum: 4, description: 'How many weeks of data. Default 1.' },
  },
  additionalProperties: false,
} as const

export interface WeeklyRecapOutput {
  window: { start: string; end: string; days: number }
  website: { visitors: number; sessions: number; page_views: number }
  search: { impressions: number; clicks: number; avg_position: number | null }
  gbp: { impressions: number; directions: number; calls: number; website_clicks: number; post_views: number; post_clicks: number; food_menu_clicks: number; food_orders: number }
  reviews: { count: number; avg_rating: number | null; unresponded: number }
  changes_published: Array<{ type: string; summary: string | null; date: string }>
  /* Auto-generated bullets the agent can use verbatim if it wants. */
  highlights: string[]
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<WeeklyRecapOutput> {
  const input = rawInput as WeeklyRecapInput
  const days = (input.weeks_back ?? 1) * 7
  const admin = createAdminClient()
  const end = new Date()
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - days)
  const startStr = isoDate(start)
  const endStr = isoDate(end)

  const [webRes, searchRes, gbpRes, reviewRes, updatesRes] = await Promise.all([
    admin.from('website_metrics').select('visitors, sessions, page_views').eq('client_id', ctx.clientId).gte('date', startStr),
    admin.from('search_metrics').select('total_impressions, total_clicks, avg_position').eq('client_id', ctx.clientId).gte('date', startStr),
    admin.from('gbp_metrics').select('impressions_total, directions, calls, website_clicks, post_views, post_clicks, food_menu_clicks, food_orders').eq('client_id', ctx.clientId).gte('date', startStr),
    admin.from('reviews').select('rating, response_text, posted_at').eq('client_id', ctx.clientId).gte('posted_at', start.toISOString()),
    admin.from('client_updates').select('type, summary, created_at').eq('client_id', ctx.clientId).eq('status', 'published').gte('created_at', start.toISOString()).order('created_at', { ascending: false }).limit(20),
  ])

  const website = sumRows<{ visitors: number | null; sessions: number | null; page_views: number | null }>(webRes.data, ['visitors', 'sessions', 'page_views'])
  const search = sumRows<{ total_impressions: number | null; total_clicks: number | null; avg_position: number | null }>(searchRes.data, ['total_impressions', 'total_clicks'])
  const positions = ((searchRes.data ?? []) as Array<{ avg_position: number | null }>)
    .map(r => r.avg_position).filter((p): p is number => p != null)
  const avgPosition = positions.length > 0 ? Number((positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(2)) : null

  const gbp = sumRows<{ impressions_total: number | null; directions: number | null; calls: number | null; website_clicks: number | null; post_views: number | null; post_clicks: number | null; food_menu_clicks: number | null; food_orders: number | null }>(
    gbpRes.data,
    ['impressions_total', 'directions', 'calls', 'website_clicks', 'post_views', 'post_clicks', 'food_menu_clicks', 'food_orders'],
  )

  const reviewRows = (reviewRes.data ?? []) as Array<{ rating: number | null; response_text: string | null; posted_at: string | null }>
  const reviews = {
    count: reviewRows.length,
    avg_rating: reviewRows.length > 0
      ? Number((reviewRows.reduce((s, r) => s + (r.rating ?? 0), 0) / reviewRows.length).toFixed(2))
      : null,
    unresponded: reviewRows.filter(r => !r.response_text).length,
  }

  const changes = ((updatesRes.data ?? []) as Array<{ type: string; summary: string | null; created_at: string }>).map(u => ({
    type: u.type,
    summary: u.summary,
    date: u.created_at,
  }))

  /* Auto-highlights for the agent to use. Order matters: surface the
     most notable things first. */
  const highlights: string[] = []
  if (reviews.count > 0) {
    highlights.push(`Got ${reviews.count} new review${reviews.count === 1 ? '' : 's'} (avg ${reviews.avg_rating}★, ${reviews.unresponded} unresponded)`)
  }
  if (gbp.food_orders > 0) {
    highlights.push(`${gbp.food_orders} food orders direct from your Google profile`)
  }
  if (gbp.directions > 0) {
    highlights.push(`${gbp.directions} people asked for directions on Google`)
  }
  if (gbp.calls > 0) {
    highlights.push(`${gbp.calls} calls placed from your Google profile`)
  }
  if (website.visitors > 0) {
    highlights.push(`${website.visitors} website visitors`)
  }
  if (search.impressions > 0) {
    highlights.push(`Showed up in Google search ${search.impressions.toLocaleString()} times${search.clicks > 0 ? `, with ${search.clicks} clicks` : ''}`)
  }
  if (changes.length > 0) {
    highlights.push(`Published ${changes.length} change${changes.length === 1 ? '' : 's'} (${changes.slice(0, 3).map(c => c.type).join(', ')}${changes.length > 3 ? ', ...' : ''})`)
  }
  if (highlights.length === 0) {
    highlights.push(`Quiet week -- no significant activity on tracked channels`)
  }

  return {
    window: { start: startStr, end: endStr, days },
    website: { visitors: website.visitors ?? 0, sessions: website.sessions ?? 0, page_views: website.page_views ?? 0 },
    search: { impressions: search.total_impressions ?? 0, clicks: search.total_clicks ?? 0, avg_position: avgPosition },
    gbp: {
      impressions: gbp.impressions_total ?? 0,
      directions: gbp.directions ?? 0,
      calls: gbp.calls ?? 0,
      website_clicks: gbp.website_clicks ?? 0,
      post_views: gbp.post_views ?? 0,
      post_clicks: gbp.post_clicks ?? 0,
      food_menu_clicks: gbp.food_menu_clicks ?? 0,
      food_orders: gbp.food_orders ?? 0,
    },
    reviews,
    changes_published: changes,
    highlights,
  }
}

function sumRows<T extends Record<string, number | null>>(
  data: unknown[] | null | undefined,
  keys: Array<keyof T>,
): Record<string, number> {
  const rows = (data ?? []) as T[]
  const result: Record<string, number> = {}
  for (const key of keys) {
    result[key as string] = rows.reduce((acc, r) => acc + ((r[key] as number | null) ?? 0), 0)
  }
  return result
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

registerToolHandler('weeklyRecap', handler as never)
