/**
 * PATCH /api/work/specialists/[personId]
 *
 * Edit one specialist. Writes to two tables:
 *   - profiles: bio, portfolio_url, specialties, availability_status
 *   - person_capabilities: diff against the requested set
 *     (mark removed rows status='offboarded' rather than DELETE, so
 *      we preserve history)
 *
 * Staff-only. RLS on profiles permits the update via admin client.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

const VALID_AVAILABILITY = new Set(['available', 'limited', 'full'])
const VALID_CAPABILITIES = new Set([
  'strategist',
  'social_media_manager',
  'copywriter',
  'photographer',
  'videographer',
  'editor',
  'designer',
  'community_mgr',
  'ad_buyer',
  'seo_specialist',
  'influencer',
  'onboarder',
  'paid_media',
])

interface Body {
  bio?: string | null
  portfolioUrl?: string | null
  specialties?: string[]
  availability?: 'available' | 'limited' | 'full'
  capabilities?: string[]
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ personId: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await isCapable(['strategist', 'onboarder']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { personId } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const admin = createAdminClient()

  /* Profile patch — only fields we recognize. Empty string → null. */
  const profilePatch: Record<string, unknown> = {}
  if (body.bio !== undefined) profilePatch.bio = body.bio
  if (body.portfolioUrl !== undefined) profilePatch.portfolio_url = body.portfolioUrl
  if (Array.isArray(body.specialties)) {
    profilePatch.specialties = body.specialties.slice(0, 20).map(s => s.slice(0, 60))
  }
  if (body.availability) {
    if (!VALID_AVAILABILITY.has(body.availability)) {
      return NextResponse.json({ error: 'invalid availability' }, { status: 400 })
    }
    profilePatch.availability_status = body.availability
  }

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await admin.from('profiles').update(profilePatch).eq('id', personId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  /* Capability diff. We treat the request's `capabilities` array as
     the new active set. Anything currently active and absent gets
     offboarded; anything new gets inserted or reactivated. */
  if (Array.isArray(body.capabilities)) {
    const desired = new Set(body.capabilities.filter(c => VALID_CAPABILITIES.has(c)))

    const { data: current } = await admin
      .from('person_capabilities')
      .select('id, capability, status')
      .eq('person_id', personId)
    const currentMap = new Map<string, { id: string; status: string }>(
      (current ?? []).map(c => [c.capability as string, { id: c.id as string, status: c.status as string }]),
    )

    /* Activate or insert each desired capability. */
    for (const cap of desired) {
      const existing = currentMap.get(cap)
      if (existing) {
        if (existing.status !== 'active') {
          await admin.from('person_capabilities')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', existing.id)
        }
      } else {
        await admin.from('person_capabilities').insert({
          person_id: personId,
          capability: cap,
          status: 'active',
        })
      }
    }

    /* Offboard active rows that aren't in the desired set. */
    for (const [cap, existing] of currentMap) {
      if (desired.has(cap)) continue
      if (existing.status === 'active') {
        await admin.from('person_capabilities')
          .update({ status: 'offboarded', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
    }
  }

  await admin.from('events').insert({
    event_type: 'specialist.updated',
    subject_type: 'profile',
    subject_id: personId,
    actor_id: user.id,
    actor_role: 'staff',
    summary: 'Specialist profile / capabilities updated',
    payload: {
      profile_keys: Object.keys(profilePatch),
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : null,
    },
  })

  return NextResponse.json({ ok: true })
}
