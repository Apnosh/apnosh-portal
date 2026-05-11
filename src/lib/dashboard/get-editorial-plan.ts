'use server'

/**
 * Reads editorial_themes + the month's scheduled posts so the
 * /dashboard/social/plan page can show "story of the month" + the
 * content slated against it.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface EditorialTheme {
  id: string
  month: string             // 'YYYY-MM-01'
  themeName: string
  themeBlurb: string | null
  pillars: string[]
  keyDates: Array<{ date: string; label: string; note?: string }>
  status: 'planning' | 'shared' | 'archived'
}

export interface PlannedItem {
  id: string
  text: string
  mediaUrl: string | null
  platforms: string[]
  scheduledFor: string | null
  status: string
}

export interface EditorialMonth {
  monthStartIso: string
  monthLabel: string
  theme: EditorialTheme | null
  scheduledCount: number
  publishedCount: number
  inReviewCount: number
  items: PlannedItem[]
}

export interface EditorialPlanData {
  thisMonth: EditorialMonth
  nextMonth: EditorialMonth
}

export async function getEditorialPlan(clientId: string): Promise<EditorialPlanData> {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1)

  const [thisMonth, nextMonth] = await Promise.all([
    getMonth(clientId, thisMonthStart, nextMonthStart, true),
    getMonth(clientId, nextMonthStart, monthAfter, false),
  ])

  return { thisMonth, nextMonth }
}

async function getMonth(
  clientId: string,
  start: Date,
  end: Date,
  sharedOnly: boolean,
): Promise<EditorialMonth> {
  const admin = createAdminClient()
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const monthDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`

  const [themeRes, postsRes] = await Promise.all([
    sharedOnly
      ? admin
          .from('editorial_themes')
          .select('*')
          .eq('client_id', clientId)
          .eq('month', monthDate)
          .in('status', ['shared'])
          .maybeSingle()
      : admin
          .from('editorial_themes')
          .select('*')
          .eq('client_id', clientId)
          .eq('month', monthDate)
          .in('status', ['shared'])
          .maybeSingle(),
    admin
      .from('scheduled_posts')
      .select('id, text, media_urls, platforms, scheduled_for, status')
      .eq('client_id', clientId)
      .or(`scheduled_for.gte.${startIso},and(scheduled_for.is.null,created_at.gte.${startIso})`)
      .lte('scheduled_for', endIso)
      .order('scheduled_for', { ascending: true })
      .limit(60),
  ])

  const theme = themeRes.data ? toTheme(themeRes.data) : null
  const items: PlannedItem[] = (postsRes.data ?? []).map(p => ({
    id: p.id as string,
    text: ((p.text as string) ?? '').slice(0, 200),
    mediaUrl: ((p.media_urls as string[] | null) ?? [])[0] ?? null,
    platforms: (p.platforms as string[] | null) ?? [],
    scheduledFor: (p.scheduled_for as string | null) ?? null,
    status: p.status as string,
  }))

  let scheduledCount = 0
  let publishedCount = 0
  let inReviewCount = 0
  for (const i of items) {
    if (i.status === 'published') publishedCount++
    else if (i.status === 'scheduled') scheduledCount++
    else if (i.status === 'in_review' || i.status === 'draft') inReviewCount++
  }

  return {
    monthStartIso: startIso,
    monthLabel: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    theme,
    scheduledCount,
    publishedCount,
    inReviewCount,
    items,
  }
}

function toTheme(r: Record<string, unknown>): EditorialTheme {
  return {
    id: r.id as string,
    month: r.month as string,
    themeName: (r.theme_name as string) ?? '',
    themeBlurb: (r.theme_blurb as string | null) ?? null,
    pillars: (r.pillars as string[] | null) ?? [],
    keyDates: (r.key_dates as Array<{ date: string; label: string; note?: string }> | null) ?? [],
    status: r.status as 'planning' | 'shared' | 'archived',
  }
}
