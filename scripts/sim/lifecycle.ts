/**
 * Pure-logic lifecycle simulator. Drives the REAL date engine, creator matcher,
 * mint row-builder, and campaign composer across a matrix of campaign shapes +
 * a deterministic fuzz sweep, asserting the lifecycle invariants. No DB, no
 * browser, runs in milliseconds. Run:  npx tsx scripts/sim/lifecycle.ts
 */
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { creativeRolesForCampaign, vibeForCampaign, creatorPool, disciplineForType, type Disc } from '@/lib/campaigns/creators'
import { buildWorkOrderRows, planCampaignPieces, buildBridgeDraftRow, buildChargeRow, computePayout, buildPayoutRow, validateTransition, safeHref } from '@/lib/campaigns/work-orders-core'
import { composeCampaign } from '@/lib/campaigns/campaign-composer'
import { buildContentLine, CONTENT_META, reconcileBeatsToLines } from '@/lib/campaigns/catalog'
import { CAMPAIGN_TEMPLATES } from '@/lib/campaigns/data/campaign-templates'
import type { CampaignBrief, CampaignDraft, ContentBeat, LineItem } from '@/lib/campaigns/types'
import type { SavedCampaign } from '@/lib/campaigns/view'
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
  producerChoices?: Record<string, 'team' | 'creator'>   // per-piece team|creator routing
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
    const choices: Record<string, 'team' | 'creator'> = { ...camp.producerChoices }
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
    const target = planCampaignPieces(base, SHIP).find((p) => p.key && p.producer === 'team')   // a team piece (the default)
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
  // so the charge can never diverge from the quoted plan.
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
