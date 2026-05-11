/**
 * /api/admin/strategists
 *
 * GET  — list every active strategist + their assigned-client counts.
 * POST — invite a strategist by email and assign them a book of
 *         clients. Idempotent on email + client pair.
 *
 * Admin-only. Uses the service-role client to bypass RLS for the
 * cross-cutting writes (person_capabilities + role_assignments + auth
 * invite). The RLS policies from migration 101/104 keep ordinary
 * users contained, but admin scripts need to write outside their own
 * scope, hence the admin client here.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, body: { error: 'unauthorized' } as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') return { ok: false, status: 403, body: { error: 'forbidden' } as const }
  return { ok: true as const, userId: user.id }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const admin = createAdminClient()

  const { data: caps } = await admin
    .from('person_capabilities')
    .select('person_id, status, metadata, created_at')
    .eq('capability', 'strategist')

  if (!caps || caps.length === 0) return NextResponse.json({ strategists: [] })

  const personIds = caps.map(c => c.person_id as string)

  // Get user emails via the auth schema (requires service role).
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 500 })
  const userById = new Map((users?.users ?? []).map(u => [u.id, u]))

  const { data: assignments } = await admin
    .from('role_assignments')
    .select('person_id, client_id, ended_at')
    .eq('role', 'strategist')
    .is('ended_at', null)
    .in('person_id', personIds)

  const counts = new Map<string, number>()
  for (const a of assignments ?? []) {
    counts.set(a.person_id as string, (counts.get(a.person_id as string) ?? 0) + 1)
  }

  return NextResponse.json({
    strategists: caps.map(c => ({
      personId: c.person_id,
      email: userById.get(c.person_id as string)?.email ?? null,
      status: c.status,
      assignedClients: counts.get(c.person_id as string) ?? 0,
      createdAt: c.created_at,
    })),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const body = await req.json().catch(() => null) as
    | { email?: string; clientIds?: string[]; sendInvite?: boolean }
    | null

  const email = body?.email?.trim().toLowerCase()
  const clientIds = Array.isArray(body?.clientIds) ? body.clientIds : []
  const sendInvite = body?.sendInvite !== false  // default true

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const admin = createAdminClient()

  // 1) Find or invite the user.
  let personId: string | null = null
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 })
  const match = existing?.users.find(u => u.email?.toLowerCase() === email)
  if (match) {
    personId = match.id
  } else if (sendInvite) {
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email)
    if (invErr || !invited?.user) {
      return NextResponse.json({ error: 'invite failed', detail: invErr?.message }, { status: 500 })
    }
    personId = invited.user.id
  } else {
    return NextResponse.json({ error: 'user not found and sendInvite is false' }, { status: 404 })
  }

  // 2) Insert person_capabilities (idempotent).
  await admin
    .from('person_capabilities')
    .upsert(
      { person_id: personId, capability: 'strategist', status: 'active' },
      { onConflict: 'person_id,capability' }
    )

  // 3) Insert role_assignments for each client (idempotent).
  if (clientIds.length > 0) {
    const rows = clientIds.map(cid => ({
      person_id: personId!,
      client_id: cid,
      role: 'strategist',
      scope: 'client',
      assigned_by: gate.userId,
    }))
    await admin
      .from('role_assignments')
      .upsert(rows, { onConflict: 'person_id,client_id,role' })
  }

  return NextResponse.json({ ok: true, personId, assignedClients: clientIds.length })
}
