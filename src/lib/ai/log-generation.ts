/**
 * Log every AI call into the ai_generations table.
 *
 * Best-effort: logging failure NEVER blocks the user-facing response.
 * Errors get console-warned and swallowed.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type TaskType = 'generate' | 'recreate' | 'refine' | 'extract' | 'design' | 'critique' | 'judge' | 'dashboard_brief'

export interface LogGenerationInput {
  clientId?: string | null
  taskType: TaskType
  promptId?: string | null
  promptVersion?: string | null
  model: string
  inputSummary?: Record<string, unknown> | null
  outputSummary?: unknown
  rawText?: string | null
  variantIndex?: number | null
  batchId?: string | null
  latencyMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  errorMessage?: string | null
  createdBy?: string | null
}

export async function logGeneration(input: LogGenerationInput): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ai_generations')
      .insert({
        client_id: input.clientId ?? null,
        task_type: input.taskType,
        prompt_id: input.promptId ?? null,
        prompt_version: input.promptVersion ?? null,
        model: input.model,
        input_summary: input.inputSummary ?? null,
        output_summary: (input.outputSummary as Record<string, unknown> | null) ?? null,
        raw_text: input.rawText ?? null,
        variant_index: input.variantIndex ?? null,
        batch_id: input.batchId ?? null,
        latency_ms: input.latencyMs ?? null,
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        error_message: input.errorMessage ?? null,
        created_by: input.createdBy ?? null,
      })
      .select('id')
      .single()
    if (error) {
      console.warn('[ai-log] insert failed:', error.message)
      return null
    }
    return data.id as string
  } catch (e) {
    console.warn('[ai-log] insert threw:', (e as Error).message)
    return null
  }
}

/**
 * Mark a generation as picked (operator selected this variant).
 * Returns the row id for chaining.
 */
export async function markPicked(generationId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('ai_generations')
      .update({ picked: true })
      .eq('id', generationId)
  } catch (e) {
    console.warn('[ai-log] markPicked failed:', (e as Error).message)
  }
}

/**
 * Mark applied = true. Used when a variant becomes the new draft_data.
 */
export async function markApplied(generationId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('ai_generations')
      .update({ applied: true })
      .eq('id', generationId)
  } catch (e) {
    console.warn('[ai-log] markApplied failed:', (e as Error).message)
  }
}

/**
 * When a generation gets refined into another generation, link them.
 */
export async function linkRefinedInto(
  fromId: string,
  toId: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('ai_generations')
      .update({ refined_into_id: toId })
      .eq('id', fromId)
  } catch (e) {
    console.warn('[ai-log] linkRefinedInto failed:', (e as Error).message)
  }
}

/**
 * When a draft gets published, mark which generation it came from.
 * Powers the "best examples" few-shot corpus.
 */
export async function linkToPublishedHistory(
  generationId: string,
  publishHistoryId: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('ai_generations')
      .update({ published_history_id: publishHistoryId })
      .eq('id', generationId)
  } catch (e) {
    console.warn('[ai-log] linkToPublishedHistory failed:', (e as Error).message)
  }
}
