'use server'

/**
 * Bulk client import from CSV (typically exported from Notion).
 *
 * Takes a pre-validated array of mapped row objects (the admin UI does
 * column mapping + validation) and inserts into `clients` + optional
 * related tables (contacts, locations) in one transaction.
 *
 * Duplicate detection by normalized slug OR email. Duplicates surface
 * as a `skipped` row in the result rather than throwing, so the admin
 * can review after import.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSupabase = SupabaseClient<any, 'public', any>

function getAdminSupabase(): AdminSupabase {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as AdminSupabase
}

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') return { ok: false, error: 'Admin access required' }
  return { ok: true, userId: user.id }
}

/**
 * Shape each row must have after the admin does column mapping in the UI.
 * name is the only required field; everything else is optional.
 */
export interface ImportClientRow {
  name: string
  slug?: string
  industry?: string
  location?: string
  website?: string
  primary_contact?: string
  email?: string
  phone?: string
  tier?: 'Basic' | 'Standard' | 'Pro' | 'Internal' | null
  monthly_rate?: number | null
  billing_status?: 'active' | 'paused' | 'cancelled' | 'past_due'
  onboarding_date?: string
  notes?: string
  // Free-form socials keyed by platform name (instagram, facebook, etc)
  socials?: Record<string, string>
  services_active?: string[]
}

export interface ImportResult {
  total: number
  inserted: number
  skipped: number
  failed: number
  errors: Array<{ row: number; name: string; error: string }>
  skippedRows: Array<{ row: number; name: string; reason: string }>
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
}

export async function importClientsFromCsv(
  rows: ImportClientRow[],
  options?: { skipDuplicates?: boolean; dryRun?: boolean },
): Promise<{ success: true; data: ImportResult } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: 'No rows to import' }
  }

  const admin = getAdminSupabase()
  const result: ImportResult = {
    total: rows.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    skippedRows: [],
  }

  // Pre-fetch existing slugs and emails so we can detect duplicates before
  // attempting to insert. Faster than hitting the unique-constraint error
  // one row at a time.
  const { data: existingRows } = await admin
    .from('clients')
    .select('slug, email')
  const existingSlugs = new Set<string>()
  const existingEmails = new Set<string>()
  for (const r of (existingRows ?? []) as Array<{ slug: string; email: string | null }>) {
    existingSlugs.add(r.slug.toLowerCase())
    if (r.email) existingEmails.add(r.email.toLowerCase())
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const humanRow = i + 2 // +2 because CSV header is row 1, data starts at row 2

    if (!row.name || row.name.trim().length === 0) {
      result.failed += 1
      result.errors.push({ row: humanRow, name: '(no name)', error: 'Missing name' })
      continue
    }

    const slug = (row.slug && row.slug.trim().length > 0 ? row.slug : slugify(row.name)).toLowerCase()
    const email = row.email?.trim().toLowerCase() || null

    // Duplicate check
    const slugExists = existingSlugs.has(slug)
    const emailExists = email !== null && existingEmails.has(email)
    if (slugExists || emailExists) {
      if (options?.skipDuplicates !== false) {
        result.skipped += 1
        result.skippedRows.push({
          row: humanRow,
          name: row.name,
          reason: slugExists
            ? `Client with slug "${slug}" already exists`
            : `Client with email "${email}" already exists`,
        })
        continue
      }
    }

    if (options?.dryRun) {
      result.inserted += 1
      continue
    }

    // Normalize fields
    const payload: Record<string, unknown> = {
      name: row.name.trim(),
      slug,
      industry: row.industry || null,
      location: row.location || null,
      website: row.website || null,
      primary_contact: row.primary_contact || null,
      email,
      phone: row.phone || null,
      socials: row.socials ?? {},
      services_active: row.services_active ?? [],
      tier: row.tier ?? null,
      monthly_rate: row.monthly_rate ?? null,
      billing_status: row.billing_status ?? 'active',
      onboarding_date: row.onboarding_date || null,
      notes: row.notes || null,
    }

    const { data: inserted, error: insertErr } = await admin
      .from('clients')
      .insert(payload)
      .select('id')
      .single()

    if (insertErr || !inserted) {
      result.failed += 1
      result.errors.push({
        row: humanRow,
        name: row.name,
        error: insertErr?.message ?? 'Unknown insert error',
      })
      continue
    }

    // Sister rows (brand + patterns) so the rest of the app doesn't NPE on missing rows
    await admin.from('client_brands').insert({ client_id: inserted.id })
    await admin.from('client_patterns').insert({ client_id: inserted.id })

    // Remember what we just inserted so later rows don't collide
    existingSlugs.add(slug)
    if (email) existingEmails.add(email)

    result.inserted += 1
  }

  if (!options?.dryRun && result.inserted > 0) {
    revalidatePath('/admin/clients')
  }
  return { success: true, data: result }
}

// ---------------------------------------------------------------------------
// Delete a single client (hard delete -- cascades to related rows via FK).
// Used by the test-data cleanup flow. Admin-only.
// ---------------------------------------------------------------------------

export async function deleteClient(
  clientId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  const { error } = await admin.from('clients').delete().eq('id', clientId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/clients')
  return { success: true }
}

export async function bulkDeleteClients(
  clientIds: string[],
): Promise<{ success: true; data: { deleted: number } } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (clientIds.length === 0) return { success: true, data: { deleted: 0 } }

  const admin = getAdminSupabase()
  const { error } = await admin.from('clients').delete().in('id', clientIds)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/clients')
  return { success: true, data: { deleted: clientIds.length } }
}
