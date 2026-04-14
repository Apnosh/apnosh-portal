'use server'

import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notify'

// ---------------------------------------------------------------------------
// Stage transition notifications
// ---------------------------------------------------------------------------

export async function notifyStageTransition(
  contentItemId: string,
  stage: string,
  newStatus: string,
): Promise<void> {
  const supabase = await createClient()

  // Get the content item with assignee info
  const { data: item } = await supabase
    .from('content_calendar_items')
    .select('concept_title, filming_assigned_to, editing_assigned_to, design_assigned_to, caption_assigned_to')
    .eq('id', contentItemId)
    .single()

  if (!item) return

  const title = item.concept_title ?? 'Content item'

  // Determine who to notify based on what just happened
  const NEXT_STAGE: Record<string, string> = {
    concept: 'script', script: 'filming', filming: 'editing', editing: 'design', design: 'caption',
  }

  const ASSIGNEE_FIELD: Record<string, string> = {
    filming: 'filming_assigned_to', editing: 'editing_assigned_to',
    design: 'design_assigned_to', caption: 'caption_assigned_to',
  }

  // When a stage completes, notify the next stage's assignee
  const completedStatuses = ['approved', 'filmed', 'draft_ready']
  if (completedStatuses.includes(newStatus)) {
    const nextStage = NEXT_STAGE[stage]
    if (nextStage) {
      const assigneeField = ASSIGNEE_FIELD[nextStage]
      const assigneeId = assigneeField ? (item as Record<string, unknown>)[assigneeField] as string : null

      if (assigneeId) {
        // Look up the team member's auth user ID for notifications
        const { data: member } = await supabase
          .from('team_members')
          .select('auth_user_id')
          .eq('id', assigneeId)
          .single()

        if (member?.auth_user_id) {
          await createNotification({
            supabase,
            userId: member.auth_user_id,
            type: 'deliverable_ready',
            title: `${nextStage.charAt(0).toUpperCase() + nextStage.slice(1)} ready`,
            body: `"${title}" is ready for ${nextStage}. The previous stage is complete.`,
            link: `/admin/content-engine`,
          })
        }
      }
    }
  }

  // When revision is requested, notify the person who submitted
  if (newStatus === 'revision_requested') {
    const assigneeField = ASSIGNEE_FIELD[stage]
    const assigneeId = assigneeField ? (item as Record<string, unknown>)[assigneeField] as string : null

    if (assigneeId) {
      const { data: member } = await supabase
        .from('team_members')
        .select('auth_user_id')
        .eq('id', assigneeId)
        .single()

      if (member?.auth_user_id) {
        await createNotification({
          supabase,
          userId: member.auth_user_id,
          type: 'approval_needed',
          title: 'Revision requested',
          body: `"${title}" needs revisions for the ${stage} stage.`,
          link: `/admin/content-engine`,
        })
      }
    }
  }
}
