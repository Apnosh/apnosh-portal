'use server'

/**
 * "Coming up next" for the owner home — what the team is actively working on and
 * what's about to go live, drawn from the content pipeline (content_calendar_items).
 *
 * This is the WORK view (what's in production / scheduled), not the marketing
 * calendar of "moments worth a post". The owner opens the home and immediately
 * sees what's being made for them and when it ships.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type WorkTone = 'scheduled' | 'production' | 'review' | 'planning'

export interface UpcomingWorkItem {
  id: string
  title: string
  statusLabel: string
  tone: WorkTone
  /** e.g. "Instagram Reel" */
  channel: string
  /** e.g. "goes live Friday" — only for scheduled items with a future date. */
  whenLabel: string | null
}

// Pipeline status -> a plain, owner-facing label + tone. 'published' is excluded
// (that's done — it shows in Recent activity instead).
const STATUS: Record<string, { label: string; tone: WorkTone }> = {
  scheduled: { label: 'Scheduled', tone: 'scheduled' },
  in_production: { label: 'In production', tone: 'production' },
  filming: { label: 'Filming', tone: 'production' },
  editing: { label: 'In editing', tone: 'production' },
  draft_ready: { label: 'In production', tone: 'production' },
  client_review: { label: 'For your review', tone: 'review' },
  client_draft_review: { label: 'For your review', tone: 'review' },
  draft: { label: 'In the works', tone: 'planning' },
  strategist_approved: { label: 'In the works', tone: 'planning' },
  client_approved: { label: 'Approved', tone: 'planning' },
  approved: { label: 'Approved', tone: 'planning' },
}

const PLATFORM: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn' }
const CTYPE: Record<string, string> = { reel: 'Reel', feed_post: 'Post', carousel: 'Carousel', story: 'Story' }

function liveLabel(d: string | null): string | null {
  if (!d) return null
  const date = new Date(d + 'T00:00:00')
  if (isNaN(date.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((date.getTime() - today.getTime()) / 86400000)
  if (days < 0) return null
  if (days === 0) return 'goes live today'
  if (days === 1) return 'goes live tomorrow'
  if (days < 7) return `goes live ${date.toLocaleDateString('en-US', { weekday: 'long' })}`
  return `goes live ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export async function getUpcomingWork(clientId: string, limit = 5): Promise<UpcomingWorkItem[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('content_calendar_items')
      .select('id, concept_title, status, platform, content_type, scheduled_date')
      .eq('client_id', clientId)
      .neq('status', 'published')
      // soonest-to-ship first (dated items), then the rest by board order
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true })
      .limit(limit)

    return ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const s = STATUS[r.status as string] ?? { label: 'In the works', tone: 'planning' as WorkTone }
      const channel = [PLATFORM[r.platform as string], CTYPE[r.content_type as string]].filter(Boolean).join(' ')
      return {
        id: r.id as string,
        title: (r.concept_title as string) || 'Untitled',
        statusLabel: s.label,
        tone: s.tone,
        channel,
        whenLabel: s.tone === 'scheduled' ? liveLabel(r.scheduled_date as string | null) : null,
      }
    })
  } catch {
    return []
  }
}
