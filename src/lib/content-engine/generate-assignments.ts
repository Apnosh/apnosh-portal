'use server'

import { createClient } from '@/lib/supabase/server'

type ProductionRole = 'videographer' | 'editor' | 'designer' | 'copywriter' | 'qa'

interface AssignmentTemplate {
  role: ProductionRole
  stepOrder: number
  daysBeforePublish: number // how many days before scheduled_date this should be done
}

// Video content (reel): full production chain
const VIDEO_CHAIN: AssignmentTemplate[] = [
  { role: 'videographer', stepOrder: 1, daysBeforePublish: 14 },
  { role: 'editor', stepOrder: 2, daysBeforePublish: 10 },
  { role: 'designer', stepOrder: 3, daysBeforePublish: 7 },
  { role: 'copywriter', stepOrder: 4, daysBeforePublish: 5 },
  { role: 'qa', stepOrder: 5, daysBeforePublish: 3 },
]

// Static content (feed_post, carousel): no filming/editing
const STATIC_CHAIN: AssignmentTemplate[] = [
  { role: 'designer', stepOrder: 1, daysBeforePublish: 7 },
  { role: 'copywriter', stepOrder: 2, daysBeforePublish: 5 },
  { role: 'qa', stepOrder: 3, daysBeforePublish: 3 },
]

// Story: minimal chain
const STORY_CHAIN: AssignmentTemplate[] = [
  { role: 'designer', stepOrder: 1, daysBeforePublish: 5 },
  { role: 'qa', stepOrder: 2, daysBeforePublish: 2 },
]

function getChain(contentType: string): AssignmentTemplate[] {
  if (['reel', 'video', 'short_form_video'].includes(contentType)) return VIDEO_CHAIN
  if (contentType === 'story') return STORY_CHAIN
  return STATIC_CHAIN
}

function computeDueDate(scheduledDate: string | null, daysBeforePublish: number): string | null {
  if (!scheduledDate) return null
  const d = new Date(scheduledDate + 'T12:00:00')
  d.setDate(d.getDate() - daysBeforePublish)
  // Don't set due dates in the past
  const now = new Date()
  if (d < now) {
    now.setDate(now.getDate() + 2)
    return now.toISOString().split('T')[0]
  }
  return d.toISOString().split('T')[0]
}

/**
 * Auto-generate production assignments for all approved items in a cycle.
 * Called after brief approval.
 */
export async function generateAssignments(
  cycleId: string,
  clientId: string
): Promise<{ success: boolean; error?: string; created?: number }> {
  const supabase = await createClient()

  // Get all approved items
  const { data: items, error: fetchError } = await supabase
    .from('content_calendar_items')
    .select('id, content_type, scheduled_date, filming_batch')
    .eq('cycle_id', cycleId)
    .in('status', ['approved', 'strategist_approved', 'client_approved'])

  if (fetchError) return { success: false, error: fetchError.message }
  if (!items || items.length === 0) return { success: true, created: 0 }

  // Check for existing assignments to avoid duplicates
  const { data: existing } = await supabase
    .from('production_assignments')
    .select('item_id')
    .eq('cycle_id', cycleId)

  const existingItemIds = new Set((existing ?? []).map((e) => e.item_id))

  const rows: Array<{
    item_id: string
    cycle_id: string
    client_id: string
    role: ProductionRole
    step_order: number
    status: string
    due_date: string | null
    notes: string | null
  }> = []

  for (const item of items) {
    if (existingItemIds.has(item.id)) continue

    const chain = getChain(item.content_type)
    for (const step of chain) {
      rows.push({
        item_id: item.id,
        cycle_id: cycleId,
        client_id: clientId,
        role: step.role,
        step_order: step.stepOrder,
        status: step.stepOrder === 1 ? 'in_progress' : 'queued', // First step starts active
        due_date: computeDueDate(item.scheduled_date, step.daysBeforePublish),
        notes: step.role === 'videographer' && item.filming_batch
          ? `Filming batch ${item.filming_batch}`
          : null,
      })
    }
  }

  if (rows.length === 0) return { success: true, created: 0 }

  // Insert in batches
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from('production_assignments').insert(chunk)
    if (error) return { success: false, error: error.message }
  }

  // Update cycle status
  await supabase
    .from('content_cycles')
    .update({ status: 'in_production', updated_at: new Date().toISOString() })
    .eq('id', cycleId)

  return { success: true, created: rows.length }
}

/**
 * Advance an assignment to completed and start the next one in the chain.
 */
export async function completeAssignment(
  assignmentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: assignment } = await supabase
    .from('production_assignments')
    .select('*')
    .eq('id', assignmentId)
    .single()

  if (!assignment) return { success: false, error: 'Assignment not found' }

  // Mark this one complete
  await supabase
    .from('production_assignments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId)

  // Start the next step in the chain
  const { data: nextStep } = await supabase
    .from('production_assignments')
    .select('id')
    .eq('item_id', assignment.item_id)
    .eq('step_order', assignment.step_order + 1)
    .maybeSingle()

  if (nextStep) {
    await supabase
      .from('production_assignments')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', nextStep.id)
  } else {
    // All steps complete — update the content item status
    await supabase
      .from('content_calendar_items')
      .update({ status: 'draft_ready', updated_at: new Date().toISOString() })
      .eq('id', assignment.item_id)
  }

  return { success: true }
}
