/**
 * POST /api/work/specialists
 *
 * Invite a new specialist. Uses Supabase admin.auth.admin.inviteUserByEmail
 * which creates the auth.users row and sends them a magic-link email to
 * set a password. We then ensure a profiles row exists (the trigger
 * usually creates it but we double-check), so the new specialist
 * appears in the directory right away.
 *
 * Capabilities are NOT set at invite time — staff sets them in the
 * editor after the row appears. This makes the invite step low-stakes
 * (you can invite first, decide their roles later).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'
import type { SpecialistRow } from '@/lib/work/get-specialists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Body {
  email: string
  fullName?: string | null
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await isCapable(['strategist', 'onboarder']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as Body | null
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'valid email required' }, { status: 400 })
  }

  const admin = createAdminClient()

  /* Two paths:
     - User doesn't exist → invite by email, send magic link
     - User exists → reuse them. We don't want to "invite" an existing
       admin/strategist who's already in the system; we just attach
       their profile fields to the specialist directory.
  */
  let userId: string | null = null
  const { data: existingByEmail } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existingByEmail?.id) {
    userId = existingByEmail.id as string
  } else {
    const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: body?.fullName ? { full_name: body.fullName } : undefined,
    })
    if (inviteErr || !invite?.user) {
      return NextResponse.json({ error: inviteErr?.message ?? 'invite failed' }, { status: 500 })
    }
    userId = invite.user.id
  }

  /* Make sure profile fields are populated for the directory. The
     handle_new_user trigger fills email + full_name from raw_user_meta_data,
     so we only nudge what's still empty. */
  if (body?.fullName) {
    await admin
      .from('profiles')
      .update({ full_name: body.fullName })
      .eq('id', userId)
      .eq('full_name', '')  // only overwrite if blank
  }

  /* Fetch the profile back so we can return a SpecialistRow shape. */
  const { data: prof } = await admin
    .from('profiles')
    .select('id, email, full_name, avatar_url, bio, portfolio_url, specialties, availability_status, last_seen_at')
    .eq('id', userId)
    .maybeSingle()

  const specialist: SpecialistRow = {
    personId: userId,
    email: (prof?.email as string) ?? email,
    displayName: (prof?.full_name as string) || body?.fullName || email,
    avatarUrl: (prof?.avatar_url as string) ?? null,
    bio: (prof?.bio as string) ?? null,
    portfolioUrl: (prof?.portfolio_url as string) ?? null,
    specialties: Array.isArray(prof?.specialties) ? (prof?.specialties as string[]) : [],
    availability: ((prof?.availability_status as string) ?? 'available') as SpecialistRow['availability'],
    capabilities: [],
    capabilityLabels: [],
    activeAssignments: 0,
    assignedClientNames: [],
    lastSeenAt: (prof?.last_seen_at as string) ?? null,
  }

  await admin.from('events').insert({
    event_type: 'specialist.invited',
    subject_type: 'profile',
    subject_id: userId,
    actor_id: user.id,
    actor_role: 'staff',
    summary: `Invited specialist ${email}`,
    payload: { full_name: body?.fullName ?? null, reused_existing: !!existingByEmail },
  })

  return NextResponse.json({ ok: true, specialist })
}
