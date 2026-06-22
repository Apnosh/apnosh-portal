import 'server-only'
/**
 * Resolve a real BusinessProfile (spec §2.4) for a client, replacing the mock
 * profiles.ts. Part 1 fills id/name/archetype/goalKey from live data; `has[]`
 * and `peerSpend` are deferred to Part 2 (Diagnose is budget-independent and
 * reads neither). Best-effort: every lookup degrades to a safe default so a
 * diagnosis can always run.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { BusinessProfile, GoalKey } from '@/lib/campaigns/types'
import type { Concept, GoalSlug } from '@/lib/goals/types'

/** Restaurant concept (clients.shape_concept, migration 092) → owner-facing label. */
const ARCHETYPE: Record<Concept, { archetype: string; icon: string }> = {
  qsr: { archetype: 'QSR / fast food', icon: '🍔' },
  fast_casual: { archetype: 'Fast-casual', icon: '🥡' },
  casual: { archetype: 'Casual dining', icon: '🍽️' },
  fine_dining: { archetype: 'Fine dining', icon: '🍷' },
  bar: { archetype: 'Bar / nightlife', icon: '🍸' },
  cafe: { archetype: 'Café / bakery', icon: '☕' },
  mobile: { archetype: 'Food truck / mobile', icon: '🚚' },
  delivery_only: { archetype: 'Delivery / ghost kitchen', icon: '🛵' },
  catering_heavy: { archetype: 'Catering', icon: '🍱' },
}

/** Reduce the 8 real GoalSlugs (client_goals) to the 4 campaign GoalKeys. */
const GOAL_KEY: Record<GoalSlug, GoalKey> = {
  more_foot_traffic: 'new-customers',
  regulars_more_often: 'regulars',
  more_online_orders: 'new-customers',
  more_reservations: 'new-customers',
  better_reputation: 'reviews',
  be_known_for: 'new-customers',
  fill_slow_times: 'slow-nights',
  grow_catering: 'new-customers',
}

const GOAL_LABEL: Record<GoalKey, string> = {
  'new-customers': 'Get more new customers',
  regulars: 'Turn visitors into regulars',
  'slow-nights': 'Fill the slow nights',
  reviews: 'Fix our reviews and rating',
}

export async function getBusinessProfile(clientId: string): Promise<BusinessProfile> {
  // createAdminClient throws when the service-role env is missing; never let that
  // bubble up (a diagnosis must always render) — degrade to a default profile.
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { id: clientId, name: 'Your restaurant', archetype: 'Restaurant', archetypeIcon: '🍽️', goal: GOAL_LABEL['new-customers'], goalKey: 'new-customers', has: [], peerSpend: 0 }
  }

  // name + concept. shape_concept exists on `clients` (migration 092) even though
  // the generated Client type doesn't surface it, so read + cast loosely.
  let name = 'Your restaurant'
  let concept: Concept | null = null
  try {
    const { data } = await admin.from('clients').select('name, shape_concept').eq('id', clientId).maybeSingle()
    const row = data as { name?: string | null; shape_concept?: string | null } | null
    if (row?.name) name = row.name
    if (row?.shape_concept && row.shape_concept in ARCHETYPE) concept = row.shape_concept as Concept
  } catch { /* keep defaults */ }

  // primary active goal → GoalKey
  let goalKey: GoalKey = 'new-customers'
  try {
    const { data } = await admin
      .from('client_goals')
      .select('goal_slug, priority, status')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .limit(1)
      .maybeSingle()
    const slug = (data as { goal_slug?: string } | null)?.goal_slug as GoalSlug | undefined
    if (slug && slug in GOAL_KEY) goalKey = GOAL_KEY[slug]
  } catch { /* keep default new-customers */ }

  const arch = concept ? ARCHETYPE[concept] : { archetype: 'Restaurant', icon: '🍽️' }

  return {
    id: clientId,
    name,
    archetype: arch.archetype,
    archetypeIcon: arch.icon,
    goal: GOAL_LABEL[goalKey],
    goalKey,
    has: [],        // Part 2: derive from platform_connections + services_active
    peerSpend: 0,   // Part 2: code-owned archetype benchmark (not read by Diagnose)
  }
}
