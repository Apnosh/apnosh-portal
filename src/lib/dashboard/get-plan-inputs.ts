'use server'

/**
 * Read everything the monthly plan already knows about this client.
 *
 * The whole point is that the plan form should ASK almost nothing. Onboarding already captured the
 * goal, the budget, what they are known for, who they are for and which nights are slow; the
 * connection tables already know which channels are live; menu_items already knows the real dishes,
 * with is_featured flagging the ones worth leading with. This reader gathers all of it and, for
 * every field, records WHERE it came from, so plan-inputs.ts can tell a real answer apart from a
 * default and the form can show facts instead of a questionnaire.
 *
 * The `guessed` source matters most. getBusinessProfile().goalKey falls back to 'new-customers' when
 * a client has no goal row at all, so reading it alone cannot distinguish "they chose this" from
 * "nobody ever said". We check client_goals directly for that reason: no active row means guessed,
 * and the form asks instead of quietly planning around a default nobody picked.
 *
 * Every read is wrapped so one dead integration degrades a single field rather than the whole form.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import type { GoalKey } from '@/lib/campaigns/types'
import { known, missing, type PlanInputs, type ChannelState, type Input } from '@/lib/campaigns/data/plan-inputs'
import type { MonthlySignals } from '@/lib/campaigns/data/monthly-signals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as AdminDb
}

async function requireClientUser(): Promise<{ userId: string; clientId: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const db = adminDb()
  const { data: cu } = await db.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (!cu?.client_id) return null
  return { userId: user.id, clientId: cu.client_id as string }
}

/** client_goals.goal_slug -> the composer's GoalKey. Mirrors business-profile.ts's GOAL_KEY. */
const GOAL_KEY: Record<string, GoalKey> = {
  fill_slow_times: 'slow-nights',
  better_reputation: 'reviews',
  regulars_more_often: 'regulars',
}

/**
 * The channels a monthly plan can actually use, and what each costs the plan while it is off.
 * Only channels we can genuinely publish to are marked canPost — TikTok is deliberately absent
 * because src/lib/publish/tiktok.ts is a stub, and recommending it would be selling a hole.
 */
const CHANNELS: Omit<ChannelState, 'connected'>[] = [
  {
    key: 'google_business_profile',
    name: 'Google Business Profile',
    canPost: true,
    costOfMissing: 'This is where most people find a restaurant. Without it we cannot fix your listing or post to it, which is most of step 1.',
    href: '/dashboard/connected-accounts',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    canPost: true,
    costOfMissing: 'We can make the posts, but you would have to put them up yourself. Connected, we schedule and publish them for you.',
    href: '/dashboard/connected-accounts',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    canPost: true,
    costOfMissing: 'Same posts, one more place, no extra work. Without it they only run on the channels you have connected.',
    href: '/dashboard/connected-accounts',
  },
]

const arr = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length ? (v as string[]).map(String).filter(Boolean) : null

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Weekdays the owner marked slow during onboarding (businesses.slow_periods is {Mon:'slow',...}). */
function slowDaysFrom(v: unknown): string[] | null {
  if (!v || typeof v !== 'object') return null
  const days = Object.entries(v as Record<string, unknown>)
    .filter(([, state]) => String(state).toLowerCase() === 'slow')
    .map(([day]) => day)
  return days.length ? days : null
}

/**
 * The brain, consulted once for the monthly composer (Phase 1c: the one-brain consolidation).
 * Fails to SAFE, never to error: thin data, an unauthenticated caller, or any assembly failure
 * all return undefined, and the composer then behaves exactly as it did before signals existed.
 * Deliberately not folded into PlanInputs — that type is what the form shows and asks; this is
 * composer steering.
 */
export async function getMonthlySignals(): Promise<MonthlySignals | undefined> {
  try {
    const auth = await requireClientUser()
    if (!auth) return undefined
    const { assembleBrain } = await import('@/lib/campaigns/brain/assemble-signals')
    const { deriveMonthlySignals } = await import('@/lib/campaigns/brain/derive-monthly')
    const { signals } = await assembleBrain(auth.clientId)
    return deriveMonthlySignals(signals, new Date().toISOString())
  } catch {
    return undefined
  }
}

export async function getPlanInputs(): Promise<PlanInputs | null> {
  const auth = await requireClientUser()
  if (!auth) return null
  const db = adminDb()

  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch {
      return fallback
    }
  }

  const [biz, goalRow, channels, socials, menu] = await Promise.all([
    safe(async () => (await db.from('businesses').select('*').eq('owner_id', auth.userId).maybeSingle()).data, null),
    safe(
      async () =>
        (
          await db
            .from('client_goals')
            .select('goal_slug, priority')
            .eq('client_id', auth.clientId)
            .eq('status', 'active')
            .order('priority', { ascending: true })
            .limit(1)
            .maybeSingle()
        ).data,
      null,
    ),
    safe(
      async () =>
        (await db.from('channel_connections').select('channel').eq('client_id', auth.clientId).eq('status', 'active'))
          .data ?? [],
      [] as { channel: string }[],
    ),
    safe(
      async () =>
        (await db.from('social_connections').select('platform').eq('client_id', auth.clientId)).data ?? [],
      [] as { platform: string }[],
    ),
    safe(
      async () =>
        (
          await db
            .from('menu_items')
            .select('id, name, is_featured, display_order')
            .eq('client_id', auth.clientId)
            .eq('is_available', true)
            .order('is_featured', { ascending: false })
            .order('display_order', { ascending: true })
            .limit(60)
        ).data ?? [],
      [] as { id: string; name: string; is_featured: boolean; display_order: number }[],
    ),
  ])

  const b = (biz ?? {}) as Record<string, unknown>
  const live = new Set([
    ...channels.map((c) => String(c.channel)),
    ...socials.map((s) => String(s.platform)),
  ])

  const BIZ_INFO = '/dashboard/business-info'

  // Goal: only real when an active client_goals row exists. Otherwise we are standing in for an
  // answer nobody gave, and the form must ask rather than plan around it.
  const slug = str(goalRow?.goal_slug)
  const goal: Input<GoalKey> = slug
    ? known((GOAL_KEY[slug] ?? 'new-customers') as GoalKey, 'onboarding', undefined, '/dashboard/goals')
    : { value: 'new-customers', source: 'guessed', href: '/dashboard/goals' }

  const featured = menu.filter((m) => m.is_featured).map((m) => m.name)
  const signature = arr(b.signature_items)
  const knownFor = featured.length ? featured : signature
  const budget = typeof b.monthly_budget === 'number' && b.monthly_budget > 0 ? (b.monthly_budget as number) : null

  return {
    goal,
    goalWords: str(b.primary_goal)
      ? known(str(b.primary_goal)!, 'onboarding', str(b.primary_goal)!, '/dashboard/goals')
      : missing('/dashboard/goals'),
    budget: budget ? known(budget, 'onboarding', undefined, BIZ_INFO) : missing(BIZ_INFO),
    knownFor: knownFor
      ? known(knownFor, featured.length ? 'menu' : 'onboarding', undefined, BIZ_INFO + '/menu')
      : missing(BIZ_INFO + '/menu'),
    standsOut: str(b.differentiator) ? known(str(b.differentiator)!, 'onboarding', undefined, BIZ_INFO) : missing(BIZ_INFO),
    audience: arr(b.customer_types) ? known(arr(b.customer_types)!, 'onboarding', undefined, BIZ_INFO) : missing(BIZ_INFO),
    slowDays: slowDaysFrom(b.slow_periods)
      ? known(slowDaysFrom(b.slow_periods)!, 'onboarding', undefined, BIZ_INFO + '/hours')
      : missing(BIZ_INFO + '/hours'),
    channels: CHANNELS.map((c) => ({ ...c, connected: live.has(c.key) })),
    menu: menu.map((m) => ({ id: m.id, name: m.name, featured: !!m.is_featured })),
  }
}

/**
 * Start the plan for real: record what was agreed, create the campaign, hand it to the machinery.
 *
 * THE ORDER OF OPERATIONS IS THE POINT. An order that cannot be evidenced does not happen. If the
 * snapshot cannot be written, the campaign is rolled back and the owner is told, rather than left
 * with work started against a record nobody can produce later. That is the whole reason the snapshot
 * exists, so failing open would defeat it.
 *
 * Acceptance is checked against the CURRENT version server-side. A client that has been open in a
 * tab since before the terms changed cannot accept the old ones by replaying a stale constant.
 *
 * The client is resolved from the session, so a caller cannot create a campaign against a client
 * they do not own.
 */
export async function startMonthlyPlan(
  draft: Record<string, unknown>,
  accept: { agreementVersion: string; snapshot: Record<string, unknown> },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireClientUser()
  if (!auth) return { ok: false, error: 'Not signed in' }

  const { CLIENT_AGREEMENT_VERSION } = await import('@/lib/agreements/client-agreement')
  if (accept.agreementVersion !== CLIENT_AGREEMENT_VERSION) {
    return { ok: false, error: 'Our terms have been updated. Please review and accept them again.' }
  }

  const db = adminDb()
  let campaignId: string | null = null
  try {
    const { createCampaign } = await import('@/lib/campaigns/server')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    campaignId = await createCampaign(auth.clientId, auth.userId, draft as any)

    const snap = accept.snapshot as { lines?: unknown; bill?: unknown; inputs?: unknown; edits?: unknown }
    const { error } = await db.from('campaign_order_snapshots').insert({
      campaign_id: campaignId,
      client_id: auth.clientId,
      agreement_version: accept.agreementVersion,
      agreed_by: auth.userId,
      lines: snap.lines ?? [],
      bill: snap.bill ?? {},
      inputs: snap.inputs ?? null,
      edits: snap.edits ?? {},
    })
    if (error) throw new Error(error.message)

    return { ok: true, id: campaignId }
  } catch (e) {
    // Roll back rather than leave a campaign whose terms we cannot produce.
    if (campaignId) {
      try { await db.from('campaigns').delete().eq('id', campaignId) } catch { /* best effort */ }
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Could not start the plan' }
  }
}
