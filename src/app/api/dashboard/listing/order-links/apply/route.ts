/**
 * POST /api/dashboard/listing/order-links/apply — put the owner's own ordering and
 * booking links onto their Google buttons, then read back to prove it took.
 *
 * Two safety rules shape this whole file.
 *
 * 1. savePlaceActionLinks RECONCILES to the full desired map: any editable type absent
 *    from it gets DELETED. Sending just {FOOD_ORDERING} would therefore wipe an existing
 *    Takeout and Delivery link. So the desired map is always built from what is on the
 *    listing NOW, with only the requested types changed. Nothing is removed unless the
 *    caller explicitly clears it.
 *
 * 2. This writes to a live listing real customers see. dryRun is the DEFAULT: a caller
 *    has to ask for the write. The dry run returns the exact per-button plan, so the
 *    change can be reviewed before anything moves.
 *
 * The read-back is not decoration. The write path had a silent-failure bug (responses
 * were discarded, so a refused write still reported success), and a listing can also
 * accept a write and not reflect it. Proof comes from re-reading, never from the fact
 * that a request did not throw.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPlaceActionLinks, savePlaceActionLinks, type PlaceActionType } from '@/lib/gbp-place-actions'
import { diagnoseOrderLinks, validateOwnUrl, OWNABLE_TYPES } from '@/lib/campaigns/order-links'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Which buttons a given link should fill. Ordering fills Order online, and also Takeout
 *  and Delivery when those are ours, since all three send a guest to the same page. */
const ORDER_TYPES: PlaceActionType[] = ['FOOD_ORDERING', 'FOOD_TAKEOUT', 'FOOD_DELIVERY']

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as
    { orderingLink?: string; bookingLink?: string; dryRun?: boolean; takeoverTakeoutAndDelivery?: boolean; campaignId?: string } | null
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  // Default to a dry run. Writing to a live listing has to be asked for.
  const dryRun = body.dryRun !== false
  const wantTakeover = body.takeoverTakeoutAndDelivery !== false

  // Validate before touching anything. A marketplace link is refused here for the same
  // reason the whole card exists: pointing the button back at DoorDash is the opposite
  // of the job. Toast, Square, Chowbus, OpenTable and Resy all pass.
  const ordering = (body.orderingLink ?? '').trim()
  const booking = (body.bookingLink ?? '').trim()
  if (!ordering && !booking) return NextResponse.json({ error: 'Add an ordering or a booking link.' }, { status: 400 })

  let orderingUrl: string | null = null
  let bookingUrl: string | null = null
  if (ordering) {
    const v = validateOwnUrl(ordering)
    if (!v.ok) return NextResponse.json({ error: v.error, field: 'orderingLink' }, { status: 400 })
    orderingUrl = v.url
  }
  if (booking) {
    const v = validateOwnUrl(booking)
    if (!v.ok) return NextResponse.json({ error: v.error, field: 'bookingLink' }, { status: 400 })
    bookingUrl = v.url
  }

  const before = await listPlaceActionLinks(clientId)
  if (!before.ok) return NextResponse.json({ error: before.error }, { status: 502 })
  const readBefore = diagnoseOrderLinks(before.links)

  // Start from what is on the listing now, so an untouched button is preserved rather
  // than reconciled away. Only OUR editable links can be carried or changed; the
  // aggregator ones Google locks are not ours to send at all.
  // Google allows SEVERAL links of the same type, and savePlaceActionLinks keeps one
  // per type. So if a listing already carries two editable Takeout links, building the
  // desired map below would keep the last and the reconcile would DELETE the other:
  // silent data loss on a listing we were asked to improve. Refuse instead. Losing a
  // working ordering link is far worse than not adding one, and the owner can clean the
  // duplicate up on Google in a minute.
  const seen = new Map<string, number>()
  for (const l of readBefore.ours) seen.set(l.type, (seen.get(l.type) ?? 0) + 1)
  const dupes = readBefore.ours.filter((l) => (seen.get(l.type) ?? 0) > 1)
  if (dupes.length) {
    const labels = Array.from(new Set(dupes.map((d) => d.label)))
    return NextResponse.json({
      error: `Your listing has more than one link on ${labels.join(' and ')}. We will not change it, because saving would remove one of them. Tidy those on Google first, then come back.`,
      duplicates: dupes.map((d) => ({ button: d.label, uri: d.uri })),
      applied: false,
    }, { status: 409 })
  }

  const desired: Partial<Record<PlaceActionType, string>> = {}
  for (const l of readBefore.ours) {
    if (OWNABLE_TYPES.some((t) => t.type === l.type)) desired[l.type as PlaceActionType] = l.uri
  }

  const plan: { button: string; action: 'add' | 'change' | 'keep'; from: string | null; to: string }[] = []
  const applyTo = (type: PlaceActionType, url: string) => {
    const label = OWNABLE_TYPES.find((t) => t.type === type)?.label ?? type
    const current = desired[type] ?? null
    if (current === url) { plan.push({ button: label, action: 'keep', from: current, to: url }); return }
    plan.push({ button: label, action: current ? 'change' : 'add', from: current, to: url })
    desired[type] = url
  }

  if (orderingUrl) {
    applyTo('FOOD_ORDERING', orderingUrl)
    // Takeout and Delivery only when they are ours AND the caller asked. Yellow Bee's
    // are merchant links currently pointing at DoorDash, so taking them over is the
    // point; but an owner who genuinely wants delivery to stay on an app can opt out.
    if (wantTakeover) {
      for (const t of ORDER_TYPES) {
        if (t === 'FOOD_ORDERING') continue
        if (readBefore.ours.some((l) => l.type === t)) applyTo(t, orderingUrl)
      }
    }
  }
  if (bookingUrl) applyTo('DINING_RESERVATION', bookingUrl)

  const changes = plan.filter((p) => p.action !== 'keep')
  // What we cannot do, stated every time so the result is never oversold.
  const cannotChange = readBefore.locked.map((l) => ({ button: l.label, goesTo: l.goesTo, uri: l.uri }))

  if (dryRun) {
    return NextResponse.json({
      dryRun: true, applied: false,
      headlineBefore: readBefore.headline,
      plan, changes: changes.length, cannotChange,
      note: cannotChange.length
        ? 'The delivery app links Google adds itself stay on your listing. We cannot remove those.'
        : null,
    })
  }

  if (!changes.length) {
    return NextResponse.json({ dryRun: false, applied: false, plan, changes: 0, cannotChange, note: 'Your buttons already point where you asked.' })
  }

  const saved = await savePlaceActionLinks(clientId, desired)
  if (!saved.ok) return NextResponse.json({ error: saved.error, plan, applied: false }, { status: 502 })

  // Proof. Re-read and compare against what we asked for, because "the request did not
  // throw" is not the same as "the button changed".
  const after = await listPlaceActionLinks(clientId)
  if (!after.ok) {
    return NextResponse.json({ applied: true, verified: false, plan, warning: 'We saved the change but could not read your listing back to confirm it.' })
  }
  const readAfter = diagnoseOrderLinks(after.links)
  const verified = plan
    .filter((p) => p.action !== 'keep')
    .map((p) => {
      const type = OWNABLE_TYPES.find((t) => t.label === p.button)?.type
      const now = readAfter.ours.find((l) => l.type === type)
      return { button: p.button, wanted: p.to, now: now?.uri ?? null, ok: now?.uri === p.to }
    })

  const allOk = verified.every((v) => v.ok)

  // Stamp the campaign task done, but ONLY on a verified read-back. Stamping on "the
  // request did not throw" is what makes a progress bar lie, and this write path had
  // exactly that bug an hour ago. Server-written, not in the owner PATCH whitelist.
  const campaignId = typeof (body as { campaignId?: string }).campaignId === 'string' ? (body as { campaignId?: string }).campaignId : null
  if (allOk && campaignId && /^[A-Za-z0-9-]{1,64}$/.test(campaignId)) {
    try {
      const admin = createAdminClient()
      const { data } = await admin.from('campaigns').select('execution').eq('id', campaignId).eq('client_id', clientId).maybeSingle()
      const exec = ((data as { execution?: Record<string, unknown> } | null)?.execution ?? {}) as Record<string, unknown>
      await admin.from('campaigns')
        .update({ execution: { ...exec, orderButtonsFixedAt: new Date().toISOString() } })
        .eq('id', campaignId).eq('client_id', clientId)
    } catch { /* the buttons are live either way; the stamp is bookkeeping */ }
  }

  return NextResponse.json({
    dryRun: false,
    applied: true,
    verified: allOk,
    checks: verified,
    headlineAfter: readAfter.headline,
    cannotChange,
    plan,
  })
}
