/**
 * /api/dashboard/social-refresh — keep the dashboard current WITHOUT a button.
 *
 * The daily cron is the floor: it guarantees one reading a day even if nobody signs in, which
 * is what builds the follower history every platform needs. But between cron runs the screen
 * could sit hours behind, and the owner had no way to know that except by finding a number
 * that looked wrong. Tonight that cost most of an evening.
 *
 * So the dashboard refreshes itself on view. The interval is not a guess — it comes from the
 * vendor's own spec:
 *   - "Follower counts are refreshed once per day."          -> nothing to gain from more
 *   - external posts: background sync runs "at most every ~90 minutes" per account
 * Ninety minutes is therefore the point below which Zernio has nothing newer to give us, and
 * asking more often would spend API calls to receive identical numbers.
 *
 * The window is CLAIMED atomically before the work starts, so two surfaces opening at once
 * (home funnel and insights) cannot both sync. A failed sync does not retry immediately; the
 * daily cron remains the backstop.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ChannelConnection } from '@/lib/channels/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Vendor-grounded: below this they have no fresher data. */
const STALE_AFTER_MS = 90 * 60 * 1000

/* A pull-to-refresh is the owner SAYING "get me everything you can right now", so it skips the
 * 90 minute interval. It keeps a short floor anyway: repeated tugs a few seconds apart would
 * hammer the vendor for numbers that cannot have changed, and their own on-demand post pull is
 * debounced around 15 seconds regardless. */
const FORCE_FLOOR_MS = 30 * 1000

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user || !clientId) return NextResponse.json({ synced: false, reason: 'no client' }, { status: 200 })

  const db = createAdminClient()
  const { data: conn } = await db
    .from('channel_connections')
    .select('id, last_sync_at')
    .eq('client_id', clientId)
    .in('channel', ['zernio', 'ayrshare']) /* whichever lane is active; hardcoding zernio made every on-view refresh a silent no-op under the fallback adapter */
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conn) return NextResponse.json({ synced: false, reason: 'no social connection' })

  const forced = req.nextUrl.searchParams.get('force') === '1'
  const window = forced ? FORCE_FLOOR_MS : STALE_AFTER_MS
  const cutoff = new Date(Date.now() - window).toISOString()
  const last = conn.last_sync_at as string | null
  if (last && last > cutoff) {
    const mins = Math.ceil((new Date(last).getTime() + window - Date.now()) / 60000)
    /* A forced pull that lands inside the floor is still a SUCCESS from the owner's side: they
     * asked for the newest data and the newest data is what is already on screen. Saying
     * "already up to date" is true; saying nothing would read as a gesture that did nothing. */
    return NextResponse.json({ synced: false, reason: forced ? 'already up to date' : 'fresh', upToDate: forced, nextInMinutes: mins })
  }

  /* Claim the window before doing the work. The filter makes this a compare-and-set: whoever
   * wins the update runs the sync, everyone else is told the data is fresh and moves on. A
   * connection that has NEVER synced has a null last_sync_at, which no comparison matches, so
   * it gets its own is-null branch rather than being locked out forever. */
  const claim = last
    ? await db.from('channel_connections').update({ last_sync_at: new Date().toISOString() })
        .eq('id', conn.id).eq('last_sync_at', last).select('id')
    : await db.from('channel_connections').update({ last_sync_at: new Date().toISOString() })
        .eq('id', conn.id).is('last_sync_at', null).select('id')

  if (!claim.data || claim.data.length === 0) {
    return NextResponse.json({ synced: false, reason: 'another view is already refreshing' })
  }

  try {
    const { activeSocialAdapter } = await import('@/lib/channels/registry')
    const adapter = activeSocialAdapter()
    if (!adapter) return NextResponse.json({ synced: false, reason: 'no adapter' })
    const { data: full } = await db.from('channel_connections').select('*').eq('id', conn.id).maybeSingle()
    if (!full) return NextResponse.json({ synced: false, reason: 'connection vanished' })
    const r = await adapter.sync(full as unknown as ChannelConnection)
    return NextResponse.json({ synced: true, note: r.note ?? null, itemsWritten: r.itemsWritten ?? 0 })
  } catch (e) {
    /* Never surface a sync failure to the owner as a broken dashboard: the numbers already on
     * screen are still the last good ones, and the cron will try again. */
    return NextResponse.json({ synced: false, reason: e instanceof Error ? e.message.slice(0, 200) : 'sync failed' })
  }
}
