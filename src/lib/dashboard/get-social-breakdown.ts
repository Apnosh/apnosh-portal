'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Returns up to 365 days of social metrics for the client, broken out by
 * platform. The UI computes aggregations and time-range filtering on the
 * fly so users can switch metric + platform + range without extra roundtrips.
 */
export interface SocialDailyRow {
  date: string            // YYYY-MM-DD
  platform: string        // 'instagram' | 'facebook' | etc.
  reach: number | null
  impressions: number | null
  profile_visits: number | null
  followers_total: number | null
  followers_gained: number | null
  engagement: number | null
  posts_published: number | null
}

export interface SocialBreakdownResult {
  rows: SocialDailyRow[]
  platforms: string[]
  earliestDate: string | null
  latestDate: string | null
}

export async function getSocialBreakdown(clientId: string): Promise<SocialBreakdownResult> {
  const supabase = await createClient()

  const yearAgo = new Date()
  yearAgo.setDate(yearAgo.getDate() - 365)
  const sinceStr = yearAgo.toISOString().split('T')[0]

  const { data } = await supabase
    .from('social_metrics')
    .select('date, platform, reach, impressions, profile_visits, followers_total, followers_gained, engagement, posts_published')
    .eq('client_id', clientId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  const rows = (data ?? []) as SocialDailyRow[]
  const platforms = Array.from(new Set(rows.map(r => r.platform))).sort()
  const earliestDate = rows[0]?.date ?? null
  const latestDate = rows[rows.length - 1]?.date ?? null

  return { rows, platforms, earliestDate, latestDate }
}
