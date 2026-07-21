/**
 * POST /api/campaigns/:id/reviews-caught-up — completion stamp for the owner-run
 * review-reply task (the reviewsreply card's free and Apnosh AI versions).
 *
 * The ONLY writer of execution.reviewRepliesDoneAt, and deliberately NOT in the owner
 * PATCH whitelist, for the same reason as gbpFixedAt and orderButtonsFixedAt: it re-reads
 * the reviews itself and stamps only on what it finds. The client cannot tell us it is
 * done; the server checks.
 *
 * The bar is "nothing is waiting". If the owner left some for later the task stays open,
 * which is the honest state. That is also why this is safe to call at the end of every
 * pass: it is a question, not an assertion.
 *
 * Reviews with no review_url are excluded from the bar. Those cannot be replied to through
 * us at all (Google gave us no address), so holding the task open on them would make it
 * permanently uncompletable through no fault of the owner. They are surfaced separately on
 * the walkthrough's first screen instead.
 *
 * Idempotent and first-writer-wins: once stamped, later calls return the original time.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCampaign } from '@/lib/campaigns/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const access = await checkClientAccess(campaign.clientId)
  if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Producer is deliberately not tested, matching gbp-fixed: the stamp means "we re-read
  // the reviews and none are waiting", which is equally true whichever lane did the work.
  const hasReviews = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && it.serviceId === 'review-responses')
  if (!hasReviews) return NextResponse.json({ error: 'this campaign has no review-reply task' }, { status: 400 })

  const existing = campaign.execution?.reviewRepliesDoneAt
  if (existing) return NextResponse.json({ ok: true, doneAt: existing, already: true })

  const db = createAdminClient()
  const { data, error } = await db
    .from('reviews')
    .select('id')
    .eq('client_id', campaign.clientId)
    .eq('source', 'google')
    .is('response_text', null)
    .not('review_url', 'is', null)
    .limit(1)

  // A read we could not trust is not evidence of being caught up.
  if (error) return NextResponse.json({ error: 'could not read your reviews just now' }, { status: 502 })

  const waiting = (data ?? []).length
  if (waiting > 0) return NextResponse.json({ ok: false, caughtUp: false })

  const doneAt = new Date().toISOString()
  const execution = { ...(campaign.execution ?? {}), reviewRepliesDoneAt: doneAt }
  const { error: writeError } = await db.from('campaigns').update({ execution }).eq('id', id)
  if (writeError) return NextResponse.json({ error: 'could not save that' }, { status: 502 })

  return NextResponse.json({ ok: true, caughtUp: true, doneAt })
}
