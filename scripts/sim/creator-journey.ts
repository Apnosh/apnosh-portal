/**
 * CREATOR JOURNEY e2e — the marketplace creator, from signing up to getting paid.
 *
 * The existing sims cover the CAMPAIGN work-order spine. This one covers the other supply side: a
 * freelancer who signs up, builds their own shop, gets found, gets booked, does the work, and gets
 * paid. It drives the REAL tables with the service role and the REAL engines (slot engine, mint
 * bridge, status machine, payout accrual), asserting the questions an actual creator would ask:
 *
 *   Do I show up?          pending → invisible; approved → on the shelf, page resolves, slots offered
 *   Does work reach me?     a booking mints an order under an id MY screens actually query
 *   Can I see it?           work list + calendar + booking detail all carry it, with the real time
 *   Can I do it?            the status machine walks accepted → in progress → delivered (proof gated)
 *   Do I get paid?          approval accrues a payout ledger row and my earnings reflect it
 *
 * Money: NOTHING is charged and no Stripe call is made. `creator_payouts` / `campaign_charges` rows
 * are internal ledger accruals (the same thing vendor-payout.ts already exercises).
 *
 * Isolated + self-cleaning: every row hangs off one throwaway auth user + vendor, hard-deleted at the
 * end. Bookings ride a real client (FK-safe) and are deleted by id.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/creator-journey.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { onboardCreatorCore } from '@/lib/marketplace/onboard-creator'
import { emptyPackage, packageToRow, rowToPackage, type CreatorPackage } from '@/lib/marketplace/package'
import { getCreatorStoreCards } from '@/lib/marketplace/store-cards'
import { getCreatorProfile } from '@/lib/marketplace/creator-profile'
import { getVendorScheduleBySlug, vendorIdForSlug, getVendorRule, confirmLabel, CREATOR_GATE_KIND } from '@/lib/marketplace/creator-schedule'
import { computeOpenSlots } from '@/lib/campaigns/gates/availability'
import { mintBookingWorkOrder, workOrdersForBookings, voidBookingWorkOrder } from '@/lib/marketplace/booking-work-order'
import { calendarForCreator } from '@/lib/marketplace/creator-calendar-data'
import { listWorkOrdersForCreator, getCreatorEarnings, getCreatorPayoutLines, getCreatorIdForUser, updateWorkOrder } from '@/lib/campaigns/work-orders'
import { Suite } from './lib'

config({ path: '.env.local' })

/** A real client to hang the bookings off of (FK-safe). Do Si KBBQ — the standing sim tenant. */
const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const STAMP = Date.now()
const EMAIL = `sim-creator-${STAMP}@apnosh-sim.invalid`
const NAME = `SIM Creator Journey ${STAMP}`

type Admin = ReturnType<typeof createAdminClient>

/** The availability row the creator's own hours editor writes (creator-availability.ts). */
function hoursRow(vendorId: string) {
  const allWeek = { start: '09:00', end: '17:00' }
  return {
    gate_kind: CREATOR_GATE_KIND,
    scope_kind: 'vendor',
    scope_id: vendorId,
    label: confirmLabel('request'),               // new creators default to confirming each booking
    timezone: 'America/Los_Angeles',
    weekly: { '0': [allWeek], '1': [allWeek], '2': [allWeek], '3': [allWeek], '4': [allWeek], '5': [allWeek], '6': [allWeek] },
    slot_minutes: 120,
    capacity: 1,
    lead_time_days: 1,
    horizon_days: 45,
    active: true,
    updated_at: new Date().toISOString(),
  }
}

/** A creator-authored offer, the way the Offer Designer builds one. */
function shootOffer(over: Partial<CreatorPackage> = {}): CreatorPackage {
  return {
    ...emptyPackage('photographer'),
    slug: `sim-photo-day-${STAMP}`,
    title: 'SIM Photo Day',
    description: 'A half day of photos at your restaurant.',
    priceCents: 60000,
    deliverables: ['20 edited photos'],
    options: [{ id: 'o1', label: 'Extra hour', priceDeltaCents: 15000 }],
    intake: [{ id: 'q1', label: 'Which dishes should we feature?', required: true }],
    bookingShape: 'scheduled',
    slotMinutes: 240,                              // FU7: a 4-hour photo day, not the default 2-hour slot
    active: true,
    ...over,
  }
}

/** Insert an offer exactly as saveMyPackage does (packageToRow → upsert on vendor_id+slug). */
async function publishOffer(a: Admin, vendorId: string, pkg: CreatorPackage): Promise<string> {
  const row = packageToRow(pkg, vendorId)
  const { data, error } = await a.from('vendor_listings').upsert(row, { onConflict: 'vendor_id,slug' }).select('id').single()
  if (error) throw new Error(`publishOffer: ${error.message}`)
  return data.id as string
}

/** The booking row holdCreatorBooking writes for a request-mode creator (status 'held'). */
async function bookSlot(a: Admin, opts: {
  vendorId: string; vendorSlug: string; listingId: string; listingSlug: string; listingTitle: string
  ruleId: string; date: string; start: string; end: string; timezone: string
  intake?: Record<string, string>; options?: { label: string; priceDeltaCents: number }[]; tierName?: string | null
}): Promise<string> {
  const meta = {
    kind: 'creator', vendorId: opts.vendorId, vendorSlug: opts.vendorSlug,
    listingId: opts.listingId, listingSlug: opts.listingSlug, listingTitle: opts.listingTitle,
    tierName: opts.tierName ?? null,
    intake: opts.intake ?? {},
    ...(opts.options?.length ? { options: opts.options } : {}),
  }
  const { data, error } = await a.from('bookings').insert({
    client_id: TEST_CLIENT, gate_kind: CREATOR_GATE_KIND, rule_id: opts.ruleId,
    slot_date: opts.date, slot_start: opts.start, slot_end: opts.end, timezone: opts.timezone,
    status: 'held', hold_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    note: JSON.stringify(meta), updated_at: new Date().toISOString(),
  }).select('id').single()
  if (error) throw new Error(`bookSlot: ${error.message}`)
  return data.id as string
}

/** A no-calendar booking (async / recurring / quote), as those actions write it. */
async function bookSimple(a: Admin, meta: Record<string, unknown>, over: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await a.from('bookings').insert({
    client_id: TEST_CLIENT, gate_kind: CREATOR_GATE_KIND, timezone: 'America/Los_Angeles',
    status: 'confirmed', note: JSON.stringify({ kind: 'creator', ...meta }),
    updated_at: new Date().toISOString(), ...over,
  }).select('id').single()
  if (error) throw new Error(`bookSimple: ${error.message}`)
  return data.id as string
}

/** The creator accepting a held booking (acceptCreatorBooking's atomic claim + mint). */
async function acceptBooking(a: Admin, bookingId: string): Promise<void> {
  const { data: claimed } = await a.from('bookings')
    .update({ status: 'confirmed', hold_expires_at: null, updated_at: new Date().toISOString() })
    .eq('id', bookingId).eq('status', 'held').select('id').maybeSingle()
  if (claimed) await mintBookingWorkOrder(bookingId)
}

async function main() {
  const a = createAdminClient()
  const s = new Suite()
  const bookingIds: string[] = []
  let userId: string | null = null
  let vendorId: string | null = null
  let slug = ''

  try {
    // ───────────────────────────────────────────────────────────────────────────
    s.group('1. signing up — a freelancer joins')
    const { data: created, error: authErr } = await a.auth.admin.createUser({
      email: EMAIL, password: `Sim!${STAMP}aA`, email_confirm: true,
    })
    if (authErr || !created.user) throw new Error(`could not create the test login: ${authErr?.message}`)
    userId = created.user.id

    // The real self-serve path: bookable false, pending an admin's yes.
    const onboard = await onboardCreatorCore({
      name: NAME, email: EMAIL, craft: 'Photo', crafts: ['photo'],
      serviceArea: ['WA'], description: 'Simulated creator. Safe to delete.',
      personId: userId, invite: false, bookable: false,
    })
    s.check('signup creates their creator account', onboard.ok && !!onboard.vendorId, onboard.ok ? null : JSON.stringify(onboard))
    if (!onboard.ok || !onboard.vendorId) throw new Error('onboarding failed — cannot continue')
    vendorId = onboard.vendorId
    slug = onboard.slug!

    const { data: v0 } = await a.from('vendors').select('bookable, vendor_type, service_area, craft, person_id').eq('id', vendorId).single()
    s.check('they start UNDER REVIEW, not live', v0?.bookable === false)
    s.check('their account is tied to their login', v0?.person_id === userId)
    s.check('their work area is saved', Array.isArray(v0?.service_area) && (v0!.service_area as string[]).includes('WA'))

    // The single most load-bearing link in the whole journey: the id their screens ask for
    // must be the id work is filed under. If these ever diverge, work goes to a black hole.
    const resolved = await getCreatorIdForUser(userId)
    s.check('their login resolves to their creator id (work can find them)', resolved === vendorId, `resolved ${resolved} vs vendor ${vendorId}`)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('2. while under review — correctly invisible')
    s.check('their shop page does NOT resolve yet', (await vendorIdForSlug(slug)) === null)
    s.check('they are NOT on the store shelf yet', !(await getCreatorStoreCards('WA')).some((c) => c.vendorSlug === slug))
    s.check('their public profile is not readable yet', (await getCreatorProfile(slug)) === null)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('3. setting up shop — hours + an offer')
    const { data: ruleRow, error: ruleErr } = await a.from('availability_rules').insert({ ...hoursRow(vendorId), created_by: userId }).select('id').single()
    s.check('their hours save', !ruleErr && !!ruleRow?.id, ruleErr?.message)
    const ruleId = ruleRow!.id as string

    const offer = shootOffer()
    const listingId = await publishOffer(a, vendorId, offer)
    s.check('their offer publishes', !!listingId)

    const { data: listRow } = await a.from('vendor_listings').select('*').eq('id', listingId).single()
    const readBack = rowToPackage(listRow as Parameters<typeof rowToPackage>[0])
    s.check('the offer reads back exactly as authored (price)', readBack.priceCents === 60000)
    s.check('the offer keeps its questions for the restaurant', readBack.intake.length === 1 && readBack.intake[0].required === true)
    s.check('the offer keeps its add-on', readBack.options.length === 1 && readBack.options[0].priceDeltaCents === 15000)
    s.check('the offer keeps its shoot length (4 hours)', readBack.slotMinutes === 240)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('4. going live — the admin approves them')
    await a.from('vendors').update({ bookable: true }).eq('id', vendorId)
    s.check('their shop page now resolves', (await vendorIdForSlug(slug)) === vendorId)
    const profile = await getCreatorProfile(slug)
    s.check('their public profile loads', !!profile)
    s.check('their offer is shown on their page', !!profile && profile.offerings.some((l) => l.listingSlug === offer.slug))
    const shelf = await getCreatorStoreCards('WA')
    s.check('they now appear on the store shelf', shelf.some((c) => c.vendorSlug === slug), `${shelf.length} cards on the shelf`)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('5. their calendar offers real times')
    const sched = await getVendorScheduleBySlug(slug)
    s.check('their hours produce open times', sched.available && sched.slots.length > 0, `${sched.slots.length} slots`)
    s.check('times are marked as needing their yes (request mode)', sched.confirmMode === 'request')

    // FU7: this offer books a 4-hour block, so its grid must be coarser than the default 2-hour one.
    const offerSched = await getVendorScheduleBySlug(slug, undefined, undefined, 240)
    const defaultStarts = new Set(sched.slots.filter((x) => x.date === sched.slots[0].date).map((x) => x.start))
    const offerDay = offerSched.slots[0]?.date
    const offerStarts = offerSched.slots.filter((x) => x.date === offerDay).map((x) => x.start)
    s.check('a 4-hour offer offers fewer, longer blocks', offerStarts.length < defaultStarts.size, `${offerStarts.length} vs ${defaultStarts.size} per day`)
    s.check('a 4-hour block really is 4 hours', offerSched.slots[0]?.start === '09:00' && offerSched.slots[0]?.end === '13:00', `${offerSched.slots[0]?.start}-${offerSched.slots[0]?.end}`)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('6. a restaurant books them')
    const pick = offerSched.slots[0]
    const bId = await bookSlot(a, {
      vendorId, vendorSlug: slug, listingId, listingSlug: offer.slug, listingTitle: offer.title,
      ruleId, date: pick.date, start: pick.start, end: pick.end, timezone: pick.timezone,
      intake: { 'Which dishes should we feature?': 'The short rib and the kimchi pancake' },
      options: [{ label: 'Extra hour', priceDeltaCents: 15000 }],
    })
    bookingIds.push(bId)
    s.check('the booking is filed', !!bId)

    // A held booking is not work yet — it must not mint until they say yes.
    s.check('nothing is minted while it awaits their yes', (await workOrdersForBookings([bId]))[bId] === undefined)

    // That time is now taken on their calendar, so nobody can double-book it.
    const afterHold = await getVendorScheduleBySlug(slug, undefined, undefined, 240)
    s.check('the held time is off their calendar', !afterHold.slots.some((x) => x.date === pick.date && x.start === pick.start))
    // FU7's overlap rule: a 4-hour hold blocks the 2-hour slots it spans, not just its own start.
    const overlapping = await getVendorScheduleBySlug(slug)
    s.check('a 4-hour hold blocks the hours it spans (no double-booking)',
      !overlapping.slots.some((x) => x.date === pick.date && x.start === '11:00'), 'the 11:00 slot sits inside the 09:00-13:00 hold')

    // ───────────────────────────────────────────────────────────────────────────
    s.group('7. they accept — and the work reaches them')
    await acceptBooking(a, bId)
    const { data: bAfter } = await a.from('bookings').select('status, hold_expires_at').eq('id', bId).single()
    s.check('the booking is confirmed', bAfter?.status === 'confirmed' && bAfter?.hold_expires_at === null)

    const work = (await workOrdersForBookings([bId]))[bId] ?? []
    s.check('accepting mints exactly one job', work.length === 1, `${work.length} jobs`)
    const job = work[0]
    s.check('the job is priced with the add-on ($600 + $150)', job.amountCents === 75000, `${job.amountCents}`)
    s.check('the job is dated to the shoot day', job.dueDate === pick.date)
    s.check('the job starts as theirs to do (accepted)', job.status === 'accepted')

    const { data: jobRow } = await a.from('creator_work_orders').select('creator_id, vendor_id, campaign_id, brief, concept_status').eq('id', job.orderId).single()
    s.check('the job is filed under THEIR id', jobRow?.creator_id === vendorId && jobRow?.vendor_id === vendorId)
    s.check('the job is marked as marketplace work, not campaign work', jobRow?.campaign_id === null)
    s.check("the brief carries the restaurant's answer", String(jobRow?.brief ?? '').includes('short rib'))
    s.check('the brief keeps the question it answers', String(jobRow?.brief ?? '').includes('Which dishes'))
    // The card shows the job's title, day, time, and price as real fields, so the brief must not
    // repeat them back as boilerplate — that is what buried the answers before.
    s.check('the brief does not repeat what the card already shows', !/Deliver the finished work|Booked shoot:/.test(String(jobRow?.brief ?? '')), String(jobRow?.brief ?? ''))
    s.check('a booked add-on is named in the brief', String(jobRow?.brief ?? '').includes('Extra hour'))

    // ───────────────────────────────────────────────────────────────────────────
    s.group('8. it shows up on their screens')
    const myWork = await listWorkOrdersForCreator(vendorId)
    s.check('it is in their work list', myWork.some((o) => o.id === job.orderId), `${myWork.length} orders`)
    const mine = myWork.find((o) => o.id === job.orderId)
    s.check('the list says WHO the work is for', !!mine?.restaurantName, mine?.restaurantName)
    s.check('the list says what time to show up', mine?.slotTime === pick.start, `${mine?.slotTime}`)
    s.check('the list says what it pays', mine?.amountCents === 75000, `${mine?.amountCents}`)
    const cal = await calendarForCreator(vendorId)
    const calItem = cal.find((c) => c.id === job.orderId)
    s.check('it is on their calendar', !!calItem)
    s.check('the calendar shows the real start time', calItem?.time === pick.start, `${calItem?.time}`)
    s.check('the calendar marks it as a shoot', calItem?.kind === 'shoot')
    s.check('the calendar row can open the booking', calItem?.bookingId === bId)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('9. doing the work')
    await updateWorkOrder(job.orderId, { status: 'in_progress' })
    s.check('they can start it', (await one(a, job.orderId)).status === 'in_progress')

    let proofGate = false
    try { await updateWorkOrder(job.orderId, { status: 'delivered' }) } catch { proofGate = true }
    s.check('they cannot mark it done without handing something over', proofGate)

    await updateWorkOrder(job.orderId, { status: 'delivered', delivered_url: 'https://example.com/sim-gallery' })
    const delivered = await one(a, job.orderId)
    s.check('delivering with a link works', delivered.status === 'delivered' && delivered.delivered_url === 'https://example.com/sim-gallery')

    let backwards = false
    try { await updateWorkOrder(job.orderId, { status: 'in_progress' }) } catch { backwards = true }
    s.check('a delivered job cannot silently go backwards', backwards)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('10. getting paid')
    const before = await getCreatorEarnings(vendorId)
    await updateWorkOrder(job.orderId, { status: 'approved' })
    s.check('the restaurant can approve it', (await one(a, job.orderId)).status === 'approved')

    const { data: payout } = await a.from('creator_payouts').select('gross_cents, fee_cents, net_cents, status').eq('work_order_id', job.orderId).maybeSingle()
    s.check('approval books what they are owed', !!payout, payout ? null : 'no payout row')
    s.check('what they are owed matches the job price', payout?.gross_cents === 75000, `${payout?.gross_cents}`)
    s.check('the split adds up (fee + net = gross)', !!payout && payout.fee_cents + payout.net_cents === payout.gross_cents)
    s.check('it is booked as owed, NOT paid out', payout?.status === 'accrued')
    const after = await getCreatorEarnings(vendorId)
    s.check('their earnings screen reflects it', after.netCents === before.netCents + (payout?.net_cents ?? -1), `${before.netCents} → ${after.netCents}`)
    s.check('nothing is shown as already paid', after.paidCents === 0)
    s.check('the fee is a real number they can see', after.feeCents === (payout?.fee_cents ?? -1), `${after.feeCents}`)

    // Job by job, so "where did the rest go" is answerable per piece, not as one lump.
    const lines = await getCreatorPayoutLines(vendorId)
    const line = lines.find((l) => l.workOrderId === job.orderId)
    s.check('the job appears in their earnings breakdown', !!line, `${lines.length} lines`)
    s.check('the breakdown names the job', (line?.title ?? '').includes('SIM Photo Day'), line?.title)
    s.check('the breakdown names the restaurant', !!line?.restaurantName, line?.restaurantName)
    s.check('the breakdown adds up (fee + net = what the job paid)', !!line && line.feeCents + line.netCents === line.grossCents, JSON.stringify(line))
    s.check('the breakdown shows it as owed, not paid', line?.status === 'accrued')

    // Finished work leaves the calendar so it stops nagging them.
    s.check('a finished job drops off their calendar', !(await calendarForCreator(vendorId)).some((c) => c.id === job.orderId))

    // ───────────────────────────────────────────────────────────────────────────
    s.group('11. an offer with several deliveries')
    const multi = shootOffer({
      slug: `sim-reels-${STAMP}`, title: 'SIM Reel Pack', priceCents: 45000, slotMinutes: null,
      options: [], intake: [],
      deliveries: [
        { id: 'd1', label: 'Reel 1' },
        { id: 'd2', label: 'Reel 2', offsetDays: 7 },
        { id: 'd3', label: 'Reel 3', offsetDays: 14 },
      ],
    })
    const multiId = await publishOffer(a, vendorId, multi)
    const mSched = await getVendorScheduleBySlug(slug)
    const mPick = mSched.slots.find((x) => x.date > pick.date) ?? mSched.slots[0]
    const mBooking = await bookSlot(a, {
      vendorId, vendorSlug: slug, listingId: multiId, listingSlug: multi.slug, listingTitle: multi.title,
      ruleId, date: mPick.date, start: mPick.start, end: mPick.end, timezone: mPick.timezone,
    })
    bookingIds.push(mBooking)
    await acceptBooking(a, mBooking)
    const pieces = (await workOrdersForBookings([mBooking]))[mBooking] ?? []
    s.check('each delivery becomes its own tracked piece', pieces.length === 3, `${pieces.length} pieces`)
    s.check('the pieces are in order', pieces.map((p) => p.title).join(' | ').includes('Reel 1'))
    const sum = pieces.reduce((t, p) => t + p.amountCents, 0)
    s.check('the price splits across them with nothing lost', sum === 45000, `${sum} of 45000`)
    s.check('each piece has its own due date', new Set(pieces.map((p) => p.dueDate)).size === 3, pieces.map((p) => p.dueDate).join(', '))
    s.check('the later reels are due later', (pieces[2].dueDate ?? '') > (pieces[0].dueDate ?? ''))
    // The whole point of the list order: the next thing they owe someone is at the top.
    const queue = (await listWorkOrdersForCreator(vendorId)).filter((o) => o.status !== 'approved' && o.status !== 'declined' && o.dueDate)
    const dates = queue.map((o) => o.dueDate ?? '')
    s.check('their list puts the soonest job first', dates.join() === [...dates].sort().join(), dates.join(' | '))
    s.check('all three land on their calendar', (await calendarForCreator(vendorId)).filter((c) => pieces.some((p) => p.orderId === c.id)).length === 3)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('12. the other ways they can be hired')
    // Remote work with a turnaround (no calendar).
    const asyncB = await bookSimple(a, {
      vendorId, vendorSlug: slug, listingId, listingSlug: offer.slug, listingTitle: 'SIM Remote Edit',
      tierName: null, intake: {}, shape: 'async',
    }, { slot_date: isoIn(10) })
    bookingIds.push(asyncB)
    await mintBookingWorkOrder(asyncB)
    const asyncWork = (await workOrdersForBookings([asyncB]))[asyncB] ?? []
    s.check('remote work reaches them too', asyncWork.length === 1)
    s.check('remote work has a deadline, not a time slot', asyncWork[0]?.dueDate === isoIn(10))
    s.check('remote work shows as a deadline on the calendar',
      (await calendarForCreator(vendorId)).find((c) => c.id === asyncWork[0]?.orderId)?.kind === 'work')

    // A monthly plan.
    const recurB = await bookSimple(a, {
      vendorId, vendorSlug: slug, listingId, listingSlug: offer.slug, listingTitle: 'SIM Monthly Social',
      tierName: null, intake: {}, shape: 'recurring',
    }, { slot_date: isoIn(3) })
    bookingIds.push(recurB)
    await mintBookingWorkOrder(recurB, { month: 1, dueDateISO: isoIn(3) })
    s.check('a monthly plan starts month 1', ((await workOrdersForBookings([recurB]))[recurB] ?? []).length === 1)
    await mintBookingWorkOrder(recurB, { month: 2, dueDateISO: isoIn(33) })
    const recurWork = (await workOrdersForBookings([recurB]))[recurB] ?? []
    s.check('month 2 is separate work, not a duplicate', recurWork.length === 2, `${recurWork.length}`)
    s.check('the months are labelled', recurWork.some((w) => /month/i.test(w.title)), recurWork.map((w) => w.title).join(' | '))

    // A custom quote: no price until they name one, so nothing to work on yet.
    const quoteB = await bookSimple(a, {
      vendorId, vendorSlug: slug, listingId, listingSlug: offer.slug, listingTitle: 'SIM Custom Job',
      tierName: null, intake: {}, shape: 'quote', quoteStatus: 'requested',
    }, { status: 'held' })
    bookingIds.push(quoteB)
    await mintBookingWorkOrder(quoteB)
    s.check('a quote request does not become work until it is priced', ((await workOrdersForBookings([quoteB]))[quoteB] ?? []).length === 0)

    // ───────────────────────────────────────────────────────────────────────────
    s.group('13. safety rails')
    const dupBefore = ((await workOrdersForBookings([bId]))[bId] ?? []).length
    await mintBookingWorkOrder(bId)
    s.check('the same booking never mints twice', ((await workOrdersForBookings([bId]))[bId] ?? []).length === dupBefore)

    await voidBookingWorkOrder(mBooking)
    const voided = await a.from('creator_work_orders').select('status').like('campaign_piece_key', `booking:${mBooking}%`)
    s.check('cancelling a booking calls off the work', (voided.data ?? []).every((r) => r.status === 'declined'), JSON.stringify(voided.data))

    // A creator who is taken offline stops taking bookings, but keeps their own workspace.
    await a.from('vendors').update({ bookable: false }).eq('id', vendorId)
    s.check('taken offline, they cannot be booked', (await vendorIdForSlug(slug)) === null)
    s.check('taken offline, they still see their own work', (await listWorkOrdersForCreator(vendorId)).length > 0)
    s.check('taken offline, their hours still exist', !!(await getVendorRule(vendorId)))
  } finally {
    // ── cleanup: leave the database exactly as we found it ──────────────────
    const admin = createAdminClient()
    if (bookingIds.length) {
      await admin.from('creator_work_orders').delete().in('campaign_piece_key', await keysFor(admin, bookingIds))
      await admin.from('bookings').delete().in('id', bookingIds)
    }
    if (vendorId) {
      const { data: orders } = await admin.from('creator_work_orders').select('id').eq('creator_id', vendorId)
      const ids = (orders ?? []).map((o) => o.id as string)
      if (ids.length) {
        await admin.from('creator_payouts').delete().in('work_order_id', ids)
        await admin.from('campaign_charges').delete().in('work_order_id', ids)
        await admin.from('creator_work_orders').delete().in('id', ids)
      }
      await admin.from('availability_rules').delete().eq('scope_kind', 'vendor').eq('scope_id', vendorId)
      await admin.from('vendor_listings').delete().eq('vendor_id', vendorId)
      await admin.from('vendors').delete().eq('id', vendorId)
    }
    if (userId) {
      await admin.from('creator_logins').delete().eq('person_id', userId)
      await admin.auth.admin.deleteUser(userId).catch(() => {})
    }
  }

  const ok = s.report('Creator journey — sign up, get found, get booked, get paid')
  process.exit(ok ? 0 : 1)
}

/** Every piece key belonging to these bookings (so cleanup catches multi-delivery + monthly rows). */
async function keysFor(a: Admin, bookingIds: string[]): Promise<string[]> {
  const { data } = await a.from('creator_work_orders').select('campaign_piece_key')
    .or(bookingIds.map((id) => `campaign_piece_key.like.booking:${id}*`).join(','))
  return (data ?? []).map((r) => r.campaign_piece_key as string).filter(Boolean)
}

async function one(a: Admin, orderId: string): Promise<{ status: string; delivered_url: string | null }> {
  const { data } = await a.from('creator_work_orders').select('status, delivered_url').eq('id', orderId).single()
  return { status: (data?.status as string) ?? '', delivered_url: (data?.delivered_url as string) ?? null }
}

/** An ISO day n days from today (UTC), for deadlines. */
function isoIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
