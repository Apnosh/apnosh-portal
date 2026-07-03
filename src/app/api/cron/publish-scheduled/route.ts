/**
 * Vercel Cron: publish any draft whose scheduled_for has elapsed.
 *
 * Runs every 5 minutes (see vercel.json). Finds drafts where
 *   status='scheduled' AND scheduled_for <= now()
 * and calls attemptPublish on each. On success, status flips to
 * 'published' and the per-platform receipt is captured.
 *
 * Idempotency: we atomically claim a draft by NULL-ing scheduled_for
 * (only one concurrent caller flips it from non-null to null). On
 * publish failure we restore scheduled_for so the next tick retries
 * — unless it was a hard failure (preflight error like missing
 * media), in which case the draft moves to status='approved' and a
 * staff notification fires so a human handles it. An 'awaiting_signoff'
 * result is a consent hold, not a failure: the draft stays scheduled
 * and publishes on the first tick after the owner signs. A claim whose
 * run died mid-flight (scheduled_for null, updated_at stale) is
 * re-armed by the sweep at the top of each tick.
 *
 * We use scheduled_for instead of a fake 'publishing' status to
 * avoid bumping the content_drafts.status CHECK enum (idea, draft,
 * revising, approved, rejected, produced, scheduled, published).
 *
 * Secret gate is identical to the other cron routes: Vercel cron
 * user-agent OR CRON_SECRET header/query param.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { attemptPublish } from '@/lib/publish/attempt-publish'
import { notifyStaffForClient, notifyClientOwners } from '@/lib/notifications'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

interface PublishOutcome {
  draftId: string
  clientId: string
  status: 'published' | 'reverted' | 'failed_hard' | 'awaiting_signoff'
  error?: string
}

const HARD_FAIL_CODES = new Set([
  'no_caption',
  'no_media',
  'no_platforms',
  'no_connections',
  'missing_platform_connection',
])

// A claim older than this can't belong to a live invocation (maxDuration is
// 60s and ticks are 5 minutes apart), so the run that made it must have died.
const STALE_CLAIM_MS = 10 * 60 * 1000

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // Strand sweep: a crash between the claim (scheduled_for NULLed below) and
  // the outcome write leaves status='scheduled' with a null slot, which the
  // due query can never see again. The claim stamps updated_at, so a
  // scheduled row with no slot whose updated_at predates the stale window
  // was claimed by a run that died — re-arm it as due now so this tick's
  // query picks it back up.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  const { data: sweptRows } = await admin
    .from('content_drafts')
    .update({ scheduled_for: nowIso })
    .eq('status', 'scheduled')
    .is('scheduled_for', null)
    .lt('updated_at', staleBefore)
    .select('id')
  const swept = sweptRows?.length ?? 0

  // Pull due drafts. We claim them one-at-a-time to keep the cron's
  // happy path simple; volumes are tiny at our scale (a handful of
  // scheduled posts per hour, max).
  const { data: due } = await admin
    .from('content_drafts')
    .select('id, client_id, scheduled_for')
    .eq('status', 'scheduled')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(50)

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, considered: 0, swept, outcomes: [] })
  }

  const outcomes: PublishOutcome[] = []

  for (const row of due) {
    const draftId = row.id as string
    const clientId = row.client_id as string
    const originalScheduledFor = row.scheduled_for as string

    // Race-safe claim: NULL scheduled_for while status stays 'scheduled'.
    // Only one concurrent caller succeeds (the WHERE still requires
    // scheduled_for to be non-null at update time).
    const { data: claimed } = await admin
      .from('content_drafts')
      .update({ scheduled_for: null, updated_at: nowIso })
      .eq('id', draftId)
      .eq('status', 'scheduled')
      .not('scheduled_for', 'is', null)
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    let result
    try {
      result = await attemptPublish(draftId)
    } catch (e) {
      // Unexpected exception — restore scheduled_for and let the next
      // tick retry.
      await admin
        .from('content_drafts')
        .update({ scheduled_for: originalScheduledFor })
        .eq('id', draftId)
      outcomes.push({
        draftId,
        clientId,
        status: 'reverted',
        error: e instanceof Error ? e.message : 'unknown exception',
      })
      continue
    }

    if (result.ok) {
      // attemptPublish already set published_at + published_url; we
      // flip status to 'published' here. scheduled_for stays null.
      await admin
        .from('content_drafts')
        .update({ status: 'published' })
        .eq('id', draftId)
      // Mirror the manual publish path: the owner hears their post went live
      // (with the real link) and any linked to-do closes — the cron was the
      // one publish path that told nobody.
      await admin
        .from('client_tasks')
        .update({ status: 'done', completed_at: nowIso })
        .eq('draft_id', draftId)
        .in('status', ['todo', 'doing'])
      await notifyClientOwners(clientId, {
        kind: 'draft_published',
        title: 'Your post is live',
        body: result.publishedUrl ? 'Open to see it in the wild.' : 'It just went out on your feed.',
        link: result.publishedUrl ?? '/dashboard',
      }).catch(() => ({ notified: 0 }))
      outcomes.push({ draftId, clientId, status: 'published' })
      continue
    }

    // Consent hold, not a failure: the owner hasn't signed off yet. Leave
    // the draft scheduled (restore its slot) so it goes out automatically
    // on the first tick after the owner signs — never kick it back to
    // 'approved', which would make a staffer re-schedule by hand.
    if (result.errorCode === 'awaiting_signoff') {
      await admin
        .from('content_drafts')
        .update({ scheduled_for: originalScheduledFor })
        .eq('id', draftId)
      outcomes.push({ draftId, clientId, status: 'awaiting_signoff' })
      continue
    }

    // Soft vs hard failure handling.
    const isHard = result.errorCode ? HARD_FAIL_CODES.has(result.errorCode) : false
    if (isHard) {
      // Won't get better by retrying — kick back to 'approved' (leave
      // scheduled_for null, the staffer reschedules manually after fixing).
      await admin
        .from('content_drafts')
        .update({ status: 'approved' })
        .eq('id', draftId)

      await notifyStaffForClient(
        clientId,
        ['strategist', 'community_mgr'],
        {
          kind: 'client_request',
          title: 'Scheduled post couldn\'t publish',
          body: result.error ?? 'See the draft for details.',
          link: `/work/drafts?focus=${draftId}`,
        },
      ).catch(() => ({ notified: 0 }))

      // A missing connection is the OWNER'S fix (connect the account), and
      // most clients have none — without this, their scheduled posts just
      // silently fall off the calendar.
      if (result.errorCode === 'no_connections' || result.errorCode === 'missing_platform_connection') {
        await notifyClientOwners(clientId, {
          kind: 'client_signoff',
          title: 'Connect your account so posts can go out',
          body: 'A post was ready but no social account is connected. Connect one and your team will reschedule it.',
          link: '/dashboard/connected-accounts',
        }).catch(() => ({ notified: 0 }))
      }

      outcomes.push({ draftId, clientId, status: 'failed_hard', error: result.error })
      continue
    }

    // Transient (rate limit, network, platform 5xx) — restore the
    // schedule so the next tick retries.
    await admin
      .from('content_drafts')
      .update({ scheduled_for: originalScheduledFor })
      .eq('id', draftId)
    outcomes.push({ draftId, clientId, status: 'reverted', error: result.error })
  }

  return NextResponse.json({
    ok: true,
    considered: due.length,
    swept,
    outcomes,
  })
}
