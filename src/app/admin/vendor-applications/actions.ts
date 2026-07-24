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
import { craftForCategories } from '@/lib/campaigns/vendor-supply'
import { onboardCreatorCore, type OnboardCreatorInput, type OnboardCreatorResult } from '@/lib/marketplace/onboard-creator'
import { createNotification } from '@/lib/notifications'

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

  /* Create vendor row. The craft (dispatch discipline) comes from the applicant's
     own categories — with it set, campaign work auto-routes to this vendor the
     moment they log in (vendors.person_id links on first login, matched by the
     application email). Non-creative categories leave craft null: bookable on
     the storefront, never auto-dispatched. */
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
      craft: craftForCategories(app.categories),
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

/**
 * Link a vendor to their portal login, explicitly. This is the ONLY way a real
 * vendor becomes dispatchable (bestVendorForDiscipline requires person_id):
 * email-based auto-linking was removed because this project's auth runs with
 * autoconfirm on — an unverified signup email must never claim a vendor's work
 * queue and payout rail. The admin verifies the person out-of-band, then links.
 * One-shot: an already-claimed vendor is never re-pointed (unlink is a manual
 * DB act, deliberately).
 */
export async function linkVendorLogin(
  vendorId: string,
  userEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const wanted = userEmail.trim().toLowerCase()
  if (!wanted) return { ok: false, error: 'An email is required' }

  // supabase-js has no lookup-by-email; scan pages (fine at this user count).
  let userId: string | null = null
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return { ok: false, error: error.message }
    userId = data.users.find((u) => (u.email ?? '').toLowerCase() === wanted)?.id ?? null
    if (data.users.length < 200) break
  }
  if (!userId) return { ok: false, error: `No portal user with the email ${wanted}. Ask them to sign up first.` }

  const { data: claimed, error: claimErr } = await admin
    .from('vendors')
    .update({ person_id: userId })
    .eq('id', vendorId)
    .is('person_id', null)
    .select('id, name')
    .maybeSingle()
  if (claimErr) return { ok: false, error: claimErr.message }
  if (!claimed) return { ok: false, error: 'This vendor already has a login linked (or was not found).' }

  revalidatePath('/admin/vendors')
  return { ok: true }
}

/**
 * Onboard a real creator with a working login, in one admin step: create their vendor, send them a
 * set-your-password invite (or link an existing login), and wire both resolution links. Admin only.
 * The creator sets their own password from the invite — Apnosh never handles it.
 */
export async function onboardCreator(input: OnboardCreatorInput): Promise<OnboardCreatorResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const res = await onboardCreatorCore(input)
  if (res.ok) { revalidatePath('/admin/creators'); revalidatePath('/admin/vendors') }
  return res
}

/**
 * Approve a creator into the store (or pause them out of it) — the review gate for self-serve signups.
 * Self-serve creators sign up bookable=false; this flips it. On approval, the creator is told they're
 * live. Admin only.
 */
export async function setCreatorLive(vendorId: string, live: boolean): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()
  const { data: v, error } = await admin
    .from('vendors')
    .update({ bookable: live })
    .eq('id', vendorId)
    .select('id, person_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!v) return { ok: false, error: 'Creator not found.' }
  if (live && v.person_id) {
    await createNotification({
      userId: v.person_id as string,
      kind: 'client_request',
      title: 'You are live on Apnosh',
      body: 'Your profile is approved. Restaurants can now find and book you.',
      link: '/creator/storefront',
    }).catch(() => {})
  }
  revalidatePath('/admin/vendors')
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
