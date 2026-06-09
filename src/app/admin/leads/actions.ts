'use server'

/**
 * Admin actions for the "Get Featured" lead funnel (feature_intake).
 *
 * Leads move new -> contacted -> qualified, or get archived if they're
 * not a fit. Status-only transitions; the row is otherwise immutable.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureClientProfile } from '@/lib/crm-sync'
import type { FeatureIntake, FeatureIntakeStatus } from '@/types/database'

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle() as { data: { role: string } | null }
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Admin only' }
  }
  return { ok: true, userId: user.id }
}

export async function setLeadStatus(
  leadId: string,
  status: FeatureIntakeStatus,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const { error } = await admin
    .from('feature_intake')
    .update({ status })
    .eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/leads')
  return { ok: true }
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'client'
}

/**
 * Convert a "Get Featured" lead into a CRM client record.
 *
 * The created client is deliberately a *lead* — status 'pending' — so it lands
 * in the CRM pipeline without being treated as an active, billable client. The
 * feature_intake row is stamped with converted_client_id and status 'converted'
 * so it can't be converted twice and links straight to the new profile.
 */
export async function convertLeadToClient(
  leadId: string,
): Promise<{ ok: boolean; error?: string; clientSlug?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  /* Load the lead. */
  const { data: lead } = await admin
    .from('feature_intake')
    .select('*')
    .eq('id', leadId)
    .maybeSingle() as { data: FeatureIntake | null }
  if (!lead) return { ok: false, error: 'Lead not found' }

  /* Idempotency: if already converted, return the existing client. */
  if (lead.converted_client_id) {
    const { data: existing } = await admin
      .from('clients')
      .select('slug')
      .eq('id', lead.converted_client_id)
      .maybeSingle() as { data: { slug: string } | null }
    if (existing) return { ok: true, clientSlug: existing.slug }
  }

  /* Unique slug from the restaurant name. */
  const baseSlug = slugify(lead.restaurant_name)
  let slug = baseSlug
  let suffix = 0
  for (;;) {
    const { data: clash } = await admin
      .from('clients')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle()
    if (!clash) break
    suffix += 1
    slug = `${baseSlug}-${suffix}`
    if (suffix > 50) return { ok: false, error: 'Could not generate unique slug' }
  }

  /* Roll the lead's story + context into the client's notes so nothing is lost. */
  const noteParts = [
    `Converted from "Get Featured" lead on ${new Date().toLocaleDateString()}.`,
    lead.concept ? `Concept: ${lead.concept}` : null,
    lead.years_open ? `Open: ${lead.years_open}` : null,
    lead.lead_score ? `Intake score: ${lead.lead_score}` : null,
    lead.story ? `\nTheir story:\n${lead.story}` : null,
    lead.anything_else ? `\nAnything else:\n${lead.anything_else}` : null,
  ].filter(Boolean)

  /* Create the client as a LEAD (status 'pending'). */
  const { data: client, error: cErr } = await admin
    .from('clients')
    .insert({
      name: lead.restaurant_name,
      slug,
      industry: 'Restaurant',
      location: lead.neighborhood || null,
      primary_contact: lead.contact_name || null,
      email: lead.email || null,
      phone: lead.phone || null,
      status: 'pending',
      lead_source: 'inbound_web',
      lead_source_detail: 'Get Featured form',
      notes: noteParts.join('\n'),
      services_active: [],
    })
    .select('id, slug')
    .single() as { data: { id: string; slug: string } | null; error: { message: string } | null }
  if (cErr || !client) return { ok: false, error: cErr?.message ?? 'Failed to create client' }

  /* Mirror the manual create flow's supporting rows so client detail views
     don't break expecting them. Best-effort — a missing brand/pattern row
     shouldn't fail the whole conversion. */
  await admin.from('client_brands').insert({ client_id: client.id })
  await admin.from('client_patterns').insert({ client_id: client.id })
  await ensureClientProfile(client.id)

  /* Stamp the lead: mark converted + link back. */
  await admin
    .from('feature_intake')
    .update({ status: 'converted', converted_client_id: client.id })
    .eq('id', leadId)

  revalidatePath('/admin/leads')
  revalidatePath('/admin/clients')
  return { ok: true, clientSlug: client.slug }
}
