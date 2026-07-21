/**
 * /api/dashboard/reviews/queue — the reviews still waiting on a reply, worst first.
 *
 * This is what the owner-run reply walkthrough reads. It answers one question honestly:
 * what is actually outstanding, and can we do anything about it. The reasoning lives in
 * `@/lib/reviews/queue` (pure, verified); this route only fetches and hands it over.
 *
 * `source = 'google'` is the one filter applied here rather than there: the reply write
 * only exists for Google. Other sources save to our database and never reach the platform,
 * so queueing them would have the owner writing into a drawer.
 *
 * Reviews come from the daily sync (gbp-client-sync), not a live call, so a reply posted
 * on Google directly shows up here as unanswered until the next sync catches it. The
 * walkthrough says so on screen rather than hiding it, because an owner who sees a review
 * they already answered should know why.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildQueue, type ReviewRow } from '@/lib/reviews/queue'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  // Every Google review we hold, so the counts describe the whole listing rather than just
  // the backlog. "3 waiting out of 182" reads very differently from "3 waiting".
  const { data, error } = await createAdminClient()
    .from('reviews')
    .select('id, rating, author_name, review_text, posted_at, response_text, review_url')
    .eq('client_id', clientId)
    .eq('source', 'google')
    .order('posted_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: 'Could not read your reviews.' }, { status: 502 })

  return NextResponse.json(buildQueue((data ?? []) as ReviewRow[], Date.now()))
}
