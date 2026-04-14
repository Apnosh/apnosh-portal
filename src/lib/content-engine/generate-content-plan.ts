'use server'

import { createClient } from '@/lib/supabase/server'
import { generateCalendar } from './generate-calendar'
import { generateBriefs } from './generate-briefs'
import type { ClientContext } from './context'

/**
 * One-click content plan generation.
 * Orchestrates: calendar creation → auto-approve → brief generation.
 * Replaces the 3 separate "Generate" buttons.
 */
export async function generateContentPlan(
  cycleId: string,
  clientId: string,
  context: ClientContext,
  strategyNotes: string,
  targetMonth: string
): Promise<{ success: boolean; error?: string; calendarCount?: number; briefCount?: number }> {
  const supabase = await createClient()

  // Phase 1: Generate calendar
  const calResult = await generateCalendar(cycleId, clientId, context, strategyNotes, targetMonth)
  if (!calResult.success) {
    return { success: false, error: `Calendar generation failed: ${calResult.error}` }
  }

  // Phase 2: Auto-approve calendar items so briefs can generate
  await supabase
    .from('content_calendar_items')
    .update({ status: 'strategist_approved', updated_at: new Date().toISOString() })
    .eq('cycle_id', cycleId)
    .eq('status', 'draft')

  await supabase
    .from('content_cycles')
    .update({ status: 'calendar_approved', calendar_approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', cycleId)

  // Phase 3: Generate briefs for all items
  const briefResult = await generateBriefs(cycleId, clientId, context)
  if (!briefResult.success) {
    // Calendar worked but briefs failed — still partial success
    return {
      success: true,
      error: `Calendar created (${calResult.count} items) but brief generation failed: ${briefResult.error}. You can retry briefs from the Content Plan tab.`,
      calendarCount: calResult.count,
      briefCount: 0,
    }
  }

  return {
    success: true,
    calendarCount: calResult.count,
    briefCount: briefResult.count,
  }
}
