'use server'

/**
 * Aggregate the past 7 days of marketing activity for a client.
 * Used by the "Your marketing this week" dashboard card to show
 * the owner what they (with Apnosh's AI help) actually shipped.
 *
 * Reads from existing tables only — no new schema needed:
 *   - ai_generations  (applied content: posts, captions, sites, etc.)
 *   - reviews         (review responses)
 *   - social_metrics  (reach delta to compute average lift)
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface WeeklyActivityItem {
  /** Plain-language one-liner */
  label: string
  /** Optional subtle context, e.g. "averaging 2.3x your usual reach" */
  detail?: string
  /** Lucide icon name, picked client-side */
  icon: 'check' | 'message' | 'image' | 'star' | 'megaphone' | 'sparkle'
}

export interface WeeklyActivity {
  items: WeeklyActivityItem[]
  generatedThisWeek: number
}

export async function getWeeklyActivity(clientId: string): Promise<WeeklyActivity> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 7 * 86400000).toISOString()

  const [generations, reviews, social, sites] = await Promise.all([
    admin
      .from('ai_generations')
      .select('task_type, applied, created_at')
      .eq('client_id', clientId)
      .gte('created_at', since),
    admin
      .from('reviews')
      .select('id, response_text, response_at')
      .eq('client_id', clientId)
      .gte('response_at', since)
      .not('response_text', 'is', null),
    admin
      .from('social_metrics')
      .select('reach, date')
      .eq('client_id', clientId)
      .gte('date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
    admin
      .from('bespoke_history')
      .select('id, created_at')
      .eq('client_id', clientId)
      .gte('created_at', since),
  ])

  const items: WeeklyActivityItem[] = []
  const allGens = generations.data ?? []
  const appliedGens = allGens.filter(g => g.applied)

  // Posts / captions
  const postCount = appliedGens.filter(g =>
    g.task_type === 'social_post' || g.task_type === 'caption'
  ).length
  if (postCount > 0) {
    const totalReach = (social.data ?? []).reduce((acc, m) => acc + Number(m.reach ?? 0), 0)
    items.push({
      icon: 'image',
      label: `${postCount} social post${postCount === 1 ? '' : 's'} you published`,
      detail: totalReach > 0 ? `${totalReach.toLocaleString()} total reach` : undefined,
    })
  }

  // Reviews responded to
  const reviewCount = reviews.data?.length ?? 0
  if (reviewCount > 0) {
    items.push({
      icon: 'star',
      label: `${reviewCount} review${reviewCount === 1 ? '' : 's'} you responded to`,
      detail: 'AI drafted, approved by you',
    })
  }

  // Designs / graphics
  const designCount = appliedGens.filter(g => g.task_type === 'design').length
  if (designCount > 0) {
    items.push({
      icon: 'sparkle',
      label: `${designCount} design${designCount === 1 ? '' : 's'} you shipped`,
    })
  }

  // Bespoke website iterations
  const siteCount = sites.data?.length ?? 0
  if (siteCount > 0) {
    items.push({
      icon: 'check',
      label: siteCount === 1
        ? 'Your website was updated'
        : `${siteCount} website iterations shipped`,
    })
  }

  // Specials / menu updates
  const menuCount = appliedGens.filter(g =>
    g.task_type === 'menu' || g.task_type === 'special'
  ).length
  if (menuCount > 0) {
    items.push({
      icon: 'megaphone',
      label: `${menuCount} menu / special update${menuCount === 1 ? '' : 's'}`,
    })
  }

  // Email / SMS campaigns
  const campaignCount = appliedGens.filter(g =>
    g.task_type === 'email' || g.task_type === 'sms' || g.task_type === 'campaign'
  ).length
  if (campaignCount > 0) {
    items.push({
      icon: 'message',
      label: `${campaignCount} campaign${campaignCount === 1 ? '' : 's'} sent`,
    })
  }

  return {
    items,
    generatedThisWeek: allGens.length,
  }
}
