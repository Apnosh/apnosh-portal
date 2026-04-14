'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Syncs approved content_calendar_items into content_queue
 * so clients see them on their calendar and approval pages.
 *
 * Called when admin approves briefs in the Content Engine.
 */
export async function syncCalendarToQueue(
  cycleId: string,
  clientId: string
): Promise<{ success: boolean; error?: string; synced?: number }> {
  const supabase = await createClient()

  // Fetch all approved items from this cycle that haven't been synced yet
  const { data: items, error: fetchError } = await supabase
    .from('content_calendar_items')
    .select('*')
    .eq('cycle_id', cycleId)
    .is('content_queue_id', null)
    .in('status', ['approved', 'strategist_approved', 'client_review'])

  if (fetchError) return { success: false, error: fetchError.message }
  if (!items || items.length === 0) return { success: true, synced: 0 }

  let synced = 0

  for (const item of items) {
    // Map content_type to content_format
    const contentFormat = mapContentType(item.content_type)
    // Map content_type to size
    const size = mapSize(item.content_type)
    // Map platform
    const platform = mapPlatform(item.platform)

    // Build draft from the brief data
    const draft = {
      image_url: '',
      html_source: '',
      caption: item.caption ?? '',
      hashtags: Array.isArray(item.hashtags) ? item.hashtags.join(' ') : (item.hashtags ?? ''),
    }

    // Create content_queue entry
    const { data: queueItem, error: insertError } = await supabase
      .from('content_queue')
      .insert({
        client_id: clientId,
        request_type: 'internal',
        submitted_by: 'admin',
        service_area: 'social',
        content_format: contentFormat,
        platform: platform,
        size: size,
        input_text: `${item.concept_title}\n\n${item.concept_description ?? ''}`,
        drafts: [draft],
        selected_draft: 0,
        designer_notes: buildDesignerNotes(item),
        status: 'in_review', // Sends to client for approval
        scheduled_for: item.scheduled_date
          ? new Date(`${item.scheduled_date}T${item.scheduled_time ?? '10:00'}:00`).toISOString()
          : null,
        caption: item.caption,
        hashtags: Array.isArray(item.hashtags) ? item.hashtags.join(' ') : item.hashtags,
        revision_count: 0,
        revision_limit: 2,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error(`Failed to sync item ${item.id}:`, insertError.message)
      continue
    }

    if (queueItem) {
      // Link the two records both ways
      await supabase
        .from('content_calendar_items')
        .update({
          content_queue_id: queueItem.id,
          status: 'client_review',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      await supabase
        .from('content_queue')
        .update({ calendar_item_id: item.id })
        .eq('id', queueItem.id)

      synced++
    }
  }

  // Update cycle status
  await supabase
    .from('content_cycles')
    .update({ status: 'in_production', updated_at: new Date().toISOString() })
    .eq('id', cycleId)

  return { success: true, synced }
}

/**
 * When a client approves a content_queue item, update the
 * linked content_calendar_item status too.
 */
export async function syncQueueApprovalToCalendar(
  queueItemId: string
): Promise<void> {
  const supabase = await createClient()

  const { data: queueItem } = await supabase
    .from('content_queue')
    .select('calendar_item_id, status')
    .eq('id', queueItemId)
    .maybeSingle()

  if (queueItem?.calendar_item_id) {
    const statusMap: Record<string, string> = {
      approved: 'client_approved',
      scheduled: 'scheduled',
      posted: 'published',
    }
    const newStatus = statusMap[queueItem.status] ?? queueItem.status

    await supabase
      .from('content_calendar_items')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', queueItem.calendar_item_id)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapContentType(type: string): string {
  const map: Record<string, string> = {
    reel: 'reel',
    feed_post: 'feed_post',
    carousel: 'carousel',
    story: 'story',
  }
  return map[type] ?? 'feed_post'
}

function mapSize(type: string): string {
  const map: Record<string, string> = {
    reel: 'story',
    story: 'story',
    feed_post: 'feed',
    carousel: 'feed',
  }
  return map[type] ?? 'feed'
}

function mapPlatform(platform: string): string | null {
  // content_queue only supports instagram, tiktok, linkedin
  if (['instagram', 'tiktok', 'linkedin'].includes(platform)) return platform
  // Facebook content goes as instagram for now (same Meta suite)
  if (platform === 'facebook') return 'instagram'
  return null
}

function buildDesignerNotes(item: Record<string, unknown>): string {
  const parts: string[] = []

  if (item.concept_title) parts.push(`Concept: ${item.concept_title}`)
  if (item.concept_description) parts.push(`Description: ${item.concept_description}`)
  if (item.hook) parts.push(`Hook: ${item.hook}`)
  if (item.music_direction) parts.push(`Music: ${item.music_direction}`)
  if (item.estimated_duration) parts.push(`Duration: ${item.estimated_duration}`)
  if (item.location_notes) parts.push(`Location: ${item.location_notes}`)
  if (item.editor_notes) parts.push(`Editor: ${item.editor_notes}`)

  if (item.script) {
    parts.push(`\nScript:\n${item.script}`)
  }

  if (item.shot_list && Array.isArray(item.shot_list)) {
    const shots = (item.shot_list as Array<{ shot_number: number; description: string }>)
      .map((s) => `  #${s.shot_number}: ${s.description}`)
      .join('\n')
    parts.push(`\nShot List:\n${shots}`)
  }

  if (item.props && Array.isArray(item.props)) {
    parts.push(`\nProps: ${(item.props as string[]).join(', ')}`)
  }

  return parts.join('\n')
}
