/**
 * Proactive suggestion engine.
 *
 * Walks every active client, runs a set of "interesting event"
 * detectors, and writes a notification (into the existing
 * `notifications` table) the owner sees on next dashboard visit.
 *
 * Each suggestion is owner-facing, actionable, and links into the
 * agent chat with a specific prompt the agent can act on. The intent
 * is that 100 owners can self-serve well because the AI is
 * pre-loading the most useful next action for them.
 *
 * Idempotency: each suggestion has a deterministic "fingerprint"
 * (clientId + suggestion key + a context bucket like the
 * yyyy-mm-dd of the underlying event). We skip writing if an
 * unread notification with that fingerprint already exists, so the
 * owner doesn't get spammed with the same nudge daily.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface SuggestionWrite {
  clientId: string
  /** Stable key for de-dup (e.g. "unresponded_reviews:2026-05-15"). */
  fingerprint: string
  type: string                  // e.g. "agent_suggestion"
  title: string                 // short headline
  body: string                  // 1-2 sentence body
  link?: string                 // where in the portal it leads
  payload?: Record<string, unknown>
}

export interface RunReport {
  clientsScanned: number
  suggestionsWritten: number
  suggestionsSkippedAsDuplicate: number
  errors: Array<{ clientId: string; message: string }>
}

/* Cron schedule for this run. Set by the cron route (`/api/cron/agent-proactive`)
   so we can filter clients to those whose tier opts in at this cadence.
   - 'weekly' (default): includes Strategist + Strategist+ tiers
   - 'daily': includes only Strategist+ tier (it's the tier that pays for daily) */
export type ProactiveCadence = 'weekly' | 'daily'

export async function runProactiveSuggestions(
  opts: { cadence?: ProactiveCadence } = {},
): Promise<RunReport> {
  const cadence: ProactiveCadence = opts.cadence ?? 'weekly'
  const admin = createAdminClient()

  /* Tier gate: Assistant tier doesn't get proactive runs at all.
     Strategist gets weekly only. Strategist+ gets both weekly + daily
     (the weekly run produces standard insights; daily picks up faster-
     moving signals like overnight review spikes). */
  const eligibleTiers = cadence === 'daily'
    ? ['pro']                       // Strategist+ only
    : ['standard', 'pro']           // Strategist + Strategist+
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, tier')
    .neq('status', 'churned')
    .in('tier', eligibleTiers)
    .order('created_at', { ascending: true })

  const report: RunReport = {
    clientsScanned: (clients ?? []).length,
    suggestionsWritten: 0,
    suggestionsSkippedAsDuplicate: 0,
    errors: [],
  }

  for (const c of (clients ?? []) as Array<{ id: string; name: string; tier: string }>) {
    try {
      const suggestions = await detectForClient(c.id)
      for (const s of suggestions) {
        const wrote = await persistSuggestion(s)
        if (wrote) report.suggestionsWritten += 1
        else report.suggestionsSkippedAsDuplicate += 1
      }
    } catch (err) {
      report.errors.push({ clientId: c.id, message: (err as Error).message })
    }
  }
  return report
}

// ─── Detectors (run per client) ───────────────────────────────────

async function detectForClient(clientId: string): Promise<SuggestionWrite[]> {
  const out: SuggestionWrite[] = []
  for (const detector of DETECTORS) {
    try {
      const result = await detector(clientId)
      out.push(...result)
    } catch (err) {
      console.error(`[proactive] detector failed for ${clientId}:`, (err as Error).message)
    }
  }
  return out
}

const DETECTORS: Array<(clientId: string) => Promise<SuggestionWrite[]>> = [
  detectUnrespondedReviews,
  detectFeaturedItemsMissingPhoto,
  detectStaleGbpPosts,
  detectReviewRatingDrop,
  detectOpenQueueItems,
]

/* Suggest: "X reviews need a response" */
async function detectUnrespondedReviews(clientId: string): Promise<SuggestionWrite[]> {
  const admin = createAdminClient()
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 30)
  const { data } = await admin
    .from('reviews')
    .select('id, rating, posted_at')
    .eq('client_id', clientId)
    .is('response_text', null)
    .gte('posted_at', since.toISOString())
  const rows = (data ?? []) as Array<{ id: string; rating: number | null; posted_at: string | null }>
  if (rows.length === 0) return []

  const lowRating = rows.filter(r => (r.rating ?? 5) <= 3).length
  const isUrgent = lowRating > 0
  const today = isoDate(new Date())

  return [{
    clientId,
    fingerprint: `unresponded_reviews:${today}`,
    type: 'agent_suggestion',
    title: isUrgent
      ? `${rows.length} review${rows.length === 1 ? '' : 's'} need a response — ${lowRating} low-rating`
      : `${rows.length} new review${rows.length === 1 ? '' : 's'} unresponded`,
    body: isUrgent
      ? `Apnosh AI can draft responses for you in the agent chat. Low-rating reviews especially benefit from a fast, thoughtful reply.`
      : `Drafted replies are one click away in the agent chat -- "draft me a response to my latest review".`,
    link: '/dashboard/local-seo/reviews',
    payload: {
      review_count: rows.length,
      low_rating_count: lowRating,
      action_prompt: 'Draft responses to my unresponded reviews',
    },
  }]
}

/* Suggest: "Your featured menu items don't have photos" */
async function detectFeaturedItemsMissingPhoto(clientId: string): Promise<SuggestionWrite[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('menu_items')
    .select('id, name, photo_url')
    .eq('client_id', clientId)
    .eq('is_featured', true)
    .is('photo_url', null)
  const rows = (data ?? []) as Array<{ id: string; name: string; photo_url: string | null }>
  if (rows.length === 0) return []

  const today = isoDate(new Date())
  const names = rows.slice(0, 3).map(r => r.name).join(', ')
  return [{
    clientId,
    fingerprint: `featured_no_photo:${today}`,
    type: 'agent_suggestion',
    title: `${rows.length} signature dish${rows.length === 1 ? '' : 'es'} missing photos`,
    body: `${names}${rows.length > 3 ? `, +${rows.length - 3} more` : ''} are flagged signature but have no photo. Photos drive 2-3x more menu clicks on Google.`,
    link: '/dashboard/website/manage',
    payload: {
      item_count: rows.length,
      item_ids: rows.map(r => r.id),
      action_prompt: 'Help me add photos to my featured menu items',
    },
  }]
}

/* Suggest: "It's been N days since your last GBP post" */
async function detectStaleGbpPosts(clientId: string): Promise<SuggestionWrite[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('client_updates')
    .select('created_at')
    .eq('client_id', clientId)
    .in('type', ['promotion', 'event'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data) {
    const lastPost = new Date(data.created_at as string)
    const daysSince = Math.floor((Date.now() - lastPost.getTime()) / 86_400_000)
    if (daysSince < 14) return []
    const today = isoDate(new Date())
    return [{
      clientId,
      fingerprint: `stale_gbp:${today}`,
      type: 'agent_suggestion',
      title: `It's been ${daysSince} days since your last Google post`,
      body: `Posts boost local search ranking + drive direct customer actions. Apnosh AI can draft 3 ideas tailored to your menu in seconds.`,
      link: '/dashboard/local-seo',
      payload: {
        days_since_last_post: daysSince,
        action_prompt: 'Generate 3 Google post ideas I could publish today',
      },
    }]
  }
  /* Never posted at all? Different message. */
  const today = isoDate(new Date())
  return [{
    clientId,
    fingerprint: `never_posted_gbp:${today}`,
    type: 'agent_suggestion',
    title: `You haven't posted to Google Business Profile yet`,
    body: `Restaurants that post weekly see 2-3x more direction requests. Apnosh AI can generate post ideas grounded in your actual menu.`,
    link: '/dashboard/local-seo',
    payload: {
      action_prompt: 'Generate 3 Google post ideas to get me started',
    },
  }]
}

/* Suggest: review rating dropped this week vs prior week */
async function detectReviewRatingDrop(clientId: string): Promise<SuggestionWrite[]> {
  const admin = createAdminClient()
  const now = new Date()
  const weekAgo = new Date(now); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 14)

  const [thisRes, prevRes] = await Promise.all([
    admin.from('reviews').select('rating').eq('client_id', clientId).gte('posted_at', weekAgo.toISOString()),
    admin.from('reviews').select('rating').eq('client_id', clientId).gte('posted_at', twoWeeksAgo.toISOString()).lt('posted_at', weekAgo.toISOString()),
  ])
  const avg = (rows: Array<{ rating: number | null }>) => {
    const r = rows.filter(x => x.rating != null).map(x => x.rating!)
    return r.length > 0 ? r.reduce((a, b) => a + b, 0) / r.length : null
  }
  const thisAvg = avg((thisRes.data ?? []) as Array<{ rating: number | null }>)
  const prevAvg = avg((prevRes.data ?? []) as Array<{ rating: number | null }>)
  if (thisAvg == null || prevAvg == null) return []
  const drop = prevAvg - thisAvg
  if (drop < 0.3) return []  // only flag meaningful drops

  const today = isoDate(new Date())
  return [{
    clientId,
    fingerprint: `rating_drop:${today}`,
    type: 'agent_suggestion',
    title: `Your review rating dropped this week (${prevAvg.toFixed(1)}★ → ${thisAvg.toFixed(1)}★)`,
    body: `Drafted responses to recent low ratings + a Google post acknowledging the feedback can rebuild trust fast.`,
    link: '/dashboard/local-seo/reviews',
    payload: {
      prev_avg: Number(prevAvg.toFixed(2)),
      this_avg: Number(thisAvg.toFixed(2)),
      action_prompt: 'Help me respond to recent low-rating reviews',
    },
  }]
}

/* Suggest: open queue items the owner should look at */
async function detectOpenQueueItems(clientId: string): Promise<SuggestionWrite[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('content_queue')
    .select('id, status, drafts')
    .eq('client_id', clientId)
    .in('status', ['drafting', 'in_review'])
  const rows = (data ?? []) as Array<{ id: string; status: string; drafts: unknown[] | null }>
  const inReview = rows.filter(r => r.status === 'in_review')
  if (inReview.length === 0) return []

  const today = isoDate(new Date())
  return [{
    clientId,
    fingerprint: `queue_ready:${today}`,
    type: 'agent_suggestion',
    title: `${inReview.length} item${inReview.length === 1 ? '' : 's'} ready for your review`,
    body: `Your AM has drafts waiting for you to approve or revise. Review them to keep the pipeline moving.`,
    link: '/dashboard/approvals',
    payload: {
      ready_count: inReview.length,
    },
  }]
}

// ─── Persistence ──────────────────────────────────────────────────

async function persistSuggestion(s: SuggestionWrite): Promise<boolean> {
  const admin = createAdminClient()

  /* Resolve owner user_id(s) for this client. Look at both
     paths: businesses.owner_id (legacy dashboard) and client_users
     (new portal). Send the same notification to all of them. */
  const userIds = new Set<string>()
  const [{ data: biz }, { data: cu }] = await Promise.all([
    admin.from('businesses').select('owner_id').eq('client_id', s.clientId),
    admin.from('client_users').select('auth_user_id').eq('client_id', s.clientId),
  ])
  for (const b of (biz ?? []) as Array<{ owner_id: string | null }>) {
    if (b.owner_id) userIds.add(b.owner_id)
  }
  for (const u of (cu ?? []) as Array<{ auth_user_id: string | null }>) {
    if (u.auth_user_id) userIds.add(u.auth_user_id)
  }
  if (userIds.size === 0) return false  // no one to notify

  /* De-dup: skip if any user already has an unread notification with
     the same fingerprint payload for this client. */
  const { data: existing } = await admin
    .from('notifications')
    .select('id')
    .eq('client_id', s.clientId)
    .eq('type', s.type)
    .is('read_at', null)
    .contains('payload', { fingerprint: s.fingerprint })
    .limit(1)
  if ((existing ?? []).length > 0) return false

  /* Insert one row per user. */
  const rows = Array.from(userIds).map(uid => ({
    user_id: uid,
    client_id: s.clientId,
    type: s.type,
    title: s.title,
    body: s.body,
    link: s.link ?? null,
    payload: { ...s.payload, fingerprint: s.fingerprint },
  }))
  const { error } = await admin.from('notifications').insert(rows)
  if (error) {
    console.error('[proactive] insert failed:', error.message)
    return false
  }
  return true
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
