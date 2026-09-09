/**
 * Publish a post, now or later.
 * ==============================
 * GET  ?clientId=…&tz=America/Los_Angeles → where they can post, and when their
 *                                           posts have actually done best
 * POST { clientId, content, accountIds, mediaUrls?, when }   → publish or schedule
 *
 * Four owners in the study wanted content HANDLED rather than measured, and the
 * product could only watch. This is the gap.
 *
 * On the best time: the vendor returns slots in UTC with the number of posts each
 * one is based on, and the count matters more than the average. One account here
 * has a slot averaging 6,561 engagements from six posts, which is a single viral
 * video wearing a timeslot's name. A recommendation needs a floor, or it is
 * astrology with a number next to it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { listPostTargets, bestSlots, createPost } from '@/lib/channels/adapters/zernio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** A slot built on fewer than this many posts is not a pattern. */
const MIN_POSTS_FOR_A_RECOMMENDATION = 3

/** The next time it will be `dayOfWeek` at `hourUtc`, as an instant. */
function nextOccurrence(dayOfWeek: number, hourUtc: number): Date {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0))
  let delta = (dayOfWeek - d.getUTCDay() + 7) % 7
  if (delta === 0 && d.getTime() <= now.getTime() + 60_000) delta = 7
  d.setUTCDate(d.getUTCDate() + delta)
  return d
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  /* The owner's own timezone, sent by the browser. "Tuesday at nine" has to mean
     nine where they are, not nine where the server is. */
  const tz = req.nextUrl.searchParams.get('tz') || 'America/Los_Angeles'

  try {
    const [targets, slots] = await Promise.all([listPostTargets(clientId), bestSlots(clientId)])
    const good = slots.filter((s) => s.posts >= MIN_POSTS_FOR_A_RECOMMENDATION)[0] ?? null
    let best: { iso: string; label: string; posts: number } | null = null
    if (good) {
      const at = nextOccurrence(good.dayOfWeek, good.hourUtc)
      let label = ''
      try {
        label = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', hour: 'numeric' }).format(at)
      } catch {
        label = `${DAYS[good.dayOfWeek]} at ${good.hourUtc}:00 UTC`
      }
      best = { iso: at.toISOString(), label, posts: good.posts }
    }
    return NextResponse.json({ targets, best, timezone: tz }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load your accounts' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string; content?: string; accountIds?: string[]; mediaUrls?: string[]
    when?: { kind?: string; iso?: string; timezone?: string }
  }
  const { clientId, content, accountIds, mediaUrls, when } = body
  if (!clientId || !Array.isArray(accountIds) || accountIds.length === 0) {
    return NextResponse.json({ error: 'clientId and at least one account required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  if ((content ?? '').trim().length > 2200) {
    return NextResponse.json({ error: 'That caption is too long for at least one of these platforms' }, { status: 400 })
  }

  try {
    /* The platform of each chosen account comes from the vendor, never from the
       browser: a client that could name its own platform could post somewhere the
       owner did not pick. */
    const targets = (await listPostTargets(clientId)).filter((t) => accountIds.includes(t.accountId))
    if (!targets.length) return NextResponse.json({ error: 'Those accounts are not connected' }, { status: 400 })

    const w = when?.kind === 'at' && when.iso
      ? { kind: 'at' as const, iso: when.iso, timezone: when.timezone || 'America/Los_Angeles' }
      : { kind: 'now' as const }

    const r = await createPost(clientId, {
      content: content ?? '',
      targets: targets.map((t) => ({ accountId: t.accountId, platform: t.platform })),
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls.filter((u) => typeof u === 'string' && u.startsWith('https://')) : [],
      when: w,
    })
    return NextResponse.json({ ok: true, id: r.id, posted: targets.map((t) => t.platform) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not publish' }, { status: 502 })
  }
}
