/**
 * /api/admin/team
 *
 * Multi-role team management. Replaces /api/admin/strategists, which
 * was strategist-only. Same patterns:
 *
 *   GET    — list every active capability holder across all 17 roles
 *   POST   — invite (or upgrade) a person and grant them one or more
 *            capabilities. Optionally assign clients per role.
 *   DELETE — offboard a single capability (?personId=...&capability=...&hard=0|1)
 *
 * Admin-only. Uses the service-role client for cross-cutting writes
 * (person_capabilities + role_assignments + auth invite).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Roles that scope to a specific client (need role_assignments rows
// with a non-null client_id). Other roles are agency-wide.
const CLIENT_SCOPED: ReadonlySet<string> = new Set([
  'strategist','community_mgr','local_seo','paid_media',
  'web_ops','onboarder',
])

type AdminGate =
  | { ok: false; status: number; body: { error: string } }
  | { ok: true; userId: string }

async function requireAdmin(): Promise<AdminGate> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.id) return { ok: false, status: 401, body: { error: 'unauthorized' } }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') return { ok: false, status: 403, body: { error: 'forbidden' } }
  return { ok: true, userId: user.id }
}

interface TeamMemberRow {
  personId: string
  email: string | null
  displayName: string | null
  capabilities: Array<{
    capability: string
    status: string
    assignedClients: number
  }>
  createdAt: string
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const admin = createAdminClient()

  const { data: caps } = await admin
    .from('person_capabilities')
    .select('person_id, capability, status, created_at')
    .order('created_at', { ascending: false })

  if (!caps || caps.length === 0) return NextResponse.json({ team: [] })

  const personIds = Array.from(new Set(caps.map(c => c.person_id as string)))

  const [{ data: users }, { data: assignments }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 500 }),
    admin
      .from('role_assignments')
      .select('person_id, role, client_id, ended_at')
      .in('person_id', personIds)
      .is('ended_at', null),
  ])

  const userById = new Map((users?.users ?? []).map(u => [u.id, u]))
  const assignmentCounts = new Map<string, number>()  // key: `${personId}|${role}`
  for (const a of assignments ?? []) {
    if (a.client_id == null) continue
    const k = `${a.person_id}|${a.role}`
    assignmentCounts.set(k, (assignmentCounts.get(k) ?? 0) + 1)
  }

  // Group capabilities by person.
  const byPerson = new Map<string, TeamMemberRow>()
  for (const c of caps) {
    const pid = c.person_id as string
    const u = userById.get(pid)
    if (!byPerson.has(pid)) {
      byPerson.set(pid, {
        personId: pid,
        email: u?.email ?? null,
        displayName: (u?.user_metadata?.full_name as string) ?? null,
        capabilities: [],
        createdAt: c.created_at as string,
      })
    }
    byPerson.get(pid)!.capabilities.push({
      capability: c.capability as string,
      status: c.status as string,
      assignedClients: assignmentCounts.get(`${pid}|${c.capability}`) ?? 0,
    })
  }

  return NextResponse.json({ team: Array.from(byPerson.values()) })
}

interface InviteRequest {
  email?: string
  displayName?: string
  capabilities?: string[]
  clientIds?: string[]      // applied to each client-scoped capability
  sendInvite?: boolean
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })
  const requesterId: string = gate.userId

  const body = await req.json().catch(() => null) as InviteRequest | null
  const email = body?.email?.trim().toLowerCase()
  const capabilities = Array.isArray(body?.capabilities)
    ? (body.capabilities as string[]).filter(Boolean)
    : []
  const clientIds = Array.isArray(body?.clientIds) ? body.clientIds : []
  const sendInvite = body?.sendInvite !== false
  const displayName = body?.displayName?.trim() ?? null

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  if (capabilities.length === 0) return NextResponse.json({ error: 'at least one capability required' }, { status: 400 })

  const admin = createAdminClient()

  // 1) Find or invite the user.
  let personId: string | null = null
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 })
  const match = existing?.users.find(u => u.email?.toLowerCase() === email)
  if (match) {
    personId = match.id
    if (displayName) {
      await admin.auth.admin.updateUserById(personId, {
        user_metadata: { ...(match.user_metadata ?? {}), full_name: displayName },
      })
    }
  } else if (sendInvite) {
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(
      email,
      displayName ? { data: { full_name: displayName } } : undefined,
    )
    if (invErr || !invited?.user) {
      return NextResponse.json({ error: 'invite failed', detail: invErr?.message }, { status: 500 })
    }
    personId = invited.user.id
  } else {
    return NextResponse.json({ error: 'user not found and sendInvite=false' }, { status: 404 })
  }

  // At this point personId must be set (the if/else above either set
  // it or returned). Narrow for TypeScript.
  if (!personId) return NextResponse.json({ error: 'unexpected: no person id' }, { status: 500 })
  const pid: string = personId

  // 2) Upsert each capability.
  for (const cap of capabilities) {
    await admin
      .from('person_capabilities')
      .upsert(
        { person_id: pid, capability: cap, status: 'active' },
        { onConflict: 'person_id,capability' },
      )
  }

  // 3) Assign clients per client-scoped capability.
  if (clientIds.length > 0) {
    const rows: Array<{ person_id: string; client_id: string; role: string; scope: string; assigned_by: string }> = []
    for (const cap of capabilities) {
      if (!CLIENT_SCOPED.has(cap)) continue
      for (const cid of clientIds) {
        rows.push({
          person_id: pid,
          client_id: cid,
          role: cap,
          scope: 'client',
          assigned_by: requesterId,
        })
      }
    }
    // Agency-wide capability still gets a global role_assignment row.
    for (const cap of capabilities) {
      if (CLIENT_SCOPED.has(cap)) continue
      rows.push({
        person_id: pid,
        client_id: null as unknown as string,
        role: cap,
        scope: 'global',
        assigned_by: requesterId,
      })
    }
    if (rows.length > 0) {
      await admin
        .from('role_assignments')
        .upsert(rows, { onConflict: 'person_id,client_id,role' })
    }
  } else {
    // No clients given: still create global assignments for agency-wide roles.
    const rows = capabilities
      .filter(cap => !CLIENT_SCOPED.has(cap))
      .map(cap => ({
        person_id: pid,
        client_id: null as unknown as string,
        role: cap,
        scope: 'global',
        assigned_by: requesterId,
      }))
    if (rows.length > 0) {
      await admin
        .from('role_assignments')
        .upsert(rows, { onConflict: 'person_id,client_id,role' })
    }
  }

  return NextResponse.json({
    ok: true,
    personId,
    capabilitiesGranted: capabilities,
    clientsAssigned: clientIds.length,
  })
}

/**
 * DELETE /api/admin/team?personId=...&capability=...&hard=0|1
 *
 * Removes ONE capability from a person. Default: offboard (status=offboarded,
 * role_assignments.ended_at=now). hard=1 deletes the rows entirely.
 *
 * To remove the person entirely, call this for each of their capabilities.
 */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const personId = req.nextUrl.searchParams.get('personId')
  const capability = req.nextUrl.searchParams.get('capability')
  const hard = req.nextUrl.searchParams.get('hard') === '1'
  if (!personId || !capability) {
    return NextResponse.json({ error: 'personId and capability required' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (hard) {
    await admin
      .from('role_assignments')
      .delete()
      .eq('person_id', personId)
      .eq('role', capability)
    await admin
      .from('person_capabilities')
      .delete()
      .eq('person_id', personId)
      .eq('capability', capability)
  } else {
    await admin
      .from('role_assignments')
      .update({ ended_at: new Date().toISOString() })
      .eq('person_id', personId)
      .eq('role', capability)
      .is('ended_at', null)
    await admin
      .from('person_capabilities')
      .update({ status: 'offboarded' })
      .eq('person_id', personId)
      .eq('capability', capability)
  }

  return NextResponse.json({ ok: true })
}
