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
