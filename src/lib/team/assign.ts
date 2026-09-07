import 'server-only'
/**
 * team/assign — every client has a person, and it is written down.
 *
 * Until now the only row that ever named a person on an account was the one a staffer wrote
 * themselves by claiming a work order (api/admin/service-work-orders/[id]/route.ts). Nothing
 * assigned anybody at onboarding, so notifyStaffForClient found no role_assignments row for the
 * client and fell back to paging every admin (notifications.ts), and the owner's "people on your
 * work" row would have been empty exactly while work was running.
 *
 * ensureClientStrategist writes that missing row: one strategist per client, picked by a rule
 * anyone can re-run and get the same answer. Best-effort everywhere — a client whose strategist
 * could not be written still orders, ships and gets served, they just fall back to the admin pool
 * as they do today.
 */
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/**
 * The strategist who owns `clientId`, writing one if nobody does yet.
 *
 * Never re-picks: an existing active strategist assignment is a person's word about who is on
 * the account, not a cache we may recompute. Returns null (and warns) when there is nobody to
 * pick or the write failed, so every caller stays best-effort.
 */
export async function ensureClientStrategist(clientId: string): Promise<string | null> {
  if (!clientId) return null
  const admin = createAdminClient()
  try {
    const existing = await currentStrategist(admin, clientId)
    if (existing) return existing

    const personId = await pickStrategist(admin)
    if (!personId) {
      console.warn(`[team] no staff to own client ${clientId}; work stays unassigned`)
      return null
    }

    const row: Record<string, unknown> = {
      person_id: personId,
      client_id: clientId,
      role: 'strategist',
      scope: 'client',
      is_primary_contact: true,
      assigned_at: new Date().toISOString(),
      notes: 'Assigned automatically at onboarding so every order has a name on it.',
    }
    let { error } = await admin
      .from('role_assignments')
      .upsert(row, { onConflict: 'person_id,client_id,role', ignoreDuplicates: true })
    // Pre-125 the per-account contact columns are absent (42703): write the plain assignment
    // rather than no assignment at all.
    if (error && error.code === '42703') {
      delete row.is_primary_contact
      ;({ error } = await admin
        .from('role_assignments')
        .upsert(row, { onConflict: 'person_id,client_id,role', ignoreDuplicates: true }))
    }
    if (error) {
      // A race (two ships at once) loses to the unique index; re-read rather than claim nobody.
      console.warn('[team] strategist assign failed:', error.message)
      return await currentStrategist(admin, clientId)
    }
    return personId
  } catch (e) {
    console.warn('[team] ensureClientStrategist threw:', (e as Error)?.message)
    return null
  }
}

/** The active strategist on this client, or null. No write. */
export async function currentStrategist(admin: Admin, clientId: string): Promise<string | null> {
  const { data } = await admin
    .from('role_assignments')
    .select('person_id')
    .eq('client_id', clientId)
    .eq('role', 'strategist')
    .is('ended_at', null)
    .order('assigned_at', { ascending: true })
    .limit(1)
  return (data?.[0]?.person_id as string) ?? null
}

/**
 * THE RULE, so the answer is the same every time it is asked:
 *   1. the active strategist with the FEWEST clients right now,
 *   2. ties broken by the older account (profiles.created_at), then by id,
 *   3. and when nobody wears the strategist hat at all, the first admin —
 *      because an order with no name on it is the thing this move exists to end.
 */
async function pickStrategist(admin: Admin): Promise<string | null> {
  const { data: caps } = await admin
    .from('person_capabilities')
    .select('person_id')
    .eq('capability', 'strategist')
    .eq('status', 'active')
  const ids = [...new Set(((caps ?? []) as { person_id: string }[]).map((c) => c.person_id))]

  if (ids.length) {
    const { data: load } = await admin
      .from('role_assignments')
      .select('person_id, client_id')
      .eq('role', 'strategist')
      .is('ended_at', null)
      .not('client_id', 'is', null)
      .in('person_id', ids)
    const clients = new Map<string, number>(ids.map((i) => [i, 0]))
    for (const r of (load ?? []) as { person_id: string }[]) {
      clients.set(r.person_id, (clients.get(r.person_id) ?? 0) + 1)
    }
    return await leastLoaded(admin, ids, (id) => clients.get(id) ?? 0)
  }

  const { data: admins } = await admin
    .from('profiles')
    .select('id, created_at')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
  return ((admins ?? [])[0]?.id as string) ?? null
}

/** Fewest clients first, then the older account, then the id — a total order, so no coin flips. */
async function leastLoaded(admin: Admin, ids: string[], load: (id: string) => number): Promise<string | null> {
  const { data: profs } = await admin.from('profiles').select('id, created_at').in('id', ids)
  const born = new Map(((profs ?? []) as { id: string; created_at: string | null }[]).map((p) => [p.id, p.created_at ?? '']))
  const sorted = [...ids].sort(
    (a, b) =>
      load(a) - load(b) ||
      (born.get(a) ?? '').localeCompare(born.get(b) ?? '') ||
      a.localeCompare(b),
  )
  return sorted[0] ?? null
}
