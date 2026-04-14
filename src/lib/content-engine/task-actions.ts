'use server'

import { createClient } from '@/lib/supabase/server'
import { notifyStageTransition } from '@/lib/notifications/task-notifications'

// ---------------------------------------------------------------------------
// Stage advancement
// ---------------------------------------------------------------------------

export async function advanceStage(
  itemId: string,
  stage: string,
  newStatus: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const statusField = `${stage}_status`
  const { error } = await supabase
    .from('content_calendar_items')
    .update({ [statusField]: newStatus, updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) return { success: false, error: error.message }

  // Fire notification (non-blocking)
  notifyStageTransition(itemId, stage, newStatus).catch(() => {})

  return { success: true }
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export async function assignStage(
  itemId: string,
  stage: string,
  teamMemberId: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const assignField = `${stage}_assigned_to`
  const { error } = await supabase
    .from('content_calendar_items')
    .update({ [assignField]: teamMemberId, updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ---------------------------------------------------------------------------
// Team members
// ---------------------------------------------------------------------------

export async function getTeamMembers(role?: string): Promise<Array<{ id: string; name: string; role: string; email: string }>> {
  const supabase = await createClient()

  let query = supabase.from('team_members').select('id, name, role, email').eq('is_active', true)
  if (role) query = query.eq('role', role)
  const { data } = await query.order('name')
  return (data ?? []) as Array<{ id: string; name: string; role: string; email: string }>
}

// ---------------------------------------------------------------------------
// Deliverables
// ---------------------------------------------------------------------------

export async function submitDeliverable(params: {
  contentItemId: string
  stage: string
  type: 'file' | 'link'
  fileUrl?: string
  externalUrl?: string
  fileName?: string
  fileType?: string
  notes?: string
  submittedBy?: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get latest revision number for this item+stage
  const { data: existing } = await supabase
    .from('task_deliverables')
    .select('revision_number')
    .eq('content_item_id', params.contentItemId)
    .eq('stage', params.stage)
    .order('revision_number', { ascending: false })
    .limit(1)

  const latestRevision = existing?.[0]?.revision_number ?? 0
  // If latest was revision_requested, increment. Otherwise use same revision.
  const lastReviewStatus = existing?.[0] as { review_status?: string } | undefined
  const revisionNumber = lastReviewStatus?.review_status === 'revision_requested' ? latestRevision + 1 : latestRevision > 0 ? latestRevision : 1

  const { error } = await supabase.from('task_deliverables').insert({
    content_item_id: params.contentItemId,
    stage: params.stage,
    revision_number: revisionNumber,
    type: params.type,
    file_url: params.fileUrl || null,
    external_url: params.externalUrl || null,
    file_name: params.fileName || null,
    file_type: params.fileType || null,
    notes: params.notes || null,
    submitted_by: params.submittedBy || null,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function getDeliverables(
  contentItemId: string,
  stage?: string
): Promise<Array<Record<string, unknown>>> {
  const supabase = await createClient()

  let query = supabase
    .from('task_deliverables')
    .select('*, submitted_by_member:team_members!task_deliverables_submitted_by_fkey(name)')
    .eq('content_item_id', contentItemId)
    .order('revision_number', { ascending: false })
    .order('submitted_at', { ascending: false })

  if (stage) query = query.eq('stage', stage)
  const { data } = await query
  return (data ?? []) as Array<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export async function reviewDeliverable(
  deliverableId: string,
  status: 'approved' | 'revision_requested',
  notes?: string,
  reviewedBy?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('task_deliverables')
    .update({
      review_status: status,
      review_notes: notes || null,
      reviewed_by: reviewedBy || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', deliverableId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function addTaskNote(params: {
  contentItemId: string
  stage: string
  noteText: string
  createdBy?: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.from('task_notes').insert({
    content_item_id: params.contentItemId,
    stage: params.stage,
    note_text: params.noteText,
    created_by: params.createdBy || null,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ---------------------------------------------------------------------------
// Client Team Defaults
// ---------------------------------------------------------------------------

export async function getClientTeamDefaults(
  clientId: string
): Promise<Array<{ role: string; team_member_id: string; member_name?: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('client_team_defaults')
    .select('role, team_member_id, member:team_members!client_team_defaults_team_member_id_fkey(name)')
    .eq('client_id', clientId)
  return (data ?? []).map((d: Record<string, unknown>) => ({
    role: d.role as string,
    team_member_id: d.team_member_id as string,
    member_name: (d.member as { name: string } | null)?.name,
  }))
}

export async function setClientTeamDefault(
  clientId: string,
  role: string,
  teamMemberId: string | null
): Promise<{ success: boolean }> {
  const supabase = await createClient()

  if (!teamMemberId) {
    await supabase.from('client_team_defaults').delete().eq('client_id', clientId).eq('role', role)
  } else {
    await supabase.from('client_team_defaults').upsert(
      { client_id: clientId, role, team_member_id: teamMemberId },
      { onConflict: 'client_id,role' }
    )
  }
  return { success: true }
}

// Auto-assign team from client defaults when items are created
export async function autoAssignFromDefaults(
  clientId: string,
  itemIds: string[]
): Promise<void> {
  const supabase = await createClient()
  const defaults = await getClientTeamDefaults(clientId)
  if (defaults.length === 0) return

  const ROLE_TO_FIELD: Record<string, string> = {
    videographer: 'filming_assigned_to',
    editor: 'editing_assigned_to',
    designer: 'design_assigned_to',
    copywriter: 'caption_assigned_to',
  }

  const updates: Record<string, string> = {}
  for (const d of defaults) {
    const field = ROLE_TO_FIELD[d.role]
    if (field) updates[field] = d.team_member_id
  }

  if (Object.keys(updates).length === 0) return

  for (const id of itemIds) {
    await supabase.from('content_calendar_items').update(updates).eq('id', id)
  }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function getTaskNotes(
  contentItemId: string,
  stage?: string
): Promise<Array<Record<string, unknown>>> {
  const supabase = await createClient()

  let query = supabase
    .from('task_notes')
    .select('*, created_by_member:team_members!task_notes_created_by_fkey(name)')
    .eq('content_item_id', contentItemId)
    .order('created_at', { ascending: false })

  if (stage) query = query.eq('stage', stage)
  const { data } = await query
  return (data ?? []) as Array<Record<string, unknown>>
}
