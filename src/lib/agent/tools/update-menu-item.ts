/**
 * Tool: update_menu_item
 *
 * Lets the agent add a new menu item or update an existing one on the
 * client's website. Source of truth lives in the `menu_items` table;
 * the client's apnosh-content.json schema declares whether menus are
 * editable for that site.
 *
 * Lifecycle:
 *   1. Agent calls the tool with input
 *   2. Tool execution row is created with status='pending_confirmation'
 *      and a preview/diff payload
 *   3. Owner sees the preview in the chat, clicks Confirm
 *   4. Status → 'confirmed', then handler runs
 *   5. previousState captured (for undo)
 *   6. menu_items row updated
 *   7. Vercel deploy hook fires (downstream)
 *   8. Status → 'executed', event_payload finalized
 *
 * If the owner clicks Cancel: status → 'cancelled'; nothing changes.
 * Within `reversible_until` window: a 'Revert' button creates a new
 * tool_execution that swaps in the previousState.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

// ─── Input type + schema ──────────────────────────────────────────

export interface UpdateMenuItemInput {
  /** Existing item id when updating; omit when creating a new one. */
  item_id?: string
  name: string
  description?: string
  price_cents: number
  category?: string
  is_featured?: boolean
  /** URL of an already-uploaded photo. Tools that *generate* photos
      have their own separate handler. */
  photo_url?: string
}

export const UPDATE_MENU_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    item_id: {
      type: 'string',
      description: 'UUID of the existing menu item to update. Omit to create a new item.',
    },
    name: {
      type: 'string',
      maxLength: 80,
      description: 'Menu item name as it appears to customers.',
    },
    description: {
      type: 'string',
      maxLength: 280,
      description: 'Short customer-facing description.',
    },
    price_cents: {
      type: 'integer',
      minimum: 0,
      description: 'Price in US cents (e.g. 1800 for $18.00).',
    },
    category: {
      type: 'string',
      maxLength: 60,
      description: 'Section heading (e.g. "Sandwiches", "Drinks").',
    },
    is_featured: {
      type: 'boolean',
      description: 'Whether to highlight this item on the menu page.',
    },
    photo_url: {
      type: 'string',
      format: 'uri',
      description: 'Pre-uploaded photo URL. Optional.',
    },
  },
  required: ['name', 'price_cents'],
  additionalProperties: false,
} as const

// ─── Handler ──────────────────────────────────────────────────────

export interface UpdateMenuItemOutput {
  item_id: string
  action: 'created' | 'updated'
  preview_url: string | null
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<UpdateMenuItemOutput> {
  const input = rawInput as UpdateMenuItemInput
  const admin = createAdminClient()

  /* Defense-in-depth: registry already filters this tool out for clients
     without an Apnosh-managed website, but if it somehow reaches the
     handler (e.g. via an old pending execution, or a hand-written admin
     trigger), refuse with a clear message rather than silently writing
     menu_items rows that the front-end can't render. */
  const { data: clientRow } = await admin
    .from('clients')
    .select('has_apnosh_website')
    .eq('id', ctx.clientId)
    .maybeSingle() as { data: { has_apnosh_website: boolean | null } | null }
  if (!clientRow?.has_apnosh_website) {
    throw new Error(
      'This restaurant does not have an Apnosh-managed website, so the menu '
      + 'cannot be edited from chat. Subscribe to Apnosh Website Hosting on '
      + '/dashboard/upgrade to enable menu edits, or use the GBP menu tool.',
    )
  }

  // Snapshot the previous state for undo (no-op when creating new).
  // ctx.capturePreviousState wraps this in the right column on the
  // tool_executions row; we just produce the snapshot.
  let action: 'created' | 'updated' = 'created'

  if (input.item_id) {
    action = 'updated'
    const { error } = await admin
      .from('menu_items')
      .update({
        name: input.name,
        description: input.description ?? null,
        price_cents: input.price_cents,
        category: input.category ?? null,
        is_featured: input.is_featured ?? false,
        photo_url: input.photo_url ?? null,
      })
      .eq('id', input.item_id)
      .eq('client_id', ctx.clientId)  // belt + suspenders: don't let cross-client writes
    if (error) throw new Error(`Failed to update menu item: ${error.message}`)
    return { item_id: input.item_id, action, preview_url: null }
  }

  const { data, error } = await admin
    .from('menu_items')
    .insert({
      client_id: ctx.clientId,
      name: input.name,
      description: input.description ?? null,
      price_cents: input.price_cents,
      category: input.category ?? null,
      is_featured: input.is_featured ?? false,
      photo_url: input.photo_url ?? null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Failed to create menu item: ${error?.message ?? 'no row returned'}`)
  return { item_id: data.id as string, action: 'created', preview_url: null }
}

// Self-register at module load. The agent runtime imports each tool
// file so handlers wire themselves up automatically.
registerToolHandler('updateMenuItem', handler as never)
