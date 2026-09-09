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
import { listPostTargets, bestSlots, createPost, platformTextLimits } from '@/lib/channels/adapters/zernio'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** A slot built on fewer than this many posts is not a pattern. */
const MIN_POSTS_FOR_A_RECOMMENDATION = 3
/** How many recommended slots to offer at once. */
const MOST_RECOMMENDATIONS = 3
/* Waking hours, in the owner's own timezone. The vendor's strongest slot for one
   account here is 08:00 UTC, which is 1am in Seattle: a real number about a post
   that happened to go up overnight, and useless as advice to a restaurant. */
const EARLIEST = 7
const LATEST = 20

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
    const [targets, slots, limits] = await Promise.all([listPostTargets(clientId), bestSlots(clientId), platformTextLimits()])
    /* Strongest first, and more than one: an owner offered a single "best time"
       has to take it or leave it, and the second-best hour is usually nearly as
       good and lands on a day that suits them better. Three is where the chips
       stop being a choice and start being a list. */
    /* Everything below is decided in the OWNER'S day, not the vendor's. Its slots
       are UTC, and two of them can be the same evening where the owner lives:
       Monday 23:00 and Tuesday 04:00 UTC are both Monday night in Seattle. Ranked
       and cut on the vendor's own day numbers, "three best times" came back as
       Monday, Monday and Monday. */
    const named = slots
      .filter((sl) => sl.posts >= MIN_POSTS_FOR_A_RECOMMENDATION)
      .map((sl) => {
        const at = nextOccurrence(sl.dayOfWeek, sl.hourUtc)
        let label = `${DAYS[sl.dayOfWeek]} at ${sl.hourUtc}:00 UTC`
        let localDay = `utc-${sl.dayOfWeek}`
        let localHour = sl.hourUtc
        try {
          label = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', hour: 'numeric' }).format(at)
          const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(at)
          localDay = parts.find((x) => x.type === 'weekday')?.value ?? localDay
          localHour = Number(parts.find((x) => x.type === 'hour')?.value ?? sl.hourUtc) % 24
        } catch { /* the fallback labels above stand */ }
        return { iso: at.toISOString(), label, posts: sl.posts, localDay, localHour }
      })
      .filter((x) => x.localHour >= EARLIEST && x.localHour <= LATEST)
      .sort((a, b) => b.posts - a.posts)

    /* One per day, so three recommendations are three real choices. Strongest
       first, and the rest of that day's hours drop: an owner picking between
       Monday 4pm and Monday 9pm is not picking between days. */
    const seenDays = new Set<string>()
    const bests = named
      .filter((x) => (seenDays.has(x.localDay) ? false : (seenDays.add(x.localDay), true)))
      .slice(0, MOST_RECOMMENDATIONS)
      .map(({ iso, label, posts }) => ({ iso, label, posts }))
    /* `best` stays for anything still reading the old shape. */
    return NextResponse.json({ targets, bests, best: bests[0] ?? null, limits, timezone: tz }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load your accounts' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string; content?: string; accountIds?: string[]; mediaUrls?: string[]
    when?: { kind?: string; iso?: string; timezone?: string }
    /** true = do not publish; hand it to Apnosh as a draft to write and send */
    handoff?: boolean
    firstComment?: string
    collaborators?: string[]
    tagged?: string[]
    tagLocation?: boolean
    tiktokDraft?: boolean
    /** platform -> its own caption, for the platforms that need a different one */
    perPlatform?: Record<string, string>
  }
  const { clientId, content, mediaUrls, when } = body
  const accountIds: string[] = Array.isArray(body.accountIds) ? body.accountIds : []
  /* A handoff needs no accounts chosen: the owner is describing what they want,
     not addressing it. Publishing still does. */
  if (!clientId || (!body.handoff && accountIds.length === 0)) {
    return NextResponse.json({ error: 'clientId and at least one account required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  /* ── HAND IT TO APNOSH ──────────────────────────────────────────────────
     The owner can do this themselves or pay to have it done, and the SAME post
     has to be able to move between them. That machinery already exists:
     content_drafts carries proposed_by, approved_by, a caption, target platforms,
     media and a target date, and the staff drafts queue reads status idea, draft
     and revising. The composer was publishing straight past all of it.

     A handoff is a BRIEF, not a post, so the rules relax: no media required
     because staff will shoot or source it, and platforms are a preference rather
     than a requirement. What the owner is sending is an intention. */
  if (body.handoff === true) {
    try {
      const admin = createAdminClient()
      const targets = await listPostTargets(clientId)
      const picked = targets.filter((t) => accountIds.includes(t.accountId))
      const { error } = await admin.from('content_drafts').insert({
        client_id: clientId,
        status: 'draft',
        idea: (content ?? '').trim().slice(0, 300) || 'A post the owner asked us to write',
        caption: (content ?? '').trim() || null,
        target_platforms: picked.map((t) => t.platform),
        media_urls: Array.isArray(mediaUrls) ? mediaUrls.filter((u) => typeof u === 'string' && u.startsWith('https://')) : [],
        target_publish_date: when?.kind === 'at' && when.iso ? when.iso.slice(0, 10) : null,
        proposed_by: access.userId ?? null,
        proposed_via: 'owner_composer',
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, handed: true, posted: picked.map((t) => t.platform) })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not send it over' }, { status: 502 })
    }
  }

  try {
    /* The platform of each chosen account comes from the vendor, never from the
       browser: a client that could name its own platform could post somewhere the
       owner did not pick. */
    const targets = (await listPostTargets(clientId)).filter((t) => accountIds.includes(t.accountId))
    if (!targets.length) return NextResponse.json({ error: 'Those accounts are not connected' }, { status: 400 })

    /* Each platform's own caption, keyed by a platform actually being posted to.
       A browser cannot introduce a platform this way, only override one already
       chosen. */
    const perPlatform: Record<string, string> = {}
    const sent = (body.perPlatform && typeof body.perPlatform === 'object' ? body.perPlatform : {}) as Record<string, unknown>
    for (const t of targets) {
      const own = typeof sent[t.platform] === 'string' ? (sent[t.platform] as string).trim() : ''
      if (own) perPlatform[t.platform] = own
    }

    /* Too long is the vendor's number, not ours, and it is per platform: the old
       flat 2,200 was Instagram's limit applied to LinkedIn's 3,000 and X's 280
       alike, refusing posts LinkedIn would have taken and passing ones X would
       have cut. */
    const limits = await platformTextLimits()
    const over = targets
      .map((t) => ({ platform: t.platform, text: perPlatform[t.platform] ?? (content ?? '').trim(), limit: limits[t.platform] }))
      .find((x) => x.limit && x.text.length > x.limit)
    if (over) {
      const name = over.platform.charAt(0).toUpperCase() + over.platform.slice(1)
      return NextResponse.json({ error: `That caption is ${over.text.length - over.limit!} characters too long for ${name}, which stops at ${over.limit!.toLocaleString()}.` }, { status: 400 })
    }

    const w = when?.kind === 'at' && when.iso
      ? { kind: 'at' as const, iso: when.iso, timezone: when.timezone || 'America/Los_Angeles' }
      : { kind: 'now' as const }

    /* Usernames arrive from a text field, so they are cleaned here rather than
       trusted: a leading @, stray spaces, and anything that is not a handle. */
    const handles = (xs?: string[]) => (Array.isArray(xs) ? xs : [])
      .map((x) => String(x).trim().replace(/^@+/, ''))
      .filter((x) => /^[A-Za-z0-9._]{1,30}$/.test(x))

    /* The location is never a free-typed id. It is the page the client's OWN
       connected Facebook account carries, or it is not sent. */
    const ownPage = targets.find((t) => t.pageId)?.pageId ?? null

    const r = await createPost(clientId, {
      content: content ?? '',
      targets: targets.map((t) => ({ accountId: t.accountId, platform: t.platform })),
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls.filter((u) => typeof u === 'string' && u.startsWith('https://')) : [],
      when: w,
      firstComment: typeof body.firstComment === 'string' ? body.firstComment.slice(0, 2200) : undefined,
      collaborators: handles(body.collaborators).slice(0, 3),
      tagged: handles(body.tagged).slice(0, 20),
      locationId: body.tagLocation ? ownPage : null,
      tiktokDraft: body.tiktokDraft === true,
      perPlatform,
    })
    return NextResponse.json({ ok: true, id: r.id, posted: targets.map((t) => t.platform) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not publish' }, { status: 502 })
  }
}
