/**
 * Tool: update_page_copy
 *
 * Update the text on the client's website (tagline, hero copy, about
 * section, etc.). The client's apnosh-content.json declares which
 * field_keys are editable + their constraints (min/max length).
 *
 * Pattern: writes an override to client_content_fields, then fires
 * the Vercel deploy hook so the site rebuilds with the new copy.
 *
 * Owner sees a preview with the field key, old value, and new value
 * before confirming.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

export interface UpdatePageCopyInput {
  field_key: string                // e.g. "hero.eyebrow", "about.body"
  new_value: string
  reason?: string                  // why we're changing it (for the audit log)
}

export const UPDATE_PAGE_COPY_SCHEMA = {
  type: 'object',
  properties: {
    field_key: {
      type: 'string',
      maxLength: 120,
      description: 'The editable field key from apnosh-content.json (e.g. "hero.eyebrow", "about.body").',
    },
    new_value: {
      type: 'string',
      maxLength: 5000,
      description: 'The new text. Must respect the schema constraints (min/max chars, multiline flag).',
    },
    reason: {
      type: 'string',
      maxLength: 400,
      description: 'Short note on why this change is being made. Stored in audit log.',
    },
  },
  required: ['field_key', 'new_value'],
  additionalProperties: false,
} as const

export interface UpdatePageCopyOutput {
  field_key: string
  previous_value: string | null
  new_value: string
  deploy_triggered: boolean
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<UpdatePageCopyOutput> {
  const input = rawInput as UpdatePageCopyInput
  const admin = createAdminClient()

  // Snapshot the previous override (if any) so we can render
  // before/after + support undo.
  const { data: existing } = await admin
    .from('client_content_fields')
    .select('value')
    .eq('client_id', ctx.clientId)
    .eq('field_key', input.field_key)
    .maybeSingle()
  const previousValue = (existing?.value as string | null) ?? null

  const { error } = await admin
    .from('client_content_fields')
    .upsert({
      client_id: ctx.clientId,
      field_key: input.field_key,
      value: input.new_value,
      last_edited_by: null,  // agent edits; the conversation_id in the execution row identifies who
      last_edited_at: new Date().toISOString(),
    }, { onConflict: 'client_id,field_key' })

  if (error) throw new Error(`Failed to update copy: ${error.message}`)

  // Fire the deploy hook so the site rebuilds with the new override.
  let deployTriggered = false
  const { data: settings } = await admin
    .from('site_settings')
    .select('external_deploy_hook_url')
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  const hookUrl = settings?.external_deploy_hook_url as string | null
  if (hookUrl) {
    try {
      await fetch(hookUrl, { method: 'POST' })
      deployTriggered = true
    } catch {
      // Non-fatal; the DB override is saved, manual rebuild possible.
    }
  }

  return {
    field_key: input.field_key,
    previous_value: previousValue,
    new_value: input.new_value,
    deploy_triggered: deployTriggered,
  }
}

registerToolHandler('updatePageCopy', handler as never)
