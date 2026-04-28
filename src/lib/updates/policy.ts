/**
 * Update policy framework.
 *
 * Single source of truth for "what kind of changes can be made, who can
 * make them, and where do they go" -- consistent across every client.
 *
 * Three matrices:
 *   1. DEFAULT_TARGETS  -- where each update type fans out to by default
 *      (already in ./types.ts; re-exported for completeness)
 *   2. PERMISSION_MATRIX -- who is allowed to publish each type directly,
 *      who can self-serve, and what falls back to a change-request
 *   3. Channel availability -- given a client_id, which fanout targets
 *      are actually connected and worth dispatching to
 *
 * Adding a new client requires zero policy changes. Adding a new client
 * tier or update type requires changes here only.
 */

import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import type { UpdateType, FanoutTarget } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

// ─── Permission matrix ────────────────────────────────────────────

export type Actor = 'admin' | 'client' | 'ai_operator'
export type Permission = 'direct' | 'request' | 'propose' | 'denied'

/**
 * For each update type x actor, what's the action mode?
 *
 *  direct   -- publishes immediately, fans out to platforms
 *  request  -- creates a change request for AM to handle (no direct write)
 *  propose  -- lands in proposed_actions queue, human approves before fanout
 *  denied   -- not allowed at all
 *
 * Decision criteria (per user policy 2026-04-28):
 *  - Factual updates (hours, prices, closures, dates) -> client direct
 *  - Marketing announcements (promotions, events) -> client direct (no AM review)
 *  - Design judgment (assets, layout, brand) -> request only
 *  - Account-level info (phone, social URLs) -> request only (breakable if wrong)
 *  - AI: never publishes; always proposes for human approval
 */
export const PERMISSION_MATRIX: Record<UpdateType | 'social_post', Record<Actor, Permission>> = {
  hours:      { admin: 'direct', client: 'direct',  ai_operator: 'propose' },
  closure:    { admin: 'direct', client: 'direct',  ai_operator: 'propose' },
  menu_item:  { admin: 'direct', client: 'direct',  ai_operator: 'propose' },
  promotion:  { admin: 'direct', client: 'direct',  ai_operator: 'propose' },
  event:      { admin: 'direct', client: 'direct',  ai_operator: 'propose' },
  info:       { admin: 'direct', client: 'request', ai_operator: 'propose' },
  asset:      { admin: 'direct', client: 'request', ai_operator: 'propose' },
  social_post:{ admin: 'direct', client: 'denied',  ai_operator: 'propose' },
}

export function getPermission(type: UpdateType | 'social_post', actor: Actor): Permission {
  return PERMISSION_MATRIX[type]?.[actor] ?? 'denied'
}

/**
 * What types the client UI should expose as inline-editable.
 * Anything else routes through the change-request flow.
 */
export function clientSelfServeTypes(): UpdateType[] {
  return (Object.keys(PERMISSION_MATRIX) as Array<UpdateType | 'social_post'>)
    .filter(t => PERMISSION_MATRIX[t].client === 'direct')
    .filter((t): t is UpdateType => t !== 'social_post')
}

// ─── Channel availability ─────────────────────────────────────────

/**
 * Given a client_id, return the set of fanout targets that are actually
 * connected. The fanout dispatcher uses this to skip channels that won't
 * deliver anyway.
 *
 * - gbp:       at least one assigned gbp_location
 * - website:   site_type != 'none' AND is_published
 * - yelp:      platform_connections has 'yelp' entry (future)
 * - facebook:  platform_connections has 'facebook' entry
 * - instagram: platform_connections has 'instagram' entry
 * - email:     (future) email provider connected
 * - sms:       (future) sms provider connected
 * - pos:       (future) pos integration
 */
export async function getConnectedTargets(clientId: string): Promise<Set<FanoutTarget>> {
  const db = adminDb()
  const connected = new Set<FanoutTarget>()

  // GBP: any assigned location
  const { data: locs } = await db
    .from('gbp_locations')
    .select('id', { count: 'exact', head: false })
    .eq('client_id', clientId)
    .eq('status', 'assigned')
    .limit(1)
  if ((locs?.length ?? 0) > 0) connected.add('gbp')

  // Website: site_settings published with a backend
  const { data: site } = await db
    .from('site_settings')
    .select('site_type, is_published, external_site_url')
    .eq('client_id', clientId)
    .maybeSingle()
  if (
    site &&
    (site.site_type as string) !== 'none' &&
    (site.is_published || (site.site_type as string) === 'external_repo')
  ) {
    connected.add('website')
  }

  // Social: platform_connections rows
  const { data: socials } = await db
    .from('platform_connections')
    .select('platform')
    .eq('business_id', clientId)
  for (const s of socials ?? []) {
    const p = (s.platform as string)?.toLowerCase()
    if (p === 'instagram') connected.add('instagram')
    else if (p === 'facebook') connected.add('facebook')
    else if (p === 'yelp') connected.add('yelp')
  }

  // Email/SMS/POS: not yet implemented; leave out so they're skipped

  return connected
}

/**
 * Filter a list of requested fanout targets down to those actually connected.
 * Returns { keep, dropped } so callers can record skip-with-reason in fanout rows.
 */
export async function filterConnectedTargets(
  clientId: string,
  requested: FanoutTarget[],
): Promise<{ keep: FanoutTarget[]; dropped: FanoutTarget[] }> {
  const connected = await getConnectedTargets(clientId)
  const keep: FanoutTarget[] = []
  const dropped: FanoutTarget[] = []
  for (const t of requested) {
    if (connected.has(t)) keep.push(t)
    else dropped.push(t)
  }
  return { keep, dropped }
}
