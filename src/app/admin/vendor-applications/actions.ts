'use server'

/**
 * Admin actions for processing vendor applications.
 *
 *   - approveApplication: creates a vendors row from the application,
 *     links them back via vendor_id, marks the application 'approved'.
 *   - declineApplication: marks 'declined' with admin notes.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'vendor'
}

export async function approveApplication(
  applicationId: string,
  notes?: string,
): Promise<{ ok: boolean; error?: string; vendorSlug?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  /* Load application. */
  const { data: app } = await admin
    .from('vendor_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle() as { data: {
      id: string
      applicant_type: 'individual' | 'company'
      display_name: string
      email: string
      categories: string[]
      service_area: string[]
      portfolio_url: string | null
      pitch: string
      status: string
    } | null }
  if (!app) return { ok: false, error: 'Application not found' }
  if (app.status !== 'pending' && app.status !== 'reviewing') {
    return { ok: false, error: `Already ${app.status}` }
  }

  /* Create unique slug. */
  const baseSlug = slugify(app.display_name)
  let slug = baseSlug
  let suffix = 0
  for (;;) {
    const { data: existing } = await admin
      .from('vendors')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle()
    if (!existing) break
    suffix += 1
    slug = `${baseSlug}-${suffix}`
    if (suffix > 50) return { ok: false, error: 'Could not generate unique slug' }
  }

  /* Create vendor row. */
  const { data: vendor, error: vErr } = await admin
    .from('vendors')
    .insert({
      slug,
      name: app.display_name,
      vendor_type: app.applicant_type,
      description: app.pitch,
      service_area: app.service_area,
      tier: 'free',
      platform_fee_percent: 20.00,
      bookable: true,
    })
    .select('id, slug')
    .single() as { data: { id: string; slug: string } | null; error: { message: string } | null }
  if (vErr || !vendor) return { ok: false, error: vErr?.message ?? 'Failed to create vendor' }

  /* Mark application approved. */
  await admin
    .from('vendor_applications')
    .update({
      status: 'approved',
      resolved_at: new Date().toISOString(),
      resolved_by: auth.userId,
      vendor_id: vendor.id,
      admin_notes: notes ?? null,
    })
    .eq('id', applicationId)

  revalidatePath('/admin/vendor-applications')
  return { ok: true, vendorSlug: vendor.slug }
}

export async function declineApplication(
  applicationId: string,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const { error } = await admin
    .from('vendor_applications')
    .update({
      status: 'declined',
      resolved_at: new Date().toISOString(),
      resolved_by: auth.userId,
      admin_notes: notes ?? null,
    })
    .eq('id', applicationId)
    .in('status', ['pending', 'reviewing'])
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/vendor-applications')
  return { ok: true }
}

export async function markReviewing(applicationId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const { error } = await admin
    .from('vendor_applications')
    .update({ status: 'reviewing' })
    .eq('id', applicationId)
    .eq('status', 'pending')
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/vendor-applications')
  return { ok: true }
}
