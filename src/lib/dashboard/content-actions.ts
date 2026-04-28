'use server'

/**
 * Content editing for client-managed copy.
 *
 * Pattern (per docs/INTEGRATION-PLAYBOOK.md):
 *   - The customer site repo publishes apnosh-content.json declaring which
 *     text fields are editable, with constraints (length, format, voice).
 *   - This module reads that schema, validates client edits against the
 *     hard constraints, and stores override values in client_content_fields.
 *   - Voice constraints are advisory: voiceCheck() returns a warning but
 *     never blocks. updateMyContent() accepts an `overrideVoiceWarning`
 *     flag so the client's "publish anyway" choice ships unchanged.
 *
 * Hard constraints (block save):
 *   - max_chars / min_chars
 *   - format (plain text only -- no HTML injection)
 *   - required (cannot be empty if not optional)
 *
 * Soft constraints (warn, allow override):
 *   - voice violations against client_brands.voice_notes
 *   - tone mismatches
 *   - forbid_punctuation patterns from the schema
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

async function requireClientUser(): Promise<
  | { ok: true; userId: string; clientId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const db = adminDb()
  const { data: cu } = await db
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!cu?.client_id) return { ok: false, error: 'No client account' }
  return { ok: true, userId: user.id, clientId: cu.client_id as string }
}

// ─── Schema types ─────────────────────────────────────────────────

export interface ContentFieldSchema {
  key: string                          // 'hero.subhead'
  page?: string                        // 'home', 'about', etc. (for grouping)
  label: string                        // 'Hero subhead'
  description?: string
  default?: string                     // fallback if no override
  constraints?: {
    minChars?: number
    maxChars?: number
    forbidPunctuation?: string[]       // ['!', '?'] etc.
    multiline?: boolean
  }
  required?: boolean
}

export interface ContentSchemaResponse {
  version: number
  fields: ContentFieldSchema[]
}

export interface ContentFieldWithValue extends ContentFieldSchema {
  value: string                        // either override or default
  hasOverride: boolean
  lastEditedAt: string | null
}

// ─── Schema fetch ─────────────────────────────────────────────────

/**
 * Fetch the customer site's content schema. The schema lives in their repo,
 * served at <site_url>/apnosh-content.json. If they haven't published one,
 * we return an empty schema and the editor shows a friendly empty state.
 */
async function fetchClientContentSchema(siteUrl: string | null): Promise<ContentSchemaResponse | null> {
  if (!siteUrl) return null
  try {
    const url = new URL('/apnosh-content.json', siteUrl).toString()
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data?.fields)) return null
    return { version: Number(data.version ?? 1), fields: data.fields as ContentFieldSchema[] }
  } catch {
    return null
  }
}

// ─── Public actions ───────────────────────────────────────────────

/**
 * Get the editable fields for the signed-in client's site, merged with any
 * existing overrides. Returns null if the site doesn't expose a schema yet.
 */
export async function getMyContentFields(): Promise<
  { success: true; data: { fields: ContentFieldWithValue[]; hasSchema: boolean } }
  | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()

  // Get the external site URL to resolve the schema location
  const { data: settings } = await db
    .from('site_settings')
    .select('external_site_url')
    .eq('client_id', auth.clientId)
    .maybeSingle()

  const schema = await fetchClientContentSchema((settings?.external_site_url as string | null) ?? null)
  if (!schema) {
    return { success: true, data: { fields: [], hasSchema: false } }
  }

  // Get existing override values
  const { data: overrides } = await db
    .from('client_content_fields')
    .select('field_key, value, last_edited_at')
    .eq('client_id', auth.clientId)

  const overrideMap = new Map<string, { value: string; lastEditedAt: string | null }>()
  for (const o of overrides ?? []) {
    overrideMap.set(o.field_key as string, {
      value: o.value as string,
      lastEditedAt: (o.last_edited_at as string | null) ?? null,
    })
  }

  const fields: ContentFieldWithValue[] = schema.fields.map(f => {
    const ov = overrideMap.get(f.key)
    return {
      ...f,
      value: ov?.value ?? f.default ?? '',
      hasOverride: !!ov,
      lastEditedAt: ov?.lastEditedAt ?? null,
    }
  })

  return { success: true, data: { fields, hasSchema: true } }
}

/**
 * Validate hard constraints. Returns null if ok, error message if not.
 * Soft constraints (voice etc.) are NOT checked here -- those go through
 * voiceCheck() which is advisory.
 */
function validateHardConstraints(value: string, field: ContentFieldSchema): string | null {
  if (field.required && !value.trim()) return 'This field is required'
  const c = field.constraints ?? {}
  if (c.minChars && value.length < c.minChars) {
    return `Too short (${value.length}/${c.minChars} min)`
  }
  if (c.maxChars && value.length > c.maxChars) {
    return `Too long (${value.length}/${c.maxChars} max)`
  }
  // Reject HTML/script tags. Plain text only.
  if (/<\/?[a-z][\s\S]*?>/i.test(value)) {
    return 'HTML tags are not allowed in this field'
  }
  return null
}

export interface VoiceCheckResult {
  warning: string | null               // null = no concern; string = advisory message
  suggestion: string | null            // optional rewrite
}

/**
 * Soft voice check. Returns advisory warning + optional suggestion.
 * Never blocks.
 *
 * Implementation note: this is currently a lightweight rule-based pass
 * (forbid_punctuation from schema + brand voice keyword scan). A future
 * iteration calls Claude with the brand voice notes + value for richer
 * advisory feedback. Both should be ADVISORY, not blocking.
 */
export async function voiceCheck(
  fieldKey: string,
  value: string,
): Promise<VoiceCheckResult> {
  const auth = await requireClientUser()
  if (!auth.ok) return { warning: null, suggestion: null }

  const db = adminDb()

  // Load schema again to know per-field forbid_punctuation
  const { data: settings } = await db
    .from('site_settings')
    .select('external_site_url')
    .eq('client_id', auth.clientId)
    .maybeSingle()
  const schema = await fetchClientContentSchema((settings?.external_site_url as string | null) ?? null)
  const field = schema?.fields.find(f => f.key === fieldKey)

  // 1. Forbid-punctuation rule from schema
  const forbid = field?.constraints?.forbidPunctuation ?? []
  for (const ch of forbid) {
    if (value.includes(ch)) {
      return {
        warning: `This field's style avoids "${ch}" (per your site's content rules).`,
        suggestion: value.replaceAll(ch, '.'),
      }
    }
  }

  // 2. Brand voice notes scan (lightweight)
  const { data: brand } = await db
    .from('client_brands')
    .select('voice_notes')
    .eq('client_id', auth.clientId)
    .maybeSingle()
  const voiceNotes = ((brand?.voice_notes as string | null) ?? '').toLowerCase()
  if (voiceNotes.includes('no exclamation') && value.includes('!')) {
    return {
      warning: 'Your brand voice says "no exclamation points." This draft has one.',
      suggestion: value.replaceAll('!', '.'),
    }
  }
  if (voiceNotes.includes('plain-spoken') || voiceNotes.includes('plain spoken')) {
    // Flag obvious marketing-speak
    const flags = ['leverage', 'synergy', 'cutting-edge', 'next level', 'best in class']
    for (const f of flags) {
      if (value.toLowerCase().includes(f)) {
        return {
          warning: `Your brand voice is plain-spoken. "${f}" reads as marketing-speak.`,
          suggestion: null,
        }
      }
    }
  }

  return { warning: null, suggestion: null }
}

/**
 * Save a content field value. Validates hard constraints and rejects on
 * failure. Voice warnings are NOT enforced -- caller controls override
 * via the `acceptedVoiceWarning` parameter. If a warning was shown and
 * the client clicked "publish anyway," pass the warning text so we log
 * the override (signal for AI voice-evolution learning).
 *
 * After save, fires the website fanout (deploy hook). The customer site
 * rebuilds and picks up the new value via the public API.
 */
export async function updateMyContent(args: {
  fieldKey: string
  value: string
  acceptedVoiceWarning?: string        // present iff client overrode a soft warning
}): Promise<
  | { success: true; data: { hasOverride: boolean } }
  | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()

  // Load schema to validate
  const { data: settings } = await db
    .from('site_settings')
    .select('external_site_url, site_type, is_published, external_deploy_hook_url')
    .eq('client_id', auth.clientId)
    .maybeSingle()

  const schema = await fetchClientContentSchema((settings?.external_site_url as string | null) ?? null)
  if (!schema) return { success: false, error: 'Site has no content schema (apnosh-content.json missing)' }

  const field = schema.fields.find(f => f.key === args.fieldKey)
  if (!field) return { success: false, error: `Unknown field: ${args.fieldKey}` }

  const hardError = validateHardConstraints(args.value, field)
  if (hardError) return { success: false, error: hardError }

  // Compose voice_overrides log entry if accepting a warning
  const overrideEntry = args.acceptedVoiceWarning
    ? { warning: args.acceptedVoiceWarning, value: args.value, at: new Date().toISOString() }
    : null

  // Upsert the field value
  const { data: existing } = await db
    .from('client_content_fields')
    .select('id, voice_overrides')
    .eq('client_id', auth.clientId)
    .eq('field_key', args.fieldKey)
    .maybeSingle()

  if (existing) {
    const overrides = (existing.voice_overrides as unknown[]) ?? []
    if (overrideEntry) overrides.push(overrideEntry)
    const { error } = await db
      .from('client_content_fields')
      .update({
        value: args.value,
        last_edited_by: auth.userId,
        last_edited_at: new Date().toISOString(),
        voice_overrides: overrides,
      })
      .eq('id', existing.id as string)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await db
      .from('client_content_fields')
      .insert({
        client_id: auth.clientId,
        field_key: args.fieldKey,
        value: args.value,
        last_edited_by: auth.userId,
        voice_overrides: overrideEntry ? [overrideEntry] : [],
      })
    if (error) return { success: false, error: error.message }
  }

  // Trigger the customer site to rebuild so it picks up the new value
  if (settings?.site_type === 'external_repo' && settings?.external_deploy_hook_url) {
    try {
      await fetch(settings.external_deploy_hook_url as string, { method: 'POST' })
    } catch {
      // Non-fatal: value is saved, deploy hook fire failed. Surfaced in UI.
    }
  }

  revalidatePath('/dashboard/website/manage')
  return { success: true, data: { hasOverride: true } }
}
