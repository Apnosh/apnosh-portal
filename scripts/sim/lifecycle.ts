/**
 * Pure-logic lifecycle simulator. Drives the REAL date engine, creator matcher,
 * mint row-builder, and campaign composer across a matrix of campaign shapes +
 * a deterministic fuzz sweep, asserting the lifecycle invariants. No DB, no
 * browser, runs in milliseconds. Run:  npx tsx scripts/sim/lifecycle.ts
 */
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { creativeRolesForCampaign, vibeForCampaign, creatorPool, disciplineForType, type Disc } from '@/lib/campaigns/creators'
import { buildWorkOrderRows, planCampaignPieces, workOrderRowForPiece, teamDraftRowForPiece, briefInstructions, buildBridgeDraftRow, buildChargeRow, computePayout, buildPayoutRow, findUnaccrued, reconcileProductionPlan, validateTransition, safeHref } from '@/lib/campaigns/work-orders-core'
import { composeCampaign } from '@/lib/campaigns/campaign-composer'
import { buildContentLine, beatsFromLines, isOnSitePiece, shootDaysFromLines, campaignBill, SOLO_VISIT_SURCHARGE_CENTS, AI_DRAFT_CENTS, CONTENT_META, reconcileBeatsToLines } from '@/lib/campaigns/catalog'
import { CAMPAIGN_TEMPLATES } from '@/lib/campaigns/data/campaign-templates'
import { summarize } from '@/lib/campaigns/types'
import type { CampaignBrief, CampaignDraft, ContentBeat, LineItem, PieceBrief, PieceProducer } from '@/lib/campaigns/types'
import type { SavedCampaign } from '@/lib/campaigns/view'
import { draftFromBuilder } from '@/lib/campaigns/builder/adapter'
import { composePlanCampaign } from '@/lib/campaigns/builder/plan-checkout'
import { draftNeedsShoot, requiredBookingGates } from '@/lib/campaigns/gates/derive'
import { draftSourceCatalogIds, unbuyableCatalogIds } from '@/lib/campaigns/data/catalog-availability'
import { shipBillingGate } from '@/lib/campaigns/ship-guard'
import { withServiceFee, plainCostNote, passthroughMonthlyMinimumCents } from '@/lib/campaigns/builder/item-prices'
import { selectHomeOrders, HOME_ORDERS_CAP } from '@/lib/campaigns/home-cards'
import { campaignCardVM, type CampCard } from '@/lib/campaigns/view'
import { Suite, pick } from './lib'

// Fixed "ship moment" so every run is deterministic.
const SHIP = '2026-06-24T12:00:00Z'
const TODAY = '2026-06-24'
const notPast = (iso: string | null) => !!iso && iso >= TODAY

// ── input factory ──────────────────────────────────────────────────────
interface Spec {
  name: string
  content: string[]          // content type keys -> LineItems
  beats?: number             // contentBeats count (defaults to content.length)
  goalKey?: string
  occasion?: string
  targetDate?: string
  creatorChoices?: Record<string, string>
  producerChoices?: Record<string, PieceProducer>   // per-piece service routing
  creatorAll?: boolean       // route every creative piece to a creator (mint-path tests)
  creativeControl?: string
  excludeIdx?: number[]      // indices to mark included:false
}

function campaignFor(s: Spec): SavedCampaign {
  const items: LineItem[] = s.content
    .map((t, i) => {
      const li = buildContentLine(t, `li-${i}`)
      if (li && s.excludeIdx?.includes(i)) li.included = false
      return li
    })
    .filter((x): x is LineItem => x !== null)

  const n = s.beats ?? s.content.length
  const beats: ContentBeat[] = Array.from({ length: n }, (_, i) => ({
    week: i + 1, type: pick(s.content.length ? s.content : ['post'], i), label: `Beat ${i + 1}`, channel: 'instagram',
  }))

  const brief = { templateId: 'sim', objective: 'Win the slow shift', contentBeats: beats } as unknown as CampaignBrief
  const draft: CampaignDraft = {
    id: 'sim-' + s.name.replace(/\s+/g, '-'), name: s.name, path: 'ai', items,
    goalKey: s.goalKey as CampaignDraft['goalKey'], occasion: s.occasion, targetDate: s.targetDate, brief,
  } as CampaignDraft

  const camp: SavedCampaign = { clientId: 'sim-client', draft, phase: 'build', status: 'draft', shippedAt: null, createdAt: SHIP, updatedAt: SHIP, creatorChoices: s.creatorChoices ?? {}, producerChoices: s.producerChoices ?? {}, creativeControl: (s.creativeControl as SavedCampaign['creativeControl']) ?? 'handoff', execution: {} }
  // Team is the default producer, so the mint-path tests opt every creative piece
  // into a creator explicitly (what the Phase 1b toggle will do per piece).
  if (s.creatorAll) {
    const choices: Record<string, PieceProducer> = { ...camp.producerChoices }
    for (const p of planCampaignPieces(camp, SHIP)) if (p.key) choices[p.key] = 'creator'
    camp.producerChoices = choices
  }
  return camp
}

const s = new Suite()

// ── A. date engine ─────────────────────────────────────────────────────
s.group('deriveSchedule — never promises a past date')
for (const c of [
  { name: 'event mode', input: { targetDate: '2026-08-15', occasion: 'grand reopening', contentBeats: beatsN(4) }, tooSoon: false },
  { name: 'start mode (no occasion)', input: { targetDate: '2026-08-15', contentBeats: beatsN(4) }, tooSoon: false },
  { name: 'estimate mode (no date)', input: { contentBeats: beatsN(3) }, tooSoon: false },
  { name: 'year boundary', input: { targetDate: '2027-01-03', occasion: 'NYE', contentBeats: beatsN(2) }, tooSoon: false },
  { name: 'too-soon (target tomorrow)', input: { targetDate: '2026-06-25', occasion: 'event', contentBeats: beatsN(4) }, tooSoon: true },
]) {
  const d = deriveSchedule(c.input as Parameters<typeof deriveSchedule>[0], SHIP)
  s.check(`${c.name}: firstDraft = firstPost − 3d`, minus3(d.firstPostISO) === d.firstDraftISO, `${d.firstDraftISO} vs ${d.firstPostISO}`)
  s.eq(`${c.name}: tooSoon flag`, d.tooSoon, c.tooSoon)
  if (!c.tooSoon) {
    s.check(`${c.name}: firstPost not in past`, notPast(d.firstPostISO), d.firstPostISO)
    s.check(`${c.name}: firstDraft not in past`, notPast(d.firstDraftISO), d.firstDraftISO)
  }
  s.check(`${c.name}: beats are dated + ordered`, isMonotonic(d.beats.map((b) => b.postISO)))
}

// ── B. creator matching ────────────────────────────────────────────────
s.group('creativeRolesForCampaign — discipline coverage + overrides')
const vibe = vibeForCampaign('acquire', 'event')
const items3 = lines(['reel', 'photo', 'post'])
s.eq('reel+photo+post → 3 disciplines', disciplines(creativeRolesForCampaign(items3, {}, vibe)), ['Video', 'Photo', 'Design'])
s.eq('post only → Design', disciplines(creativeRolesForCampaign(lines(['post']), {}, vibe)), ['Design'])
s.eq('email+sms → no creative work', disciplines(creativeRolesForCampaign(lines(['email', 'sms']), {}, vibe)), [])
{
  const roles = creativeRolesForCampaign(items3, { Video: 'v_maya' }, vibe)
  const v = roles.find((r) => r.discipline === 'Video')!
  s.check('override is honored', v.creator.id === 'v_maya' && v.reason === 'Your pick', `${v.creator.id}/${v.reason}`)
}
{
  const roles = creativeRolesForCampaign(items3, { Video: 'ghost_does_not_exist' }, vibe)
  const v = roles.find((r) => r.discipline === 'Video')!
  s.check('bad override falls back to a real ranked creator', !!v.creator.id && v.recommended === true, v.creator.id)
}
{
  // index 0 (reel) excluded → Video drops, Photo+Design remain
  const its = lines(['reel', 'photo', 'post']); its[0].included = false
  s.eq('excluded item drops its discipline', disciplines(creativeRolesForCampaign(its, {}, vibe)), ['Photo', 'Design'])
}
s.eq('story → Social discipline (not Video)', disciplines(creativeRolesForCampaign(lines(['story']), {}, vibe)), ['Social'])
s.eq('reel+story+post → Video, Social, Design', disciplines(creativeRolesForCampaign(lines(['reel', 'story', 'post']), {}, vibe)), ['Video', 'Social', 'Design'])
s.check('story creator comes from the Social pool', creatorPool('Social').some((c) => c.id === creativeRolesForCampaign(lines(['story']), {}, vibe)[0].creator.id))

// ── C. bill = calendar = production (every template) ────────────────────
s.group('composeCampaign — bill = calendar = production')
for (const t of CAMPAIGN_TEMPLATES) {
  const { brief, items } = composeCampaign(t, {})
  const beats = brief.contentBeats
  const everyTypeKnown = beats.every((b) => !!CONTENT_META[b.type])
  s.check(`${t.id}: every beat type is priceable`, everyTypeKnown, beats.filter((b) => !CONTENT_META[b.type]).map((b) => b.type).join(',') || 'ok')
  const contentQty = items.filter((it) => it.serviceId?.startsWith('content-')).reduce((n, it) => n + (it.qty ?? 1), 0)
  s.eq(`${t.id}: billed pieces == calendar beats`, contentQty, beats.length)
}

// ── D. buildWorkOrderRows — the real mint logic ────────────────────────
s.group('buildWorkOrderRows — ship dispatches honest orders')
{
  const camp = campaignFor({ name: 'Full mix', content: ['reel', 'photo', 'post'], beats: 3, targetDate: '2026-08-15', occasion: 'event', creatorAll: true })
  const rows = buildWorkOrderRows(camp, SHIP)
  s.eq('3 disciplines → 3 orders', rows.length, 3)
  s.check('every order starts offered', rows.every((r) => r.status === 'offered'))
  s.check('every due date is not in past', rows.every((r) => notPast(r.due_date)), rows.map((r) => r.due_date).join(','))
  s.check('earliest order due == schedule firstPost', [...rows.map((r) => r.due_date)].filter(Boolean).sort()[0] === deriveSchedule({ targetDate: '2026-08-15', occasion: 'event', contentBeats: beatsN(3) } as Parameters<typeof deriveSchedule>[0], SHIP).firstPostISO)
  s.check('build is deterministic (idempotent shape)', JSON.stringify(rows) === JSON.stringify(buildWorkOrderRows(camp, SHIP)))
}
{
  const camp = campaignFor({ name: 'No visual', content: ['email', 'sms'], beats: 3 })
  const rows = buildWorkOrderRows(camp, SHIP)
  s.eq('email/sms campaign → 0 orders (route dead-letter guard territory)', rows.length, 0)
}
{
  const camp = campaignFor({ name: 'Owner pick', content: ['reel', 'photo'], creatorChoices: { Video: 'v_maya' }, creatorAll: true })
  const rows = buildWorkOrderRows(camp, SHIP)
  s.check('owner pick reaches the order', rows.find((r) => r.discipline === 'Video')?.creator_id === 'v_maya')
}

// ── D2. planCampaignPieces — one producer per piece (kills double-production) ──
s.group('planCampaignPieces — hybrid routing, no piece made twice')
{
  // Team is the default: an untouched creative campaign stays fully in-house, so
  // nothing strands in the (still seeded) creator pool.
  const camp = campaignFor({ name: 'All creative, default', content: ['reel', 'photo', 'post'], beats: 3 })
  const pieces = planCampaignPieces(camp, SHIP)
  const team = pieces.filter((p) => p.producer === 'team')
  const creator = pieces.filter((p) => p.producer === 'creator')
  s.check('every piece resolves to exactly one producer', pieces.length > 0 && pieces.every((p) => p.producer === 'team' || p.producer === 'creator'))
  s.eq('team + creator partition the calendar (no double, no drop)', team.length + creator.length, pieces.length)
  s.check('default keeps creative pieces in-house (team)', team.length === pieces.length && creator.length === 0)
  s.eq('mint lane is empty by default (nothing stranded in the pool)', buildWorkOrderRows(camp, SHIP).length, 0)
}
{
  // The same campaign with every creative piece opted INTO a creator: now the whole
  // calendar is the creator lane, and the mint lane equals it exactly.
  const camp = campaignFor({ name: 'All creative, opted-in', content: ['reel', 'photo', 'post'], beats: 3, creatorAll: true })
  const pieces = planCampaignPieces(camp, SHIP)
  const creator = pieces.filter((p) => p.producer === 'creator')
  s.check('opted-in pieces carry creator + discipline + slot', creator.every((p) => !!p.creatorId && !!p.discipline && p.slot !== null))
  s.eq('mint lane == creator slice exactly (materialize + mint cannot overlap)', buildWorkOrderRows(camp, SHIP).length, creator.length)
  s.eq('every creative piece is now a creator order', creator.length, pieces.length)
}
{
  const camp = campaignFor({ name: 'Mixed creative + email', content: ['reel', 'email'], beats: 2 })
  const pieces = planCampaignPieces(camp, SHIP)
  const reel = pieces.find((p) => p.type === 'reel')
  s.check('the reel is team-run by default (in-house)', reel?.producer === 'team' && !reel.creatorId)
  s.check('any non-creative (email) piece is team-run, no creator', pieces.filter((p) => p.type === 'email').every((p) => p.producer === 'team' && !p.creatorId))
}
{
  // Opting one piece INTO a creator must move it across the line — and the mint lane follows.
  const flipped = campaignFor({ name: 'One to creator', content: ['reel', 'reel'], beats: 2, producerChoices: { 'Video:1': 'creator' } })
  const fp = planCampaignPieces(flipped, SHIP)
  s.eq('Video:1 → creator makes exactly one order', fp.filter((p) => p.producer === 'creator').length, 1)
  const flippedPiece = fp.find((p) => p.key === 'Video:1')
  s.check('the flipped piece is the 2nd video, now creator', flippedPiece?.producer === 'creator' && !!flippedPiece.creatorId)
  s.check('the untouched 1st video stays team', fp.find((p) => p.key === 'Video:0')?.producer === 'team')
  s.eq('mint follows the flip (1 order, not 0 or 2)', buildWorkOrderRows(flipped, SHIP).length, 1)
}
{
  // A stray choice for a piece that doesn't exist is harmless; non-creative stays team.
  const camp = campaignFor({ name: 'Stray choice', content: ['email', 'sms'], beats: 2, producerChoices: { 'Video:0': 'creator' } })
  const pieces = planCampaignPieces(camp, SHIP)
  s.check('stray producer choice never mis-routes a non-creative piece', pieces.every((p) => p.producer === 'team' && !p.creatorId))
  s.eq('no creative work → 0 creator orders', buildWorkOrderRows(camp, SHIP).length, 0)
}

// ── E. fuzz sweep — universal invariants over many shapes ──────────────
s.group('fuzz — universal invariants across many shapes')
const TYPES = ['reel', 'photo', 'post', 'story', 'email', 'sms']
const GOALS = ['acquire', 'retain', 'capacity', 'reviews', 'launch']
let fuzzFails = 0
for (let i = 0; i < 60; i++) {
  const k = 1 + (i % 4)
  const content = Array.from({ length: k }, (_, j) => pick(TYPES, i * 3 + j))
  const targetDate = i % 3 === 0 ? undefined : addDays(TODAY, 14 + (i % 40))
  // Opt creative pieces into creators so the mint invariants run on real orders.
  const camp = campaignFor({ name: `fuzz-${i}`, content, beats: k, goalKey: pick(GOALS, i), occasion: i % 2 ? 'event' : undefined, targetDate, creatorAll: true })
  const rows = buildWorkOrderRows(camp, SHIP)
  const pieces = planCampaignPieces(camp, SHIP)
  const creatorPieces = pieces.filter((p) => p.producer === 'creator')
  const sched = deriveSchedule({ targetDate, occasion: i % 2 ? 'event' : undefined, contentBeats: beatsN(k) } as Parameters<typeof deriveSchedule>[0], SHIP)
  const ok =
    rows.every((r) => r.status === 'offered') &&
    rows.every((r) => !!r.creator_id && !!r.discipline && !!r.title) &&
    (sched.tooSoon || rows.every((r) => notPast(r.due_date))) &&
    pieces.every((p) => p.producer === 'team' || p.producer === 'creator') &&   // exactly one producer each
    rows.length === creatorPieces.length                                        // mint lane == creator slice (no overlap with team)
  if (!ok) { fuzzFails++; if (fuzzFails <= 3) s.check(`fuzz-${i} invariant`, false, JSON.stringify({ content, rows: rows.map((r) => [r.discipline, r.due_date]) })) }
}
s.check(`60 random campaigns all hold invariants`, fuzzFails === 0, fuzzFails ? `${fuzzFails} failed` : undefined)

// ── E2. producer_choices is actually applied (a planner that ignored it fails) ──
s.group('planCampaignPieces — producer_choices re-routes, not ignored')
{
  const CREATIVE = ['reel', 'photo', 'post', 'story']
  let flipFails = 0, flipsRun = 0
  for (let i = 0; i < 40; i++) {
    const k = 1 + (i % 4)
    const content = Array.from({ length: k }, (_, j) => pick(CREATIVE, i * 2 + j))
    const targetDate = addDays(TODAY, 10 + (i % 30))
    const base = campaignFor({ name: `flip-${i}`, content, beats: k, goalKey: pick(GOALS, i), targetDate })
    const target = planCampaignPieces(base, SHIP).find((p) => p.discipline && p.producer === 'team')   // a creative team piece (the default)
    if (!target?.key) continue
    flipsRun++
    const before = buildWorkOrderRows(base, SHIP).length
    const camp2 = campaignFor({ name: `flip-${i}`, content, beats: k, goalKey: pick(GOALS, i), targetDate, producerChoices: { [target.key]: 'creator' } })
    const after = buildWorkOrderRows(camp2, SHIP).length
    const moved = planCampaignPieces(camp2, SHIP).find((p) => p.key === target.key)
    // A planner that ignored producer_choices would leave it team → after === before.
    if (!(moved?.producer === 'creator' && !!moved.creatorId && after === before + 1)) flipFails++
  }
  s.check(`opting one piece into a creator adds exactly one order (${flipsRun} shapes)`, flipFails === 0 && flipsRun > 0, `fails=${flipFails} run=${flipsRun}`)
}

// ── E3. per-beat discipline (planner) == per-line discipline (creator seeding) ──
s.group('disciplineForType == role discipline (planner and seeding agree)')
{
  for (const t of Object.keys(CONTENT_META)) {
    const line = buildContentLine(t, `li-${t}`)
    const roleDisc = line ? (creativeRolesForCampaign([line], {}, null)[0]?.discipline ?? null) : null
    const beatDisc = disciplineForType(t)
    s.check(`${t}: planner discipline (${beatDisc ?? 'none'}) == seeding discipline (${roleDisc ?? 'none'})`, beatDisc === roleDisc)
  }
}

// ── E4. publish bridge row — approved creator piece → team finalization draft ──
s.group('buildBridgeDraftRow — approved piece becomes a team draft (not auto-publishable)')
{
  const row = buildBridgeDraftRow({ client_id: 'c1', campaign_id: 'camp1', title: 'Hero reel', due_date: '2026-07-10', delivered_url: 'https://x.com/a.mp4', brief_details: { creative: { caption: 'Taste it', hashtags: ['#a', '#b'] } } })
  s.check('lands as a team draft (team finalizes + schedules, never auto-posted)', row.status === 'draft')
  s.eq('the delivery LINK stays OUT of media_urls (not platform media)', row.media_urls.length, 0)
  s.eq('the link is kept in the media brief for the team to fetch', row.media_brief.source_delivery_url, 'https://x.com/a.mp4')
  s.check('flagged creator-sourced', row.media_brief.from_creator === true)
  s.eq('brief caption carries over', row.caption, 'Taste it')
  s.eq('brief hashtags carry over', row.hashtags.join(','), '#a,#b')
  s.eq('due date becomes the publish date', row.target_publish_date, '2026-07-10')
  s.eq('idea from the order title', row.idea, 'Hero reel')
  s.check('routed to the social service line', row.service_line === 'social')
}
{
  // Garbage creative + unsafe link + no title degrade safely (no crash, sane defaults).
  const row = buildBridgeDraftRow({ client_id: 'c1', campaign_id: null, delivered_url: 'javascript:alert(1)', brief_details: { creative: { caption: 'x'.repeat(5000), hashtags: 'nope' as unknown as string[] } } })
  s.check('oversized caption is capped (not dropped)', (row.caption?.length ?? 0) === 2200)
  s.eq('non-array hashtags → empty', row.hashtags.length, 0)
  s.eq('media is never a bare link', row.media_urls.length, 0)
  s.check('an unsafe delivery link is dropped, not stored', !row.media_brief.source_delivery_url)
  s.eq('no title → fallback idea', row.idea, 'Creator piece')
  s.check('null campaign + no due tolerated', row.campaign_id === null && row.target_publish_date === null)
}

// ── E5. owner pricing — amount stamped at ship, accrued on approval ──
s.group('owner pricing — per-piece amount + accrued charge')
{
  const camp = campaignFor({ name: 'Priced', content: ['reel', 'photo', 'post'], beats: 3, creatorAll: true })
  const rows = buildWorkOrderRows(camp, SHIP)
  const amt = (d: string) => rows.find((r) => r.discipline === d)?.amount_cents
  s.eq('reel piece priced at $120 (CONTENT_META)', amt('Video'), 12000)
  s.eq('photo piece priced at $65', amt('Photo'), 6500)
  s.eq('post piece priced at $70', amt('Design'), 7000)
  s.check('every creator order carries a positive price', rows.length > 0 && rows.every((r) => r.amount_cents > 0))
  const creatorPieces = planCampaignPieces(camp, SHIP).filter((p) => p.producer === 'creator')
  s.check('planned creator pieces carry the same priceCents', creatorPieces.every((p) => p.priceCents > 0))
}
{
  // The accrued amount follows the owner's EDITED line price, not the catalog default,
  // so the charge can never diverge from the quoted plan. (A brief/builder campaign does
  // not batch, so a lone reel is its base price — no solo-visit surcharge.)
  const camp = campaignFor({ name: 'Edited price', content: ['reel'], beats: 1, creatorAll: true })
  const reelLine = camp.draft.items.find((it) => it.serviceId === 'content-reel')
  if (reelLine) reelLine.price = 200   // owner bumped the reel to $200
  const rows = buildWorkOrderRows(camp, SHIP)
  s.eq('order amount follows the edited line price ($200, not catalog $120)', rows[0]?.amount_cents, 20000)
}
{
  const charge = buildChargeRow({ id: 'wo1', client_id: 'c1', campaign_id: 'camp1', amount_cents: 12000 })
  s.eq('charge accrues the order amount', charge.amount_cents, 12000)
  s.check('charge starts accrued, creator-sourced, linked to its order', charge.status === 'accrued' && charge.source === 'creator' && charge.work_order_id === 'wo1')
  const z = buildChargeRow({ id: 'wo2', client_id: 'c1', campaign_id: null, amount_cents: -5 })
  s.eq('a negative/garbage amount floors to 0', z.amount_cents, 0)
  s.check('null campaign tolerated on a charge', z.campaign_id === null)
}

// ── E6. creator payout — net = gross minus the take-rate ──
s.group('creator payout — fee split + accrual')
{
  const { feeCents, netCents } = computePayout(12000, 20)
  s.eq('20% of $120 → $24 fee', feeCents, 2400)
  s.eq('creator nets $96', netCents, 9600)
  s.eq('fee + net == gross (no cents lost)', feeCents + netCents, 12000)
  s.eq('0% fee → creator gets it all', computePayout(10000, 0).netCents, 10000)
  s.eq('100% fee → creator nets 0', computePayout(10000, 100).netCents, 0)
  s.eq('a >100% fee clamps (net never negative)', computePayout(10000, 250).netCents, 0)
}
{
  const row = buildPayoutRow({ id: 'wo1', client_id: 'c1', campaign_id: 'camp1', creator_id: 'v_maya', amount_cents: 12000 }, 20)
  s.eq('payout gross == order amount', row.gross_cents, 12000)
  s.eq('payout net == gross - fee', row.net_cents, 9600)
  s.eq('payout fee == take-rate cut', row.fee_cents, 2400)
  s.check('starts accrued, linked to the order + creator', row.status === 'accrued' && row.work_order_id === 'wo1' && row.creator_id === 'v_maya')
  const z = buildPayoutRow({ id: 'wo2', client_id: 'c1', campaign_id: null, creator_id: 'v_x', amount_cents: -5 }, 20)
  s.eq('garbage gross floors to 0', z.gross_cents, 0)
  s.eq('zero gross → zero net', z.net_cents, 0)
}
{
  // Cross-ledger reconciliation: ONE order → the owner charge and the creator payout
  // must agree on the gross, so money-in and money-out can never drift.
  const order = { id: 'wo9', client_id: 'c1', campaign_id: 'camp1', creator_id: 'v_maya', amount_cents: 9999 }
  const charge = buildChargeRow(order)
  const payout = buildPayoutRow(order, 20)
  s.eq('charge-in gross == payout-out gross (same order)', charge.amount_cents, payout.gross_cents)
  s.eq('and both == the order amount', payout.gross_cents, 9999)
}
{
  // Cent conservation across fractional rates + odd grosses (the DB CHECK backstops it).
  let bad = 0
  for (const gross of [4, 333, 9999, 12345, 1]) {
    for (const pct of [12.5, 33.33, 7.77, 99.99, 0, 100]) {
      const { feeCents, netCents } = computePayout(gross, pct)
      if (feeCents + netCents !== gross || feeCents < 0 || netCents < 0 || feeCents > gross) bad++
    }
  }
  s.eq('fee + net == gross for every fractional rate × odd gross (no cent lost)', bad, 0)
}

// ── E7. reconcile sweep — find dropped accruals (Phase 5 safety net) ──
s.group('findUnaccrued — recovers gaps, skips present + unpriced')
{
  const approved = [
    { id: 'a', amount_cents: 12000 },  // missing both
    { id: 'b', amount_cents: 6500 },   // has charge, missing payout
    { id: 'c', amount_cents: 7000 },   // has both
    { id: 'd', amount_cents: 0 },      // unpriced → never accrued
  ]
  const { needCharge, needPayout } = findUnaccrued(approved, new Set(['b', 'c']), new Set(['c']))
  s.check('needs charge: only the order with no charge', needCharge.length === 1 && needCharge[0] === 'a')
  s.check('needs payout: the two without a payout', needPayout.length === 2 && needPayout.includes('a') && needPayout.includes('b'))
  s.check('an unpriced order is never accrued', !needCharge.includes('d') && !needPayout.includes('d'))
}
{
  const { needCharge, needPayout } = findUnaccrued([{ id: 'x', amount_cents: 5000 }], new Set(['x']), new Set(['x']))
  s.eq('fully-accrued → no charge gaps', needCharge.length, 0)
  s.eq('fully-accrued → no payout gaps', needPayout.length, 0)
}

// ── E8. reconcileProductionPlan — add/revive/void/re-date, protect + flag in-flight ──
s.group('reconcileProductionPlan — full reconcile, never disrupts in-flight work')
{
  const camp = campaignFor({ name: 'Recon', content: ['reel', 'reel', 'email'], beats: 3, creatorAll: true })
  const plan = planCampaignPieces(camp, SHIP)   // creator Video:0, Video:1; team email:0
  const v0 = plan.find((p) => p.key === 'Video:0')!
  const existingOrders = [
    { id: 'o0', key: 'Video:0', status: 'offered', dueISO: v0.postISO },          // unchanged
    { id: 'o1', key: 'Video:1', status: 'declined', dueISO: '2099-01-01' },       // re-added cancelled slot → REVIVE (not duplicate)
    { id: 'o2', key: 'Video:2', status: 'offered', dueISO: '2099-01-01' },        // removed, not started → void
    { id: 'o3', key: 'Video:3', status: 'in_progress', dueISO: '2099-01-01' },    // removed but in flight → conflict (flag, never touch)
  ]
  const existingDrafts = [
    { id: 'd0', key: 'email:0', status: 'idea', dateISO: '2099-01-01' },          // still planned, wrong date → re-date
    { id: 'dX', key: 'post:9', status: 'idea', dateISO: '2099-01-01' },           // removed, editorial → reject
    { id: 'dP', key: 'post:8', status: 'published', dateISO: '2099-01-01' },      // removed but live → conflict (flag)
  ]
  const r = reconcileProductionPlan(plan, existingOrders, existingDrafts, TODAY)
  s.check('does NOT duplicate Video:1 (its cancelled order is revived)', r.mintCreator.length === 0)
  s.check('revives the re-added cancelled slot (o1)', r.reviveOrderIds.length === 1 && r.reviveOrderIds[0].id === 'o1')
  s.check('voids the removed, not-started order (o2)', r.voidOrderIds.length === 1 && r.voidOrderIds[0] === 'o2')
  s.check('flags the in-flight removed order (o3), never voids it', r.conflicts.orderIds.includes('o3') && !r.voidOrderIds.includes('o3'))
  s.check('re-dates the moved editorial draft (d0)', r.redateDrafts.some((u) => u.id === 'd0'))
  s.check('does NOT re-date the unchanged order (o0)', !r.redateOrders.some((u) => u.id === 'o0'))
  s.check('rejects the removed editorial draft (dX)', r.archiveDraftIds.includes('dX'))
  s.check('flags the published removed draft (dP), never rejects it', r.conflicts.draftIds.includes('dP') && !r.archiveDraftIds.includes('dP'))
}
{
  // In-flight is locked from re-dating; a clamp-only past→today re-date is skipped.
  const piece = (key: string, slot: number, postISO: string) => ({ index: slot, type: 'reel', label: '', channel: '', postISO, discipline: 'Video' as const, slot, key, producer: 'creator' as const, creatorId: 'v_maya', priceCents: 12000, brief: null, shootDayId: null, soloSurchargeCents: 0 })
  const r1 = reconcileProductionPlan([piece('Video:0', 0, '2026-09-01')], [{ id: 'ob', key: 'Video:0', status: 'in_progress', dueISO: '2026-08-01' }], [], TODAY)
  s.check('an in_progress order is never re-dated', r1.redateOrders.length === 0)
  const r2 = reconcileProductionPlan([piece('Video:0', 0, TODAY)], [{ id: 'o', key: 'Video:0', status: 'offered', dueISO: '2000-01-01' }], [], TODAY)
  s.check('a clamp-only past→today re-date is skipped as churn', r2.redateOrders.length === 0)
  const r3 = reconcileProductionPlan([piece('Video:0', 0, '2026-09-01')], [{ id: 'o', key: 'Video:0', status: 'offered', dueISO: '2026-08-01' }], [], TODAY)
  s.check('a real date move on an offered order re-dates', r3.redateOrders.length === 1)
}
{
  const camp = campaignFor({ name: 'Stable', content: ['reel'], beats: 1, creatorAll: true })
  const plan = planCampaignPieces(camp, SHIP)
  const v0 = plan.find((p) => p.producer === 'creator')!
  const r = reconcileProductionPlan(plan, [{ id: 'o0', key: v0.key, status: 'offered', dueISO: v0.postISO }], [], TODAY)
  s.check('unchanged plan → no actions', r.mintCreator.length + r.reviveOrderIds.length + r.voidOrderIds.length + r.redateOrders.length + r.materializeTeam.length + r.archiveDraftIds.length + r.conflicts.orderIds.length === 0)
}

// ── F. bill = calendar = production after owner edits (guards #3, #4) ────
s.group('reconcileBeatsToLines — bill = calendar = production after edits')
{
  const beats = mkBeats([['reel', 2], ['post', 1]])
  s.eq('unedited campaign: reconcile is identity', reconcileBeatsToLines([mkLine('reel', 2), mkLine('post', 1)], beats).length, 3)

  const bumped = reconcileBeatsToLines([mkLine('reel', 4), mkLine('post', 1)], beats)
  s.eq('qty bump 2→4: reel beats follow the bill', bumped.filter((b) => b.type === 'reel').length, 4)
  s.eq('qty bump: total beats == billed occurrences', bumped.length, 5)

  const lowered = reconcileBeatsToLines([mkLine('reel', 1), mkLine('post', 1)], beats)
  s.eq('qty drop 2→1: production trims to the bill', lowered.filter((b) => b.type === 'reel').length, 1)

  const optedOut = reconcileBeatsToLines([mkLine('reel', 2), mkLine('post', 1, { optOut: true })], beats)
  s.check('opt-out: dropped type is not produced', !optedOut.some((b) => b.type === 'post'))
  s.eq('opt-out: total == kept billed pieces', optedOut.length, 2)

  const excluded = reconcileBeatsToLines([mkLine('reel', 2), mkLine('post', 1, { included: false })], beats)
  s.check('exclude: removed line is not produced', !excluded.some((b) => b.type === 'post'))
}

// ── G. no order is born overdue (guards #7) ─────────────────────────────
s.group('buildWorkOrderRows — due date clamped to ship day')
{
  const camp = campaignFor({ name: 'Event past', content: ['reel'], beats: 3, occasion: 'July 4', targetDate: '2026-07-04', creatorAll: true })
  const rows = buildWorkOrderRows(camp, '2026-07-06T15:00:00Z') // ship AFTER target → backward anchor would be in the past
  s.check('event anchored before ship: due >= ship day', rows.length > 0 && rows.every((r) => (r.due_date ?? '9999-99-99') >= '2026-07-06'), rows.map((r) => r.due_date).join(','))
}

// ── H. order status machine (guards #1) ─────────────────────────────────
s.group('validateTransition — legal walk + illegal jumps rejected')
s.check('offered → accepted', validateTransition('offered', 'accepted').ok)
s.check('accepted → in_progress', validateTransition('accepted', 'in_progress').ok)
s.check('in_progress → delivered (with link)', validateTransition('in_progress', 'delivered', 'https://x.com/a').ok)
s.check('delivered → approved', validateTransition('delivered', 'approved').ok)
s.check('delivered → revision', validateTransition('delivered', 'revision').ok)
s.check('offered → approved REJECTED (hijack)', !validateTransition('offered', 'approved').ok)
s.check('deliver with no link REJECTED', !validateTransition('in_progress', 'delivered', '').ok)
s.check('approved → in_progress REJECTED (terminal reopen)', !validateTransition('approved', 'in_progress').ok)
s.check('declined → accepted REJECTED', !validateTransition('declined', 'accepted').ok)
s.check('same-state no-op REJECTED', !validateTransition('offered', 'offered').ok)
s.check('start BLOCKED while concept pending', !validateTransition('accepted', 'in_progress', null, 'pending').ok)
s.check('start BLOCKED while concept changes', !validateTransition('accepted', 'in_progress', null, 'changes').ok)
s.check('start OK once concept approved', validateTransition('accepted', 'in_progress', null, 'approved').ok)
s.check('start OK when concept not gated (undefined)', validateTransition('accepted', 'in_progress').ok)

// ── I. delivered_url safety (guards #6) ─────────────────────────────────
s.group('safeHref — only http(s) becomes a clickable link')
s.check('https allowed', !!safeHref('https://drive.example.com/work.mp4'))
s.check('http allowed', !!safeHref('http://ok.com'))
s.check('javascript: blocked', safeHref('javascript:alert(1)') === null)
s.check('data: blocked', safeHref('data:text/html,<script>alert(1)</script>') === null)
s.check('schemeless blocked', safeHref('apno5h-review.tld/login') === null)
s.check('empty blocked', safeHref('') === null)

// ── J. creator override respects discipline (guards #10) ────────────────
s.group('creator override is discipline-scoped')
{
  const v2 = vibeForCampaign('launch', undefined)
  const its = lines(['reel', 'photo']) // Video + Photo
  const photoId = creatorPool('Photo')[0].id
  const crossed = creativeRolesForCampaign(its, { Video: photoId }, v2)
  const vRole = crossed.find((r) => r.discipline === 'Video')!
  s.check('cross-discipline override rejected', vRole.creator.id !== photoId)
  s.check('every order creator belongs to its discipline', crossed.every((r) => creatorPool(r.discipline as Disc).some((c) => c.id === r.creator.id)))
  const goodId = creatorPool('Video')[1]?.id ?? creatorPool('Video')[0].id
  s.check('valid same-discipline override honored', creativeRolesForCampaign(its, { Video: goodId }, v2).find((r) => r.discipline === 'Video')!.creator.id === goodId)
}

// ── L. per-piece minting (guards #8) ────────────────────────────────────
s.group('per-piece minting — each billed piece is its own order')
{
  const camp = campaignFor({ name: 'Two reels', content: ['reel', 'post'], beats: 2, targetDate: '2026-08-15', occasion: 'event' })
  camp.draft.items.find((it) => it.serviceId === 'content-reel')!.qty = 2 // owner bumped reels to 2
  // Opt the (now 2) reels + the post into creators — set after the qty bump so the
  // 2nd reel's slot (Video:1) is covered.
  camp.producerChoices = { 'Video:0': 'creator', 'Video:1': 'creator', 'Design:0': 'creator' }
  const rows = buildWorkOrderRows(camp, SHIP)
  s.eq('2 reels + 1 post → 3 orders', rows.length, 3)
  const video = rows.filter((r) => r.discipline === 'Video')
  s.eq('two Video orders, one per reel', video.length, 2)
  s.check('the two reel orders have distinct slots', new Set(video.map((r) => r.slot)).size === 2)
  s.check('the two reel orders have distinct due dates', new Set(video.map((r) => r.due_date)).size === 2)
}
{
  const camp = campaignFor({ name: 'Reel + story', content: ['reel', 'story'], beats: 2, targetDate: '2026-08-15', occasion: 'event', creatorAll: true })
  const rows = buildWorkOrderRows(camp, SHIP)
  s.eq('reel + story → 2 orders (not collapsed to 1)', rows.length, 2)
  s.eq('reel + story → two disciplines (Video + Social)', new Set(rows.map((r) => r.discipline)).size, 2)
}

// ── K. estimate-mode anchor stability (guards #11) ──────────────────────
s.group('estimate anchor: locking target_date removes preview→ship drift')
{
  const beats = beatsN(2)
  const preview = deriveSchedule({ contentBeats: beats } as Parameters<typeof deriveSchedule>[0], '2026-06-22T12:00:00Z').firstPostISO
  const ship = deriveSchedule({ contentBeats: beats } as Parameters<typeof deriveSchedule>[0], '2026-06-25T12:00:00Z').firstPostISO
  s.check('estimate mode DOES drift without an anchor (the bug)', preview !== ship, `${preview} vs ${ship}`)
  const a1 = deriveSchedule({ targetDate: ship!, contentBeats: beats } as Parameters<typeof deriveSchedule>[0], '2026-06-25T12:00:00Z').firstPostISO
  const a2 = deriveSchedule({ targetDate: ship!, contentBeats: beats } as Parameters<typeof deriveSchedule>[0], '2026-06-28T12:00:00Z').firstPostISO
  s.eq('anchored (start mode) is stable across ship timing', a1, a2)
}

// ── L. Content Menu: per-piece producer + brief, derived from lines, DIY is free ──
s.group('Content Menu: per-piece handler + brief route from the lines (no AI brief)')
{
  const menuCamp = (items: LineItem[], opts?: { creatorChoices?: Record<string, string>; targetDate?: string }): SavedCampaign => ({
    clientId: 'sim-client',
    draft: { id: 'menu-1', name: 'Taco Tuesday', path: 'ai', items, targetDate: opts?.targetDate } as unknown as CampaignDraft,
    phase: 'build', status: 'draft', shippedAt: null, createdAt: SHIP, updatedAt: SHIP,
    creatorChoices: opts?.creatorChoices ?? {}, producerChoices: {}, creativeControl: 'handoff', execution: {},
  })
  const mLine = (type: string, id: string, producer: PieceProducer, brief?: PieceBrief): LineItem =>
    buildContentLine(type, id, { producer, brief })!

  // A campaign with NO authored brief — the calendar must derive from the pieces.
  const reel = mLine('reel', 'li-reel', 'creator', { featuring: 'Birria tacos', offer: '$1 oysters til 6pm' })
  const photo = mLine('photo', 'li-photo', 'team', { featuring: 'Street corn' })
  const email = mLine('email', 'li-email', 'diy', { offer: 'Half-off Tuesdays' })
  const camp = menuCamp([reel, photo, email])
  const plan = planCampaignPieces(camp, SHIP)

  s.check('derives one piece per line with no brief.contentBeats', plan.length === 3)
  const byKey = new Map(plan.map((p) => [p.key, p]))
  // Each piece keys by its stable line id + index ("L#0") — the #-suffix is what keeps
  // a qty 2→1 shrink from re-keying piece #0.
  s.check('each piece keys by its stable per-piece id', byKey.has('li-reel#0') && byKey.has('li-photo#0') && byKey.has('li-email#0'))
  s.check('the reel honors its per-piece creator handler', byKey.get('li-reel#0')?.producer === 'creator' && !!byKey.get('li-reel#0')?.creatorId)
  s.check('the photo honors its per-piece team handler', byKey.get('li-photo#0')?.producer === 'team' && !byKey.get('li-photo#0')?.creatorId)
  s.check('the email honors its DIY handler', byKey.get('li-email#0')?.producer === 'diy')
  s.check('a DIY piece is priced at $0', byKey.get('li-email#0')?.priceCents === 0)
  s.check('a team/creator piece keeps its catalog price', byKey.get('li-reel#0')?.priceCents === CONTENT_META.reel.price * 100 && byKey.get('li-photo#0')?.priceCents === CONTENT_META.photo.price * 100)
  s.check('the brief threads onto the piece', byKey.get('li-reel#0')?.brief?.featuring === 'Birria tacos')

  // The creator order carries the stable key + the folded brief.
  const reelPiece = byKey.get('li-reel#0')!
  const row = workOrderRowForPiece(camp, reelPiece)
  s.check('creator order stamps the stable piece key', row?.campaign_piece_key === 'li-reel#0')
  s.check('creator order title leads with the dish', !!row && row.title.includes('Birria tacos'))
  s.check('creator order brief folds in featuring + offer', !!row && row.brief.includes('Feature: Birria tacos.') && row.brief.includes('$1 oysters'))
  s.check('a DIY piece is never a creator order', workOrderRowForPiece(camp, byKey.get('li-email#0')!) === null)

  // The bill: DIY is free, the rest sum honestly via the SAME summarize().
  const bill = summarize([reel, photo, email])
  s.eq('DIY zeroes its line in the honest bill', bill.oneTimeOnDelivery, CONTENT_META.reel.price + CONTENT_META.photo.price)

  // qty>1 clones the piece, sharing the brief, with distinct stable ids.
  const two = mLine('story', 'li-story', 'team', { featuring: 'Churros' }); two.qty = 2
  const beats = beatsFromLines([two])
  s.check('qty>1 clones the piece forward', beats.length === 2)
  s.check('clones share the brief but get distinct ids', beats[0].brief?.featuring === 'Churros' && beats[1].brief?.featuring === 'Churros' && beats[0].id !== beats[1].id)
  s.check('the beat label leads with the dish', beats[0].label.includes('Churros'))

  // Legacy campaigns (an authored brief) are untouched: positional keys, no per-piece brief.
  const legacy = campaignFor({ name: 'Legacy', content: ['reel'], beats: 1, creatorAll: true })
  const legacyPlan = planCampaignPieces(legacy, SHIP)
  s.check('a legacy campaign still keys positionally (group:slot)', legacyPlan.every((p) => /^[A-Za-z]+:\d+$/.test(p.key)))
  s.check('a legacy piece carries no per-piece brief', legacyPlan.every((p) => p.brief === null))
}

// ── M. Shoot Day batching: solo-visit surcharge melts when on-site pieces batch ──
s.group('Shoot Day: solo-visit surcharge that melts when on-site pieces batch')
{
  const SUR = SOLO_VISIT_SURCHARGE_CENTS
  s.check('the surcharge equals the real solo-vs-batched cost gap ($75)', SUR === 7500)

  // on-site vs remote classification
  s.check('reel + photo are on-site', isOnSitePiece('reel') && isOnSitePiece('photo'))
  s.check('post / email / sms are remote', !isOnSitePiece('post') && !isOnSitePiece('email') && !isOnSitePiece('sms'))
  s.check('story is remote by default', !isOnSitePiece('story'))
  s.check('story is on-site only when filmed here', isOnSitePiece('story', { captureMode: 'on-site' }))

  const mLine = (type: string, id: string, producer?: PieceProducer, brief?: PieceBrief): LineItem => buildContentLine(type, id, { producer, brief })!

  // One on-site piece alone → solo surcharge applies.
  const soloReel = mLine('reel', 'li-r', 'team')
  const sd1 = shootDaysFromLines([soloReel])
  s.check('a lone on-site piece forms one solo Shoot Day', sd1.length === 1 && sd1[0].onSiteCount === 1 && sd1[0].soloSurchargeCents === SUR)

  // Add a second on-site piece → the surcharge melts to $0.
  const photo = mLine('photo', 'li-p', 'creator')
  const sd2 = shootDaysFromLines([soloReel, photo])
  s.check('two on-site pieces share one visit, surcharge melts to $0', sd2.length === 1 && sd2[0].onSiteCount === 2 && sd2[0].soloSurchargeCents === 0)

  // A remote piece never joins a shoot or pays a visit.
  const email = mLine('email', 'li-e', 'team')
  s.check('a remote piece never forms a Shoot Day', shootDaysFromLines([email]).length === 0)

  // DIY on-site piece needs no Apnosh visit → excluded from the count.
  const diyReel = mLine('reel', 'li-dr', 'diy')
  s.check('a DIY on-site piece adds no visit (owner films it)', shootDaysFromLines([diyReel]).length === 0)
  s.check('one team reel + one DIY reel is still a SOLO visit', shootDaysFromLines([soloReel, diyReel])[0].soloSurchargeCents === SUR)

  // The surcharge folds into the lone piece's price via planCampaignPieces.
  const menuCamp = (items: LineItem[]): SavedCampaign => ({
    clientId: 'sim-client', draft: { id: 'sd-camp', name: 'Shoot', path: 'ai', items } as unknown as CampaignDraft,
    phase: 'build', status: 'draft', shippedAt: null, createdAt: SHIP, updatedAt: SHIP, creatorChoices: {}, producerChoices: {}, creativeControl: 'handoff', execution: {},
  })
  const solo = planCampaignPieces(menuCamp([soloReel]), SHIP)
  s.check('solo on-site piece price folds in the visit surcharge', solo.length === 1 && solo[0].priceCents === CONTENT_META.reel.price * 100 + SUR && solo[0].soloSurchargeCents === SUR)
  const batched = planCampaignPieces(menuCamp([soloReel, photo]), SHIP)
  s.check('batched on-site pieces carry NO surcharge', batched.every((p) => p.soloSurchargeCents === 0) && batched.find((p) => p.type === 'reel')?.priceCents === CONTENT_META.reel.price * 100)
  s.check('every on-site piece is stamped with its shoot day', batched.filter((p) => p.type === 'reel' || p.type === 'photo').every((p) => p.shootDayId === 'sd1'))
  s.check('a remote piece in the same campaign has no shoot day', planCampaignPieces(menuCamp([soloReel, photo, email]), SHIP).find((p) => p.type === 'email')?.shootDayId === null)

  // campaignBill = the one price truth (lines + visit surcharge).
  const billSolo = campaignBill([soloReel])
  s.eq('campaignBill folds the solo visit into the delivery total', billSolo.oneTimeOnDelivery, CONTENT_META.reel.price + SUR / 100)
  s.eq('campaignBill surfaces the visit surcharge separately', billSolo.visitSurchargeDollars, SUR / 100)
  const billBatched = campaignBill([soloReel, photo])
  s.eq('batched: no visit surcharge in the bill', billBatched.visitSurchargeDollars, 0)
  s.eq('batched delivery total is just the two piece prices', billBatched.oneTimeOnDelivery, CONTENT_META.reel.price + CONTENT_META.photo.price)
}

// ── N. Review fixes: payout nets the surcharge, both lanes carry the brief, stable id ──
s.group('Review fixes: surcharge out of payout, brief on both lanes, qty-stable keys')
{
  // Owner pays the surcharge; the creator is paid on the piece only.
  const surcharged = buildPayoutRow({ id: 'wo', client_id: 'c', campaign_id: 'k', creator_id: 'v_maya', amount_cents: 19500, surcharge_cents: 7500 }, 20)
  s.eq('payout gross nets out the solo-visit surcharge', surcharged.gross_cents, 12000)
  s.eq('payout net is on the piece, not the trip', surcharged.net_cents, 9600)
  s.eq('the owner charge still bills the full surcharged amount', buildChargeRow({ id: 'wo', client_id: 'c', campaign_id: 'k', amount_cents: 19500 }).amount_cents, 19500)
  s.eq('no surcharge → gross is the full amount', buildPayoutRow({ id: 'wo', client_id: 'c', campaign_id: 'k', creator_id: 'v_maya', amount_cents: 12000 }, 20).gross_cents, 12000)

  // briefInstructions includes subject + cta (sends are always team — dropping them loses the point).
  const instr = briefInstructions({ offer: 'BOGO', subject: 'Tonight only', cta: 'Reply YES', mustSay: 'kitchen closes 10pm' })
  s.check('brief instructions include subject + cta', instr.some((x) => x.includes('Tonight only')) && instr.some((x) => x.includes('Reply YES')))

  // A team piece carries the brief in media_brief (the team no longer builds blind).
  const teamCamp: SavedCampaign = {
    clientId: 'c', draft: { id: 'm', name: 'm', path: 'ai', items: [buildContentLine('email', 'li-e', { producer: 'team', brief: { offer: 'BOGO', subject: 'Tonight only', cta: 'Reply YES' } })!] } as unknown as CampaignDraft,
    phase: 'build', status: 'draft', shippedAt: null, createdAt: SHIP, updatedAt: SHIP, creatorChoices: {}, producerChoices: {}, creativeControl: 'handoff', execution: {},
  }
  const emailPiece = planCampaignPieces(teamCamp, SHIP)[0]
  const draftRow = teamDraftRowForPiece(teamCamp, emailPiece)
  s.check('team draft carries the brief in media_brief', !!draftRow.media_brief && draftRow.media_brief.instructions.some((x) => x.includes('Tonight only')))
  s.check('team draft idea leads with the offer', draftRow.idea.includes('BOGO'))

  // beatsFromLines stamps a #-suffixed id even at qty 1, so a 2→1 shrink keeps piece #0.
  const oneBeat = beatsFromLines([buildContentLine('reel', 'li-x', { producer: 'team' })!])
  s.eq('qty-1 beat id is suffixed (#0), not bare', oneBeat[0]?.id, 'li-x#0')
  const two = buildContentLine('reel', 'li-y', { producer: 'team' })!; two.qty = 2
  const twoBeats = beatsFromLines([two])
  s.check('qty-2 keeps #0 and adds #1 — shrink trims #1, never re-keys #0', twoBeats[0]?.id === 'li-y#0' && twoBeats[1]?.id === 'li-y#1')
}

// ── O. Per-piece service resolves to team/creator/diy/ai; brief campaigns don't batch ──
s.group('Per-piece service resolves (team/creator/diy/ai); brief campaigns keep base pricing')
{
  // A brief (builder) campaign: producer_choices can carry all four values; planCampaignPieces
  // resolves each — DIY is free, AI is the flat fee, creator routes to a creator — and a brief
  // campaign never batches, so no on-site surcharge is folded in.
  const camp = campaignFor({ name: 'Serviced', content: ['reel', 'photo', 'post'], beats: 3, producerChoices: { 'Video:0': 'creator', 'Photo:0': 'diy', 'Design:0': 'ai' } })
  const byType = new Map(planCampaignPieces(camp, SHIP).map((p) => [p.type, p]))
  s.check('a piece set to DIY is $0', byType.get('photo')?.producer === 'diy' && byType.get('photo')?.priceCents === 0)
  s.check('a piece set to AI bills the flat AI fee', byType.get('post')?.producer === 'ai' && byType.get('post')?.priceCents === AI_DRAFT_CENTS)
  s.check('a piece set to a creator routes to a creator', byType.get('reel')?.producer === 'creator' && !!byType.get('reel')?.creatorId)
  s.eq('a brief-campaign creative keeps its base price (no batching surcharge)', byType.get('reel')?.priceCents, CONTENT_META.reel.price * 100)
  s.check('a brief campaign stamps no shoot day on its pieces', planCampaignPieces(camp, SHIP).every((p) => p.shootDayId === null))
}

// ── P. Checkout shoot gate derives from INTENT: owner-supplied footage never books a crew ──
s.group('Shoot gate: owner-footage (edit) skips it; team-shot content keeps it')
{
  // 'edit' promises "send us your clips and photos, we cut and polish" — its seeded reel/photo
  // beats are stamped footageSource:'owner', so checkout must NOT demand an on-site shoot slot.
  const editDraft = draftFromBuilder({ itemId: 'edit', status: 'approve', vals: {} })
  s.check('edit beats are stamped owner-footage', (editDraft.brief?.contentBeats ?? []).length > 0 && (editDraft.brief?.contentBeats ?? []).every((b) => b.footageSource === 'owner'))
  s.check('edit alone ⇒ NO shoot gate at checkout', !draftNeedsShoot(editDraft))
  s.eq('edit alone ⇒ no pre-checkout booking gates', requiredBookingGates(editDraft).length, 0)

  // A merged cart of edit + dish: dish's hero photo is team-shot, so the gate STILL fires.
  const merged = composePlanCampaign([
    { itemId: 'edit', doer: null, options: [] },
    { itemId: 'dish', doer: null, options: [] },
  ])
  s.check('edit + dish cart composes', !!merged.draft && merged.dropped.length === 0)
  s.check('edit + dish cart ⇒ shoot gate still fires (dish is team-shot)', !!merged.draft && draftNeedsShoot(merged.draft))

  // reach's discovery reel is team-shot — its gate is untouched.
  const reachDraft = draftFromBuilder({ itemId: 'reach', status: 'approve', vals: {} })
  s.check('reach keeps its shoot gate', draftNeedsShoot(reachDraft))
  s.check('a plain reel piece keeps its shoot gate', draftNeedsShoot(draftFromBuilder({ itemId: 'reel', status: 'approve', vals: {} })))
}

// ── Q. Availability guard vets EVERY cart item (never just the first) ──
s.group('Availability: merged carts carry all source ids; coming-soon ids get flagged')
{
  const cart = composePlanCampaign([
    { itemId: 'dish', doer: null, options: [] },
    { itemId: 'giftcard', doer: null, options: [] },
  ])
  s.check('merged draft keeps the legacy first-item sourceCatalogId', cart.draft?.sourceCatalogId === 'dish')
  s.check('merged draft carries EVERY source id', JSON.stringify(cart.draft?.sourceCatalogIds) === JSON.stringify(['dish', 'giftcard']))
  const ids = draftSourceCatalogIds(cart.draft!)
  s.check('draftSourceCatalogIds reads the full list', JSON.stringify(ids) === JSON.stringify(['dish', 'giftcard']))
  s.check('the coming-soon item is flagged even behind a live first item', JSON.stringify(unbuyableCatalogIds(ids)) === JSON.stringify(['giftcard']))
  s.check('a legacy draft (single sourceCatalogId) still resolves', JSON.stringify(draftSourceCatalogIds({ sourceCatalogId: 'giftcard' })) === JSON.stringify(['giftcard']))
  s.eq('an all-live cart is clean', unbuyableCatalogIds(['dish', 'edit', 'reach']).length, 0)
}

// ── Owner-sim fix 1a: the edit-footage ask keys off EVERY source id, any cart position ──
s.group('Edit-footage intake: edit fires in ANY cart position (readiness keys off sourceCatalogIds)')
{
  const editSecond = composePlanCampaign([
    { itemId: 'dish', doer: null, options: [] },
    { itemId: 'edit', doer: null, options: [] },
  ])
  const ids2 = draftSourceCatalogIds(editSecond.draft!)
  s.check('edit-second cart composes', !!editSecond.draft)
  s.check('legacy sourceCatalogId is the FIRST item (not edit)', editSecond.draft?.sourceCatalogId === 'dish')
  s.check('the full id list still carries edit (what the footage ask now reads)', ids2.includes('edit'))
  const editFirst = composePlanCampaign([
    { itemId: 'edit', doer: null, options: [] },
    { itemId: 'dish', doer: null, options: [] },
  ])
  s.check('edit-first cart carries edit too (no regression)', draftSourceCatalogIds(editFirst.draft!).includes('edit'))
  const noEdit = composePlanCampaign([{ itemId: 'dish', doer: null, options: [] }])
  s.check('a cart with no edit never implies a footage ask', !draftSourceCatalogIds(noEdit.draft!).includes('edit'))
}

// ── Owner-sim fix 1b: a monthly-only cart is BILLABLE (never the free path) ──
s.group('Ship gate: monthly-only carts must pay (card + consent), never the free path')
{
  const MODERN = '2026-07-16T00:00:00Z'
  s.eq('monthly-only, no intent → REFUSE (must go through checkout)',
    shipBillingGate({ preTaxCents: 0, perMonthCents: 16500, hasPaymentIntent: false, createdAtISO: MODERN }), 'refuse')
  s.eq('monthly-only, SetupIntent presented → verify',
    shipBillingGate({ preTaxCents: 0, perMonthCents: 16500, hasPaymentIntent: true, createdAtISO: MODERN }), 'verify')
  s.eq('truly free ($0 one-time, $0 monthly) still ships freely',
    shipBillingGate({ preTaxCents: 0, perMonthCents: 0, hasPaymentIntent: false, createdAtISO: MODERN }), 'allow')
  s.eq('legacy pre-checkout campaign keeps its carve-out',
    shipBillingGate({ preTaxCents: 0, perMonthCents: 16500, hasPaymentIntent: false, createdAtISO: '2026-07-01T00:00:00Z' }), 'allow')
  s.eq('omitted perMonthCents behaves as before (back-compat)',
    shipBillingGate({ preTaxCents: 0, hasPaymentIntent: false, createdAtISO: MODERN }), 'allow')
}

// ── Owner-sim fixes 1f + 1i: fee-included display + plain-words pass-through ──
s.group('Money display: fee folded into shown prices; pass-through notes in plain words')
{
  s.eq('withServiceFee folds the 10% checkout fee in', withServiceFee(100), 110)
  s.eq('withServiceFee rounds honestly', withServiceFee(1235), 1359)
  s.eq('$0 stays $0', withServiceFee(0), 0)
  const adsNote = 'ad spend billed at cost, $500/mo minimum'
  s.eq('plain words replace "billed at cost"', plainCostNote(adsNote), 'ad spend paid at cost (no markup), $500/mo minimum')
  s.eq('a note with no dollar amount says the owner sets it', plainCostNote('sponsored-listing spend billed at cost'), 'sponsored-listing spend paid at cost (no markup). You set the amount')
  s.eq('the named $500/mo minimum totals into one real number', passthroughMonthlyMinimumCents([adsNote]), 50000)
  s.eq('a no-minimum note contributes 0 (never invented)', passthroughMonthlyMinimumCents(['sponsored-listing spend billed at cost']), 0)
  s.eq('minimums sum across notes', passthroughMonthlyMinimumCents([adsNote, 'boost billed at cost, $100/mo minimum']), 60000)
}

// ── Owner-sim fix, Phase 2: Day-0 Home shows orders in progress with REAL status ──
s.group('Day-0 Home: orders-in-progress selection (shipped only, urgent first, capped)')
{
  const card = (key: string, kind: CampCard['kind'], pill: string, review = false): CampCard =>
    ({ key, kind, title: key, pill, pillIcon: 'dot', blurb: '', cost: null, recurring: false, perf: null, review, href: `/x/${key}` })
  const mixed = [
    card('a-live', 'live', 'Live'),
    card('b-draft', 'draft', 'Draft'),
    card('c-prod', 'live', 'In production'),
    card('d-done', 'done', 'Done'),
    card('e-needs', 'live', 'Needs you', true),
  ]
  const picked = selectHomeOrders(mixed)
  s.eq('drafts and done campaigns never show on Home', picked.every((c) => c.kind === 'live'), true)
  s.eq('needs-you comes first, then production, then live', JSON.stringify(picked.map((c) => c.key)), JSON.stringify(['e-needs', 'c-prod', 'a-live']))
  const many = Array.from({ length: 6 }, (_, i) => card(`l${i}`, 'live', 'Live'))
  s.eq('capped so Home stays a glance', selectHomeOrders(many).length, HOME_ORDERS_CAP)
  s.eq('no shipped orders → empty (the section hides, no fake state)', selectHomeOrders([card('x', 'draft', 'Draft')]).length, 0)

  // Integration: a real shipped campaign through campaignCardVM rides into the selection
  // with the honest status (the exact card Home now renders). A fresh ship with unfinished
  // owner setup truthfully reads "Needs you" — and that urgency puts it FIRST on Home.
  const shipped = campaignFor({ name: 'home vm', content: ['post'] })
  shipped.status = 'shipped'
  const vm = campaignCardVM(shipped, { total: 2, live: 0, queued: 0, awaitingYou: 0, inProgress: 2, nextDueISO: null })
  s.eq('fresh shipped campaign, setup unfinished → Needs you', vm.pill, 'Needs you')
  s.eq('its blurb is the honest next step', vm.blurb, 'Finish setup so your team can start')
  s.eq('and it is selected for Home, ranked first', selectHomeOrders([card('z-live', 'live', 'Live'), vm])[0].key, vm.key)
}

const ok = s.report('Lifecycle simulator — pure logic')
process.exit(ok ? 0 : 1)

// ── helpers ────────────────────────────────────────────────────────────
function lines(types: string[]): LineItem[] { return types.map((t, i) => buildContentLine(t, `li-${i}`)!).filter(Boolean) }
function disciplines(roles: { discipline: string }[]): string[] { return roles.map((r) => r.discipline) }
function beatsN(n: number): ContentBeat[] { return Array.from({ length: n }, (_, i) => ({ week: i + 1, type: 'post', label: `B${i}`, channel: 'instagram' })) }
function isMonotonic(xs: (string | null)[]): boolean { for (let i = 1; i < xs.length; i++) if ((xs[i] ?? '') < (xs[i - 1] ?? '')) return false; return true }
function addDays(iso: string, d: number): string { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10) }
function minus3(iso: string | null): string | null { return iso ? addDays(iso, -3) : null }
function mkBeats(spec: Array<[string, number]>): ContentBeat[] { let w = 0; const out: ContentBeat[] = []; for (const [type, n] of spec) for (let i = 0; i < n; i++) out.push({ week: ++w, type, label: type, channel: 'instagram' }); return out }
function mkLine(type: string, qty: number, opt?: { optOut?: boolean; included?: boolean }): LineItem { const li = buildContentLine(type, `li-${type}`, { qty })!; if (opt?.optOut) (li as unknown as { optOut: string }).optOut = 'cost'; if (opt?.included === false) li.included = false; return li }
