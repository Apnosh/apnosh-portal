/**
 * Tool: update_hours
 *
 * Updates a location's weekly hours. Creates a client_updates row of
 * type='hours' that the existing fanout pipeline pushes to GBP +
 * the website (via apnosh-content.json content overrides) +
 * connected platforms.
 *
 * The agent passes hours as a structured weekly object. Each day is
 * either "closed" or has open/close 24h times ("HH:MM").
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

type DayHours =
  | { status: 'closed' }
  | { status: 'open'; open: string; close: string }

export interface UpdateHoursInput {
  location_id?: string                  // omit to update the client's primary location
  hours: {
    monday: DayHours
    tuesday: DayHours
    wednesday: DayHours
    thursday: DayHours
    friday: DayHours
    saturday: DayHours
    sunday: DayHours
  }
  effective_date?: string               // ISO date; omit for immediate
  reason?: string                       // why the change (e.g. "summer hours")
}

const DAY_HOURS_SCHEMA = {
  oneOf: [
    { type: 'object', properties: { status: { const: 'closed' } }, required: ['status'], additionalProperties: false },
    {
      type: 'object',
      properties: {
        status: { const: 'open' },
        open: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' },
        close: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' },
      },
      required: ['status', 'open', 'close'],
      additionalProperties: false,
    },
  ],
}

export const UPDATE_HOURS_SCHEMA = {
  type: 'object',
  properties: {
    location_id: { type: 'string', description: 'UUID of the location to update. Omit to use primary.' },
    hours: {
      type: 'object',
      description: 'Weekly hours. Each day is either {status: "closed"} or {status: "open", open: "HH:MM", close: "HH:MM"}.',
      properties: {
        monday: DAY_HOURS_SCHEMA,
        tuesday: DAY_HOURS_SCHEMA,
        wednesday: DAY_HOURS_SCHEMA,
        thursday: DAY_HOURS_SCHEMA,
        friday: DAY_HOURS_SCHEMA,
        saturday: DAY_HOURS_SCHEMA,
        sunday: DAY_HOURS_SCHEMA,
      },
      required: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      additionalProperties: false,
    },
    effective_date: {
      type: 'string',
      format: 'date',
      description: 'ISO date when the new hours start. Omit for immediate.',
    },
    reason: {
      type: 'string',
      maxLength: 200,
      description: 'Short note (e.g. "Summer hours", "Closed for renovation").',
    },
  },
  required: ['hours'],
  additionalProperties: false,
} as const

export interface UpdateHoursOutput {
  update_id: string
  location_id: string
  fanout_targets: string[]
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<UpdateHoursOutput> {
  const input = rawInput as UpdateHoursInput
  const admin = createAdminClient()

  // Resolve location_id: explicit, or primary, or first available.
  let locationId = input.location_id ?? null
  if (!locationId) {
    const { data: loc } = await admin
      .from('gbp_locations')
      .select('id, is_primary')
      .eq('client_id', ctx.clientId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle()
    locationId = (loc?.id as string | undefined) ?? null
  }
  if (!locationId) {
    throw new Error('No location found for this client. Add one in Local SEO first.')
  }

  const targets = ['website', 'gbp']

  const { data: inserted, error } = await admin
    .from('client_updates')
    .insert({
      client_id: ctx.clientId,
      location_id: locationId,
      type: 'hours',
      payload: {
        hours: input.hours,
        effective_date: input.effective_date ?? null,
        reason: input.reason ?? null,
      },
      targets,
      summary: input.reason ?? 'Updated weekly hours',
      status: 'pending',
      source: 'ai_agent',
      approval_required: false,
    })
    .select('id')
    .single()
  if (error || !inserted) throw new Error(`Failed to create hours update: ${error?.message}`)

  return {
    update_id: inserted.id as string,
    location_id: locationId,
    fanout_targets: targets,
  }
}

registerToolHandler('updateHours', handler as never)
