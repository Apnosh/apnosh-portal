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

export type ContentFieldType = 'text' | 'asset' | 'toggle'

export interface ContentFieldSchema {
  key: string                          // 'hero.subhead' or 'header.logo'
  page?: string                        // 'home', 'about', etc. (for grouping)
  label: string                        // 'Hero subhead'
  description?: string
  type?: ContentFieldType              // 'text' (default) | 'asset' (image URL) | 'toggle' ('true'/'false')
  default?: string                     // fallback if no override (default copy / default image URL / 'true'|'false' for toggle)
  constraints?: {
    minChars?: number
    maxChars?: number
    forbidPunctuation?: string[]       // ['!', '?'] etc.
    multiline?: boolean
    // asset-only constraints
    aspect?: string                    // e.g. '16:9', '1:1' -- advisory
    recommendedSize?: string           // e.g. '1200x800' -- advisory
  }
  required?: boolean
}

// Feature flags + their literal list live in dashboard-features.ts because
// 'use server' files can only export async functions (no type re-exports
// either, even type-only). Consumers import from dashboard-features directly.
import { ALL_FEATURES, type DashboardFeature } from './dashboard-features'

export interface ContentSchemaResponse {
  version: number
  /** Industry/category — used for analytics + scaffolding new sites. Free-form. */
  vertical?: string
  /** Optional override for client.name shown in the dashboard. */
  displayName?: string
  /** Which content tiles + editor pages this site supports. Default: all. */
  features?: DashboardFeature[]
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
    // Validate features against the known list; drop unknowns silently so a
    // typo in apnosh-content.json doesn't break the dashboard.
    const rawFeatures = Array.isArray(data?.features) ? (data.features as unknown[]) : null
    const features = rawFeatures
      ? (rawFeatures.filter((f): f is DashboardFeature =>
          typeof f === 'string' && (ALL_FEATURES as string[]).includes(f),
        ))
      : undefined
    return {
      version: Number(data.version ?? 1),
      vertical: typeof data.vertical === 'string' ? data.vertical : undefined,
      displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
      features,
      fields: data.fields as ContentFieldSchema[],
    }
  } catch {
    return null
  }
}

// ─── Public actions ───────────────────────────────────────────────

export interface DashboardConfig {
  /** Resolved feature flags: the customer's declared list, or all features when unset. */
  features: DashboardFeature[]
  /** Free-form vertical (e.g. 'restaurant', 'salon') -- null when not declared. */
  vertical: string | null
  /** Display name override for the dashboard (falls back to client.name elsewhere). */
  displayName: string | null
  /** True when the customer site published a usable apnosh-content.json. */
  hasContentSchema: boolean
}

/**
 * Resolve which features (tiles/editor pages) this client's dashboard should
 * expose. The customer site is the source of truth: it declares `features`
 * in apnosh-content.json. When unset, all features are enabled.
 *
 * Pre-existing sites with no schema get the full feature set so we don't
 * regress their UX while they migrate.
 */
export async function getMyDashboardConfig(): Promise<
  { success: true; data: DashboardConfig } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data: settings } = await db
    .from('site_settings')
    .select('external_site_url')
    .eq('client_id', auth.clientId)
    .maybeSingle()
  const schema = await fetchClientContentSchema(
    (settings?.external_site_url as string | null) ?? null,
  )

  return {
    success: true,
    data: {
      features: schema?.features ?? ALL_FEATURES,
      vertical: schema?.vertical ?? null,
      displayName: schema?.displayName ?? null,
      hasContentSchema: !!schema,
    },
  }
}

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

  const siteUrl = (settings?.external_site_url as string | null) ?? null
  const fields: ContentFieldWithValue[] = schema.fields.map(f => {
    const ov = overrideMap.get(f.key)
    let value = ov?.value ?? f.default ?? ''
    // Asset fields with relative paths must be resolved against the customer's
    // site URL so previews load in the dashboard (which lives on a different domain).
    if (f.type === 'asset' && value.startsWith('/') && siteUrl) {
      try { value = new URL(value, siteUrl).toString() } catch {}
    }
    return {
      ...f,
      value,
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
  // Toggle fields are boolean strings.
  if (field.type === 'toggle') {
    if (value !== 'true' && value !== 'false') return 'Toggle must be true or false'
    return null
  }
  // Asset fields are image URLs -- skip length and HTML checks.
  if (field.type === 'asset') {
    if (value && !/^https?:\/\//i.test(value) && !value.startsWith('/')) {
      return 'Asset must be an http(s):// URL or absolute /path'
    }
    return null
  }
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
 * Two-pass:
 *   1. Cheap synchronous rules (schema-level forbid_punctuation, blatant
 *      brand-voice violations from voice_notes keywords). Catches the
 *      obvious cases without an API call.
 *   2. Claude pass for nuanced voice judgment. Reads voice_notes + value
 *      and returns a one-line warning + optional rewrite, OR a clean
 *      "looks on-brand."
 *
 * The AI pass is what makes this different from a Webflow-style CMS.
 * It's also what makes the system get smarter over time as we feed
 * voice_overrides back into voice_notes refinement.
 */
export async function voiceCheck(
  fieldKey: string,
  value: string,
): Promise<VoiceCheckResult> {
  const auth = await requireClientUser()
  if (!auth.ok) return { warning: null, suggestion: null }

  const db = adminDb()

  // Pull schema + brand context
  const [settingsRes, brandRes] = await Promise.all([
    db.from('site_settings').select('external_site_url').eq('client_id', auth.clientId).maybeSingle(),
    db.from('client_brands').select('voice_notes').eq('client_id', auth.clientId).maybeSingle(),
  ])
  const schema = await fetchClientContentSchema(
    (settingsRes.data?.external_site_url as string | null) ?? null,
  )
  const field = schema?.fields.find(f => f.key === fieldKey)
  const voiceNotes = (brandRes.data?.voice_notes as string | null) ?? null

  // Pass 1 -- cheap rules
  const forbid = field?.constraints?.forbidPunctuation ?? []
  for (const ch of forbid) {
    if (value.includes(ch)) {
      return {
        warning: `This field's style avoids "${ch}" (per your site's content rules).`,
        suggestion: value.replaceAll(ch, '.'),
      }
    }
  }
  if (voiceNotes && /no exclamation/i.test(voiceNotes) && value.includes('!')) {
    return {
      warning: 'Your brand voice says "no exclamation points." This draft has one.',
      suggestion: value.replaceAll('!', '.'),
    }
  }

  // Pass 2 -- Claude. Skip if no API key, no voice_notes (nothing to compare
  // against), or value is identical to the field default (likely no change).
  if (!process.env.ANTHROPIC_API_KEY || !voiceNotes || !field) {
    return { warning: null, suggestion: null }
  }
  if (value.trim() === (field.default ?? '').trim()) {
    return { warning: null, suggestion: null }
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 250,
      system: [
        'You are a brand voice consultant.',
        'Given a brand\'s voice notes and a single piece of website copy, decide if the copy is on-brand.',
        'Output STRICT JSON only -- no prose outside the JSON object. Schema:',
        '  { "ok": true } if the copy is on-brand',
        '  { "ok": false, "warning": "<one short sentence explaining the mismatch>", "suggestion": "<optional rewrite, same meaning, same length, on-brand>" }',
        'Rules:',
        '- Be liberal. If the copy is reasonable, return ok:true.',
        '- Only flag clear voice mismatches (tone, register, vocabulary).',
        '- Do not flag spelling or grammar.',
        '- Suggestions must be the same approximate length and meaning, not a different message.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: [
            `Field: "${field.label}" (${field.description ?? 'no description'})`,
            '',
            'Brand voice notes:',
            voiceNotes,
            '',
            'Copy to evaluate:',
            value,
          ].join('\n'),
        },
      ],
    })
    const block = resp.content.find(b => b.type === 'text')
    const raw = block && 'text' in block ? block.text : ''
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (parsed?.ok === true) return { warning: null, suggestion: null }
    if (parsed?.ok === false) {
      return {
        warning: typeof parsed.warning === 'string' ? parsed.warning : 'This may not match your brand voice.',
        suggestion: typeof parsed.suggestion === 'string' && parsed.suggestion.trim().length > 0
          ? parsed.suggestion.trim()
          : null,
      }
    }
  } catch (e) {
    // AI failure is non-fatal -- voice check stays advisory. Log and fall through.
    console.warn('[voiceCheck] AI pass failed:', e instanceof Error ? e.message : e)
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
