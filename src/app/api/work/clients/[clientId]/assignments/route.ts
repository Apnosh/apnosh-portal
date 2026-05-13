/**
 * GET  /api/work/clients/[clientId]/assignments
 *   Returns the universe of specialists the staffer can assign — same
 *   shape as the directory but without the people already on this team.
 *
 * POST /api/work/clients/[clientId]/assignments
 *   Creates a new role_assignments row. Body: { personId, role,
 *   isPrimaryContact? }. Idempotent: hitting it twice with the same
 *   (client, person, role) is a no-op thanks to the unique index.
 *
 * This is the bridge between /work/specialists (the directory) and
 * /work/clients/[id]/team (the per-client assignment list). Without
 * it, staff would have to write role_assignments via Supabase Studio.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'
import { ROLE_LABEL } from '@/lib/dashboard/team-labels'

export const dynamic = 'force-dynamic'

const VALID_ROLES = new Set([
  'admin', 'strategist', 'ad_buyer', 'community_mgr', 'editor',
  'copywriter', 'videographer', 'photographer', 'influencer',
  'social_media_manager', 'seo_specialist', 'designer',
  'onboarder', 'paid_media',
])

/* Marketplace-relevant capabilities — people we'd put on a client's
   team. Excludes client-side roles by design. */
const ASSIGNABLE_CAPABILITIES = [
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
]

interface AssignableCandidate {
  personId: string
  displayName: string
  email: string
  avatarUrl: string | null
  availability: 'available' | 'limited' | 'full'
  capabilities: string[]
  capabilityLabels: string[]
}

async function loadAndAuthorize(clientId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized', status: 401 as const }
  if (!(await isCapable(['strategist', 'onboarder', 'community_mgr']))) {
    return { error: 'forbidden', status: 403 as const }
  }
  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return { error: 'client not found', status: 404 as const }
  return { user }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params
  const auth = await loadAndAuthorize(clientId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()

  /* People already on this team — they shouldn't appear as
     candidates (the unique index would reject the insert anyway). */
  const { data: existing } = await admin
    .from('role_assignments')
    .select('person_id')
    .eq('client_id', clientId)
    .is('ended_at', null)
  const onTeam = new Set((existing ?? []).map(r => r.person_id as string))

  const { data: caps } = await admin
    .from('person_capabilities')
    .select('person_id, capability')
    .eq('status', 'active')
    .in('capability', ASSIGNABLE_CAPABILITIES)

  const byPerson = new Map<string, string[]>()
  for (const c of caps ?? []) {
    const pid = c.person_id as string
    if (onTeam.has(pid)) continue
    const arr = byPerson.get(pid) ?? []
    const cap = c.capability as string
    if (!arr.includes(cap)) arr.push(cap)
    byPerson.set(pid, arr)
  }
  const personIds = [...byPerson.keys()]
  if (personIds.length === 0) return NextResponse.json({ candidates: [] })

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name, avatar_url, availability_status')
    .in('id', personIds)

  const candidates: AssignableCandidate[] = (profiles ?? []).map(p => {
    const pid = p.id as string
    const caps = byPerson.get(pid) ?? []
    return {
      personId: pid,
      displayName: (p.full_name as string) || (p.email as string) || 'Specialist',
      email: (p.email as string) ?? '',
      avatarUrl: (p.avatar_url as string) ?? null,
      availability: ((p.availability_status as string) ?? 'available') as AssignableCandidate['availability'],
      capabilities: caps,
      capabilityLabels: caps.map(c => ROLE_LABEL[c] ?? c),
    }
  })

  candidates.sort((a, b) => {
    const r = { available: 0, limited: 1, full: 2 }
    const ar = r[a.availability] - r[b.availability]
    if (ar !== 0) return ar
    return a.displayName.localeCompare(b.displayName)
  })

  return NextResponse.json({ candidates })
}

interface PostBody {
  personId: string
  role: string
  isPrimaryContact?: boolean
  notes?: string | null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params
  const auth = await loadAndAuthorize(clientId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => null)) as PostBody | null
  if (!body?.personId || !body?.role) {
    return NextResponse.json({ error: 'personId and role required' }, { status: 400 })
  }
  if (!VALID_ROLES.has(body.role)) {
    return NextResponse.json({ error: `unknown role: ${body.role}` }, { status: 400 })
  }

  const admin = createAdminClient()

  /* If marking as primary, demote any existing primary on the same
     (client, role) first — the partial unique index would otherwise
     reject the insert. */
  if (body.isPrimaryContact) {
    await admin
      .from('role_assignments')
      .update({ is_primary_contact: false })
      .eq('client_id', clientId)
      .eq('role', body.role)
      .is('ended_at', null)
  }

  const { data: assignment, error } = await admin
    .from('role_assignments')
    .insert({
      person_id: body.personId,
      client_id: clientId,
      role: body.role,
      scope: 'client',
      assigned_by: auth.user.id,
      is_primary_contact: !!body.isPrimaryContact,
      notes: body.notes ?? null,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await admin.from('events').insert({
    client_id: clientId,
    event_type: 'team.specialist_assigned',
    subject_type: 'role_assignment',
    subject_id: assignment?.id ?? null,
    actor_id: auth.user.id,
    actor_role: 'staff',
    summary: `Assigned ${ROLE_LABEL[body.role] ?? body.role}`,
    payload: { person_id: body.personId, role: body.role, is_primary_contact: !!body.isPrimaryContact },
  })

  return NextResponse.json({ ok: true, assignmentId: assignment?.id ?? null })
}
