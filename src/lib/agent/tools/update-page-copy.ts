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

  /* Schema-level safety (Constraint Layer 1).
     If this client's site doesn't publish apnosh-content.json, an
     update_page_copy write would persist in client_content_fields
     but silently no-op on the live site (the build can't read what
     it doesn't know about). Bail clearly instead so the agent can
     explain why + escalate to a human to add the schema. */
  const { data: schemaSettings } = await admin
    .from('site_settings')
    .select('external_site_url, site_type')
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  const siteUrl = (schemaSettings?.external_site_url as string | null) ?? null
  if (!siteUrl) {
    throw new Error('No website URL on file for this client. Ask your strategist to connect the site before editing copy.')
  }
  try {
    const schemaUrl = new URL('/apnosh-content.json', siteUrl).toString()
    const res = await fetch(schemaUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      throw new Error(`This site doesn't publish an editable copy schema (no /apnosh-content.json). Page copy can't be edited automatically. Have your strategist add the schema first, or escalate this change to a human technician.`)
    }
    const json = await res.json() as { fields?: Array<{ key: string }> }
    const fieldExists = (json.fields ?? []).some(f => f.key === input.field_key)
    if (!fieldExists) {
      const available = (json.fields ?? []).map(f => f.key).slice(0, 10).join(', ')
      throw new Error(`Field "${input.field_key}" isn't declared editable in this site's apnosh-content.json. Available fields: ${available || '(none)'}. Pick from those or escalate to a human if you need a new field added.`)
    }
  } catch (err) {
    /* AbortError / network error / etc. -- surface clearly. */
    if (err instanceof Error && err.message.startsWith('This site') || err instanceof Error && err.message.startsWith('Field "')) {
      throw err
    }
    throw new Error(`Couldn't verify the site's content schema (${(err as Error).message}). Aborting to avoid a silent no-op.`)
  }

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
  const { data: deployRow } = await admin
    .from('site_settings')
    .select('external_deploy_hook_url')
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  const hookUrl = (deployRow as { external_deploy_hook_url?: string | null } | null)?.external_deploy_hook_url ?? null
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
