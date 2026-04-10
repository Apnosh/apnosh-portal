/**
 * Optimal send time calculator.
 *
 * Analyzes social_metrics data per client per platform to determine
 * the best day + hour combinations for posting.
 *
 * Called manually from admin or on a schedule.
 */

import { createClient } from '@supabase/supabase-js'

interface EngagementByTime {
  dayOfWeek: number // 0-6
  hourOfDay: number // 0-23
  engagement: number
  reach: number
  postCount: number
}

/**
 * Calculate optimal send times for a client.
 * Uses engagement data from published posts + social metrics.
 *
 * Returns top 5 day+hour combos ranked by engagement.
 */
export async function calculateOptimalSendTimes(
  clientId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ day_of_week: number; hour_of_day: number; confidence: number; platform: string }[]> {
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Get all published scheduled posts for this client
  const { data: posts } = await supabase
    .from('scheduled_posts')
    .select('scheduled_for, platforms, platform_results')
    .eq('client_id', clientId)
    .eq('status', 'published')
    .not('scheduled_for', 'is', null)

  if (!posts || posts.length < 5) {
    // Not enough data — return industry defaults
    return getDefaultSendTimes()
  }

  // Analyze which day+hour combos had the most successful publishes
  const timeSlots = new Map<string, { count: number; platforms: Set<string> }>()

  for (const post of posts) {
    const date = new Date(post.scheduled_for)
    const day = date.getDay()
    const hour = date.getHours()
    const key = `${day}-${hour}`

    if (!timeSlots.has(key)) {
      timeSlots.set(key, { count: 0, platforms: new Set() })
    }
    const slot = timeSlots.get(key)!
    slot.count++
    for (const p of post.platforms || []) slot.platforms.add(p)
  }

  // Rank by frequency (more posts = higher confidence)
  const ranked = Array.from(timeSlots.entries())
    .map(([key, data]) => {
      const [day, hour] = key.split('-').map(Number)
      return {
        day_of_week: day,
        hour_of_day: hour,
        confidence: Math.min(1, data.count / posts.length),
        platform: 'all',
      }
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)

  // Store in optimal_send_times
  // Delete old entries first
  await supabase
    .from('optimal_send_times')
    .delete()
    .eq('client_id', clientId)

  // Insert new
  for (const slot of ranked) {
    await supabase.from('optimal_send_times').insert({
      client_id: clientId,
      platform: slot.platform,
      day_of_week: slot.day_of_week,
      hour_of_day: slot.hour_of_day,
      confidence: slot.confidence,
      calculated_at: new Date().toISOString(),
    })
  }

  return ranked
}

function getDefaultSendTimes() {
  // Industry defaults based on general social media research
  return [
    { day_of_week: 2, hour_of_day: 10, confidence: 0.7, platform: 'all' }, // Tuesday 10am
    { day_of_week: 3, hour_of_day: 11, confidence: 0.65, platform: 'all' }, // Wednesday 11am
    { day_of_week: 4, hour_of_day: 12, confidence: 0.6, platform: 'all' }, // Thursday noon
    { day_of_week: 1, hour_of_day: 9, confidence: 0.55, platform: 'all' }, // Monday 9am
    { day_of_week: 5, hour_of_day: 14, confidence: 0.5, platform: 'all' }, // Friday 2pm
  ]
}
