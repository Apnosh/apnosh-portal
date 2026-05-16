/**
 * Tool: tag_photo
 *
 * Enrich a previously-uploaded photo in the client's asset library
 * with a description + tags so it's findable later. Called by the
 * agent right after the owner uploads a photo, e.g.:
 *
 *   Owner: [uploads image of a banh mi]
 *   Agent: "Nice shot of a banh mi! I'll save this to your library
 *           tagged 'food, banh-mi, signature-item' so we can use it
 *           in posts and menu items."
 *           → tag_photo({asset_id, description, tags, ...})
 *
 * Updates `client_assets` in place. Non-destructive (it's adding
 * metadata, not replacing the file) but still requires confirmation
 * so the owner can fix any wrong descriptions before they stick.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

export interface TagPhotoInput {
  asset_id: string
  description: string                     // 1-2 sentences
  tags: string[]                          // 1-8 short tags
  quality_rating?: 'great' | 'good' | 'usable' | 'reshoot'
  mood?: 'casual' | 'elevated' | 'energetic' | 'cozy' | 'minimal'
  orientation?: 'landscape' | 'portrait' | 'square'
  folder?: string                         // e.g. "menu/banh-mi", "team/founder"
}

export const TAG_PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    asset_id: { type: 'string', description: 'UUID of the client_assets row to update.' },
    description: { type: 'string', maxLength: 400, description: 'Plain-English description of the photo.' },
    tags: {
      type: 'array',
      items: { type: 'string', maxLength: 40 },
      minItems: 1,
      maxItems: 8,
      description: 'Short keywords -- food, location, mood, season, item name, etc.',
    },
    quality_rating: { type: 'string', enum: ['great', 'good', 'usable', 'reshoot'] },
    mood: { type: 'string', enum: ['casual', 'elevated', 'energetic', 'cozy', 'minimal'] },
    orientation: { type: 'string', enum: ['landscape', 'portrait', 'square'] },
    folder: { type: 'string', maxLength: 80 },
  },
  required: ['asset_id', 'description', 'tags'],
  additionalProperties: false,
} as const

export interface TagPhotoOutput {
  asset_id: string
  updated_fields: string[]
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<TagPhotoOutput> {
  const input = rawInput as TagPhotoInput
  const admin = createAdminClient()

  // Verify the asset belongs to this client (defense in depth).
  const { data: asset } = await admin
    .from('client_assets')
    .select('id, tags')
    .eq('id', input.asset_id)
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  if (!asset) {
    throw new Error('Asset not found or does not belong to this client.')
  }

  // Preserve any conversation/agent tags already on the row.
  const existingTags = (asset.tags as string[] | null) ?? []
  const preservedSystemTags = existingTags.filter(t => t.startsWith('conversation:') || t === 'from_agent_chat')
  const mergedTags = Array.from(new Set([...input.tags, ...preservedSystemTags]))

  const update: Record<string, unknown> = {
    description: input.description,
    tags: mergedTags,
  }
  if (input.quality_rating) update.quality_rating = input.quality_rating
  if (input.mood) update.mood = input.mood
  if (input.orientation) update.orientation = input.orientation
  if (input.folder) update.folder = input.folder

  const { error } = await admin
    .from('client_assets')
    .update(update)
    .eq('id', input.asset_id)
  if (error) throw new Error(`Failed to update asset: ${error.message}`)

  return {
    asset_id: input.asset_id,
    updated_fields: Object.keys(update),
  }
}

registerToolHandler('tagPhoto', handler as never)
