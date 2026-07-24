import 'server-only'

/**
 * ONBOARD A CREATOR WITH A LOGIN — the one step that turns a real person into a working creator.
 *
 * It does the three things a real creator needs, which were split across the codebase before:
 *   1. a vendor record (their identity + craft, bookable in the store)
 *   2. an auth login — an existing one by email, or a set-your-password INVITE (we never handle the
 *      password; the creator sets it themselves from the email)
 *   3. both resolution links:
 *        vendors.person_id  → their storefront, availability, bookings, AND work all resolve
 *        creator_logins     → the middleware sends them into /creator on sign-in
 *
 * Both links point creator_id → the vendor UUID, which is exactly what work orders + payouts key off,
 * so the same login sees every creator surface. Idempotent: re-running with the same name/email reuses
 * the vendor and the login (never mints a second). person_id is one-shot — a vendor already claimed by
 * a DIFFERENT login is never silently re-pointed.
 *
 * The core is auth-free (service-role) so the gated admin action AND tests can share it; the admin gate
 * lives in the caller (onboardCreator in vendor-applications/actions.ts).
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type CreatorCraft = 'Photo' | 'Video' | 'Social' | 'Design'

export interface OnboardCreatorInput {
  name: string
  email: string
  craft: CreatorCraft
  /** Service areas (US state codes). Defaults to ['WA'] (the store is WA-only in v1). */
  serviceArea?: string[]
  description?: string
  /** Send a set-your-password invite when no login exists yet. Default true. False = link-only. */
  invite?: boolean
  /** An already-authenticated user id (self-serve signup): skip the find-by-email / invite entirely
   *  and link THIS login. When set, no email is ever sent. */
  personId?: string
  /** Whether the creator is bookable in the store right away. Default true (self-serve creators go
   *  live, verified=false, like the seeded pool). Pass false to require an admin to flip them live. */
  bookable?: boolean
}

export interface OnboardCreatorResult {
  ok: boolean
  error?: string
  vendorId?: string
  slug?: string
  /** True when a fresh invite email was sent (a new login); false when an existing login was linked. */
  invited?: boolean
  personId?: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const VALID_CRAFT: CreatorCraft[] = ['Photo', 'Video', 'Social', 'Design']

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'creator'
}

/** Look up an auth user id by email (supabase-js has no by-email lookup; scan pages — fine at this size). */
async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email)
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

export async function onboardCreatorCore(input: OnboardCreatorInput): Promise<OnboardCreatorResult> {
  const admin = createAdminClient()
  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()
  const craft = input.craft
  if (!name) return { ok: false, error: 'A name is required.' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'A valid email is required.' }
  if (!VALID_CRAFT.includes(craft)) return { ok: false, error: 'Pick a craft: Photo, Video, Social, or Design.' }
  const serviceArea = input.serviceArea && input.serviceArea.length ? input.serviceArea : ['WA']

  try {
    const bookable = input.bookable !== false

    // 1) Find-or-create the vendor (keyed by slug so a re-run reuses the same creator).
    const slug = slugify(name)
    let vendorId: string
    const { data: existingV } = await admin.from('vendors').select('id').eq('slug', slug).maybeSingle()
    if (existingV?.id) {
      vendorId = existingV.id as string
      await admin.from('vendors').update({
        name, craft, service_area: serviceArea, bookable, ...(input.description ? { description: input.description } : {}),
      }).eq('id', vendorId)
    } else {
      const { data: created, error: cErr } = await admin.from('vendors').insert({
        slug, name, vendor_type: 'individual', bookable, verified: false, tier: 'free',
        is_apnosh: false, service_area: serviceArea, craft, ...(input.description ? { description: input.description } : {}),
      }).select('id').single()
      if (cErr || !created) return { ok: false, error: `Could not create the creator: ${cErr?.message ?? 'unknown error'}` }
      vendorId = created.id as string
    }

    // 2) Resolve their login: a pre-authed user (self-serve signup), else an existing login by email,
    //    else a set-your-password invite.
    let personId = input.personId ?? null
    let invited = false
    if (!personId) {
      personId = await findUserIdByEmail(admin, email)
      if (!personId) {
        if (input.invite === false) return { ok: false, error: `No login exists for ${email}. Turn on the invite, or have them sign up first.`, vendorId, slug }
        const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name } })
        if (invErr || !inv?.user) return { ok: false, error: `Could not send the invite: ${invErr?.message ?? 'unknown error'}`, vendorId, slug }
        personId = inv.user.id
        invited = true
      }
    }

    // 3) Wire both links. person_id is one-shot: only claim an unclaimed vendor.
    const { data: claimed } = await admin.from('vendors').update({ person_id: personId }).eq('id', vendorId).is('person_id', null).select('id').maybeSingle()
    if (!claimed) {
      const { data: who } = await admin.from('vendors').select('person_id').eq('id', vendorId).maybeSingle()
      if (who?.person_id && who.person_id !== personId) {
        return { ok: false, error: 'This creator is already linked to a different login.', vendorId, slug }
      }
    }
    // creator_logins.person_id is the PK; upsert keeps a re-run idempotent. creator_id = the vendor uuid
    // (as text), matching how work orders + payouts key off it.
    const { error: clErr } = await admin.from('creator_logins').upsert({ person_id: personId, creator_id: vendorId }, { onConflict: 'person_id' })
    if (clErr) return { ok: false, error: `Linked the vendor but could not finish the login routing: ${clErr.message}`, vendorId, slug, personId, invited }

    return { ok: true, vendorId, slug, invited, personId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not onboard the creator.' }
  }
}
