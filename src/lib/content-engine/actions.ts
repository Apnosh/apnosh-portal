'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface ActionResult {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Calendar Item CRUD
// ---------------------------------------------------------------------------

export async function updateCalendarItem(
  itemId: string,
  updates: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('content_calendar_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteCalendarItem(
  itemId: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('content_calendar_items')
    .delete()
    .eq('id', itemId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function restoreCalendarItem(
  item: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('content_calendar_items')
    .insert(item)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function approveAllCalendarItems(
  cycleId: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error: itemError } = await supabase
    .from('content_calendar_items')
    .update({ status: 'strategist_approved', updated_at: new Date().toISOString() })
    .eq('cycle_id', cycleId)
    .eq('status', 'draft')

  if (itemError) return { success: false, error: itemError.message }

  const { error: cycleError } = await supabase
    .from('content_cycles')
    .update({
      status: 'calendar_approved',
      calendar_approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', cycleId)

  if (cycleError) return { success: false, error: cycleError.message }
  return { success: true }
}

// ---------------------------------------------------------------------------
// Brief Item CRUD
// ---------------------------------------------------------------------------

export async function updateBriefField(
  itemId: string,
  field: string,
  value: unknown
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('content_calendar_items')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function approveAllBriefs(
  cycleId: string,
  clientId: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error: itemError } = await supabase
    .from('content_calendar_items')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('cycle_id', cycleId)

  if (itemError) return { success: false, error: itemError.message }

  const { error: cycleError } = await supabase
    .from('content_cycles')
    .update({
      status: 'briefs_approved',
      briefs_approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', cycleId)

  if (cycleError) return { success: false, error: cycleError.message }

  // Sync to content_queue for client visibility
  try {
    const { syncCalendarToQueue } = await import('./sync-to-queue')
    await syncCalendarToQueue(cycleId, clientId)
  } catch (err) {
    console.error('Queue sync failed:', err)
    // Don't fail the approval if sync fails
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

export async function updateProductionField(
  itemId: string,
  field: string,
  value: unknown
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('content_calendar_items')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ---------------------------------------------------------------------------
// Context Editing
// ---------------------------------------------------------------------------

export async function updateClientGoals(
  clientId: string,
  goals: string[]
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('clients')
    .update({ goals: JSON.stringify(goals), updated_at: new Date().toISOString() })
    .eq('id', clientId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateClientVoiceNotes(
  clientId: string,
  voiceNotes: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('client_brands')
    .update({ voice_notes: voiceNotes })
    .eq('client_id', clientId)

  if (error) {
    // If no client_brands row exists yet, insert one
    const { error: insertError } = await supabase
      .from('client_brands')
      .insert({ client_id: clientId, voice_notes: voiceNotes })

    if (insertError) return { success: false, error: insertError.message }
  }
  return { success: true }
}

export async function updateCycleDeliverables(
  cycleId: string,
  deliverables: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('content_cycles')
    .update({ deliverables, updated_at: new Date().toISOString() })
    .eq('id', cycleId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateCycleEvents(
  cycleId: string,
  events: string[]
): Promise<ActionResult> {
  const supabase = await createClient()

  // Store custom events in the cycle's context_snapshot
  const { data: cycle } = await supabase
    .from('content_cycles')
    .select('context_snapshot')
    .eq('id', cycleId)
    .single()

  const snapshot = (cycle?.context_snapshot as Record<string, unknown>) ?? {}
  snapshot.customEvents = events

  const { error } = await supabase
    .from('content_cycles')
    .update({ context_snapshot: snapshot, updated_at: new Date().toISOString() })
    .eq('id', cycleId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateCycleClientRequests(
  cycleId: string,
  requests: Array<{ text: string; status: 'pending' | 'included' | 'skipped' }>
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('content_cycles')
    .update({ client_requests: requests, updated_at: new Date().toISOString() })
    .eq('id', cycleId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateContentProfile(
  clientId: string,
  fields: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('clients')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', clientId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
