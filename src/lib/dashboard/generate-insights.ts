'use server'

import { createClient } from '@/lib/supabase/server'

interface InsightCandidate {
  viewType: 'visibility' | 'foot_traffic'
  icon: string
  title: string
  subtitle: string
  priority: number
}

export async function generateInsights(clientId: string): Promise<void> {
  const supabase = await createClient()

  // Fetch last 30 days of metrics
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  const [{ data: socialRecent }, { data: socialPrev }, { data: gbpRecent }, { data: gbpPrev }] =
    await Promise.all([
      supabase
        .from('social_metrics')
        .select('date, platform, reach, impressions, followers_gained, engagement, followers_total')
        .eq('client_id', clientId)
        .gte('date', thirtyDaysAgo)
        .order('date'),
      supabase
        .from('social_metrics')
        .select('date, reach, impressions, followers_gained, engagement')
        .eq('client_id', clientId)
        .gte('date', sixtyDaysAgo)
        .lt('date', thirtyDaysAgo)
        .order('date'),
      supabase
        .from('gbp_metrics')
        .select('date, directions, calls, website_clicks, search_views')
        .eq('client_id', clientId)
        .gte('date', thirtyDaysAgo)
        .order('date'),
      supabase
        .from('gbp_metrics')
        .select('date, directions, calls, website_clicks, search_views')
        .eq('client_id', clientId)
        .gte('date', sixtyDaysAgo)
        .lt('date', thirtyDaysAgo)
        .order('date'),
    ])

  const candidates: InsightCandidate[] = []

  // ---------------------------------------------------------------------------
  // Visibility Rules
  // ---------------------------------------------------------------------------

  if (socialRecent && socialRecent.length > 0) {
    const recentReach = sum(socialRecent, 'reach')
    const prevReach = sum(socialPrev ?? [], 'reach')
    const recentFollowers = sum(socialRecent, 'followers_gained')
    const prevFollowers = sum(socialPrev ?? [], 'followers_gained')
    const recentImpressions = sum(socialRecent, 'impressions')
    const prevImpressions = sum(socialPrev ?? [], 'impressions')

    // Rule: Growth trend (reach MoM > 20%)
    if (prevReach > 0) {
      const reachGrowth = Math.round(((recentReach - prevReach) / prevReach) * 100)
      if (reachGrowth > 20) {
        candidates.push({
          viewType: 'visibility',
          icon: 'trending',
          title: `Reach is up ${reachGrowth}% this month`,
          subtitle: "You're consistently reaching more people.",
          priority: 1,
        })
      }
    }

    // Rule: Reach spike (single day 2x+ avg)
    const avgDailyReach = recentReach / Math.max(socialRecent.length, 1)
    const dailyReachMap = new Map<string, number>()
    for (const row of socialRecent) {
      const d = row.date as string
      dailyReachMap.set(d, (dailyReachMap.get(d) ?? 0) + ((row.reach as number) ?? 0))
    }
    let spikeDay: string | null = null
    let spikeVal = 0
    for (const [date, reach] of dailyReachMap) {
      if (reach > avgDailyReach * 2 && reach > spikeVal) {
        spikeDay = date
        spikeVal = reach
      }
    }
    if (spikeDay) {
      const dayName = new Date(spikeDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
      candidates.push({
        viewType: 'visibility',
        icon: 'star',
        title: `Your best day reached ${fmtNum(spikeVal)} people on ${dayName}`,
        subtitle: `That's ${Math.round(spikeVal / avgDailyReach)}x your daily average.`,
        priority: 2,
      })
    }

    // Rule: Best posting day
    const dayOfWeekReach = new Map<number, { total: number; count: number }>()
    for (const [date, reach] of dailyReachMap) {
      const dow = new Date(date + 'T12:00:00').getDay()
      const entry = dayOfWeekReach.get(dow) ?? { total: 0, count: 0 }
      entry.total += reach
      entry.count++
      dayOfWeekReach.set(dow, entry)
    }
    if (dayOfWeekReach.size >= 5) {
      let bestDay = 0
      let bestAvg = 0
      for (const [dow, { total, count }] of dayOfWeekReach) {
        const avg = total / count
        if (avg > bestAvg) { bestAvg = avg; bestDay = dow }
      }
      const overallAvg = recentReach / dailyReachMap.size
      if (bestAvg > overallAvg * 1.3) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const pctMore = Math.round(((bestAvg - overallAvg) / overallAvg) * 100)
        candidates.push({
          viewType: 'visibility',
          icon: 'clock',
          title: `${dayNames[bestDay]} is your best performing day`,
          subtitle: `Posts on ${dayNames[bestDay]}s get ${pctMore}% more reach.`,
          priority: 2,
        })
      }
    }

    // Rule: Follower milestone
    if (socialRecent.length > 0) {
      const latestFollowers = Math.max(
        ...socialRecent
          .filter((r) => (r.followers_total as number) > 0)
          .map((r) => r.followers_total as number)
      )
      const milestones = [10000, 5000, 2500, 2000, 1500, 1000, 500]
      for (const m of milestones) {
        const prevTotal = latestFollowers - recentFollowers
        if (latestFollowers >= m && prevTotal < m) {
          candidates.push({
            viewType: 'visibility',
            icon: 'star',
            title: `You crossed ${fmtNum(m)} followers`,
            subtitle: `That's ${recentFollowers} new followers this month.`,
            priority: 1,
          })
          break
        }
      }
    }

    // Rule: Impressions growth
    if (prevImpressions > 0) {
      const impressionGrowth = Math.round(((recentImpressions - prevImpressions) / prevImpressions) * 100)
      if (impressionGrowth > 15) {
        candidates.push({
          viewType: 'visibility',
          icon: 'trending',
          title: `Impressions up ${impressionGrowth}% this month`,
          subtitle: 'Your content is being shown to more people.',
          priority: 1,
        })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Foot Traffic Rules
  // ---------------------------------------------------------------------------

  if (gbpRecent && gbpRecent.length > 0) {
    const recentDirections = sum(gbpRecent, 'directions')
    const prevDirections = sum(gbpPrev ?? [], 'directions')
    const recentCalls = sum(gbpRecent, 'calls')
    const prevCalls = sum(gbpPrev ?? [], 'calls')
    const recentSearch = sum(gbpRecent, 'search_views')
    const prevSearch = sum(gbpPrev ?? [], 'search_views')

    // Rule: Directions growth > 15%
    if (prevDirections > 0) {
      const growth = Math.round(((recentDirections - prevDirections) / prevDirections) * 100)
      if (growth > 15) {
        candidates.push({
          viewType: 'foot_traffic',
          icon: 'map',
          title: `Directions up ${growth}% this month`,
          subtitle: 'Google Business posts are driving visits.',
          priority: 3,
        })
      } else if (growth < -15) {
        candidates.push({
          viewType: 'foot_traffic',
          icon: 'alert',
          title: `Directions down ${Math.abs(growth)}% this month`,
          subtitle: 'Consider adding more photos and posts to your listing.',
          priority: 3,
        })
      }
    }

    // Rule: Peak day of week
    const dayActions = new Map<number, { total: number; count: number }>()
    for (const row of gbpRecent) {
      const dow = new Date((row.date as string) + 'T12:00:00').getDay()
      const actions = ((row.directions as number) ?? 0) + ((row.calls as number) ?? 0) + ((row.website_clicks as number) ?? 0)
      const entry = dayActions.get(dow) ?? { total: 0, count: 0 }
      entry.total += actions
      entry.count++
      dayActions.set(dow, entry)
    }
    if (dayActions.size >= 5) {
      let peakDay = 0
      let peakAvg = 0
      for (const [dow, { total, count }] of dayActions) {
        const avg = total / count
        if (avg > peakAvg) { peakAvg = avg; peakDay = dow }
      }
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const timeOfDay = peakDay >= 5 ? 'evenings' : 'lunch hours'
      candidates.push({
        viewType: 'foot_traffic',
        icon: 'clock',
        title: `${dayNames[peakDay]} ${timeOfDay} are peak`,
        subtitle: `${dayNames[peakDay]} searchers are finding you.`,
        priority: 2,
      })
    }

    // Rule: Call volume change > 20%
    if (prevCalls > 0) {
      const callGrowth = Math.round(((recentCalls - prevCalls) / prevCalls) * 100)
      if (Math.abs(callGrowth) > 20) {
        candidates.push({
          viewType: 'foot_traffic',
          icon: 'star',
          title: `Phone calls ${callGrowth > 0 ? 'up' : 'down'} ${Math.abs(callGrowth)}% this month`,
          subtitle: callGrowth > 0 ? 'More people are calling from your listing.' : 'Check that your phone number is correct on Google.',
          priority: 2,
        })
      }
    }

    // Rule: Search visibility trend > 10%
    if (prevSearch > 0) {
      const searchGrowth = Math.round(((recentSearch - prevSearch) / prevSearch) * 100)
      if (searchGrowth > 10) {
        candidates.push({
          viewType: 'foot_traffic',
          icon: 'trending',
          title: `Search visibility up ${searchGrowth}%`,
          subtitle: 'You\'re appearing in more local searches.',
          priority: 1,
        })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Write results: top 2 per view type
  // ---------------------------------------------------------------------------

  // Deactivate old insights
  await supabase
    .from('insights')
    .update({ active: false })
    .eq('client_id', clientId)
    .eq('active', true)

  // Pick top 2 per view type by priority
  const visibilityCandidates = candidates
    .filter((c) => c.viewType === 'visibility')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)

  const footTrafficCandidates = candidates
    .filter((c) => c.viewType === 'foot_traffic')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)

  const toInsert = [...visibilityCandidates, ...footTrafficCandidates]

  if (toInsert.length > 0) {
    await supabase.from('insights').insert(
      toInsert.map((c) => ({
        client_id: clientId,
        view_type: c.viewType,
        icon: c.icon,
        title: c.title,
        subtitle: c.subtitle,
        priority: c.priority,
        active: true,
        generated_at: new Date().toISOString(),
      }))
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sum(rows: Record<string, unknown>[], field: string): number {
  return rows.reduce((acc, r) => acc + ((r[field] as number) ?? 0), 0)
}

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return n.toLocaleString('en-US')
  return n.toString()
}
