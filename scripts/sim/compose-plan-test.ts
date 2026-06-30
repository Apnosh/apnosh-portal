/* Phase 2 composer guard: composePlanForGoal funnel completion + targeting invariants.
 * Run: npx tsx scripts/sim/compose-plan-test.ts */
import { composePlanForGoal, ITEM_SHAPE, mapAudience } from '@/lib/campaigns/builder/compose-plan'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✓' : '✗ FAIL'}  ${m}`); if (!c) fails++ }
const types = (id: string, spec: Record<string, string> = {}) => composePlanForGoal(id, spec).tpl.contentPlan.map((b) => b.type)
const ms = (arr: string[]) => { const m: Record<string, number> = {}; for (const x of arr) m[x] = (m[x] || 0) + 1; return m }
const superset = (big: string[], small: string[]) => { const b = ms(big), s = ms(small); return Object.entries(s).every(([k, v]) => (b[k] || 0) >= v) }
const eq = (a: string[], b: string[]) => JSON.stringify(ms(a)) === JSON.stringify(ms(b))

// A get-seen piece is goal-dependent: a visual for acquire/retain, but a slow-night post
// for capacity or a GBP ask-post for reviews. So "discovery" = a visual OR a public post.
const DISCOVERY = new Set(['reel', 'photo', 'story', 'post'])
const CONVERT = new Set(['post', 'email', 'sms'])

// Event items that get a phased playbook are NOT seed-verbatim — tested separately below.
const PLAYBOOK_EVENTS = new Set(['launch', 'promoevent', 'ticket', 'giftcard'])
// Programs whose email/SMS legs are gated on a connected list — they SHRINK with no list, so the
// "program ⊇ its seed" invariant is checked with a list on (the full plan).
const LIST_GATED = new Set(['nights', 'regulars'])
const WITH_LIST = { list: 'reaching your email + text list' }

// Cardinal invariant: non-program, non-playbook items return their seed verbatim (no per-item
// regression); program items are a superset of their seed (only grow, never lose identity).
for (const [id, shape] of Object.entries(ITEM_SHAPE)) {
  if (PLAYBOOK_EVENTS.has(id)) continue
  const got = types(id, LIST_GATED.has(id) ? WITH_LIST : {}); const seed = shape.seed.map((b) => b[0])
  if (shape.kind === 'program') ok(superset(got, seed), `program '${id}' is a superset of its seed`)
  else ok(eq(got, seed), `non-program '${id}' (${shape.kind}) is its seed verbatim`)
}

// Every program covers a get-seen (discovery) leg and a convert leg of the funnel.
for (const [id, shape] of Object.entries(ITEM_SHAPE)) if (shape.kind === 'program') {
  const got = types(id)
  ok(got.some((t) => DISCOVERY.has(t)), `program '${id}' has a get-seen piece`)
  ok(got.some((t) => CONVERT.has(t)), `program '${id}' has a convert piece`)
}

// Specific expectations.
ok(eq(types('reel'), ['reel']), `lone 'reel' is exactly one reel (no funnel bloat)`)

// Launch is a REAL phased playbook (tease → list → announce → day-of urgency → proof), not 3 pieces.
const leanLaunch = types('launch', {})
ok(leanLaunch[0] === 'reel', `'launch' opens with a teaser reel`)
ok(leanLaunch.length >= 5, `lean launch has a real arc (${leanLaunch.length} pieces), not just 3`)
ok(!leanLaunch.includes('email') && !leanLaunch.includes('sms'), `lean launch (no list) uses no email/sms`)
const listLaunch = types('launch', { list: 'yes, I can email/text my guests' })
ok(listLaunch.filter((t) => t === 'email').length === 2 && listLaunch.includes('sms'), `launch WITH a list adds the email + SMS spine (early-access + announce email, day-of text)`)
// Boost is a ONE-TIME amplification attached to a specific piece (beat.boost) — NOT the monthly
// ads-management retainer (that's `ads`, reserved for ongoing reach/firstvisit programs).
const boosted = (id: string, spec: Record<string, string> = {}) => composePlanForGoal(id, spec).tpl.contentPlan.some((b) => b.boost)
const boostType = (id: string, spec: Record<string, string> = {}) => composePlanForGoal(id, spec).tpl.contentPlan.find((b) => b.boost)?.type
ok(boosted('launch', { boost: 'yes, put some budget behind it' }), `launch boost attaches to a piece (one-time, not a retainer)`)
ok(boostType('launch', { boost: 'yes, put some budget behind it' }) === 'reel', `launch boost lands on the teaser reel`)
ok(composePlanForGoal('launch', { boost: 'yes, put some budget behind it' }).ads === false, `launch boost does NOT add the monthly ads retainer`)
ok(!boosted('launch', {}) && composePlanForGoal('launch', {}).ads === false, `no boost → no paid reach of any kind`)
const softW = composePlanForGoal('launch', {}).tpl.contentPlan.map((b) => b.week)
ok(Math.max(...softW) === 3 && softW.filter((w) => w === 3).length >= 3, `soft launch: 3-week runway, day-of pieces share the launch-day week`)
ok(Math.max(...composePlanForGoal('launch', { intensity: 'a big launch' }).tpl.contentPlan.map((b) => b.week)) === 4, `big launch runs a longer 4-week runway`)

ok(composePlanForGoal('launch', { date: '2026-07-18' }).occasion === 'your launch', `'launch' + date sets occasion → backward schedule`)
ok(composePlanForGoal('shoot', { date: '2026-07-18' }).occasion === undefined, `'shoot' + date has NO occasion → forward`)

// ── Event playbooks (promoevent / ticket / giftcard) — phased, list-gated, like launch ──
const channelsOf = (id: string, spec: Record<string, string> = {}) => composePlanForGoal(id, spec).tpl.contentPlan.map((b) => b.channel)
const LIST_ON = { list: 'reaching your email + text list' }
// promoevent: free-event arc. Lean = no list sends; with a list adds the email + day-of SMS spine.
const peLean = types('promoevent', {})
ok(peLean[0] === 'reel' && peLean.length >= 4, `'promoevent' lean is a real arc (${peLean.length} pieces), reel-led`)
ok(!peLean.includes('email') && !peLean.includes('sms'), `'promoevent' lean (no list) uses no email/sms`)
ok(types('promoevent', LIST_ON).includes('email') && types('promoevent', LIST_ON).includes('sms'), `'promoevent' WITH a list adds the email + SMS spine`)
ok(composePlanForGoal('promoevent', { date: '2026-07-18' }).occasion === 'your event', `'promoevent' + date sets occasion 'your event' → backward schedule`)
// ticket: sell-through arc. Lean = posts only; with a list adds the email + SMS spine; big adds a reel + a 4-week window.
const tkLean = types('ticket', {})
ok(!tkLean.includes('email') && !tkLean.includes('sms'), `'ticket' lean (no list) uses no email/sms`)
ok(types('ticket', LIST_ON).filter((t) => t === 'email').length >= 2 && types('ticket', LIST_ON).includes('sms'), `'ticket' WITH a list adds early + last-call email and an SMS`)
ok(!tkLean.includes('reel') && types('ticket', { intensity: 'a big push' }).includes('reel'), `'ticket' reel is a big-push-only add`)
ok(Math.max(...composePlanForGoal('ticket', { intensity: 'a big push' }).tpl.contentPlan.map((b) => b.week)) === 4, `'ticket' big push runs a 4-week sell window`)
// giftcard: gifting-cutoff arc. Lean = no list, no bonus; a bonus offer adds the bonus story.
const gcLean = types('giftcard', {})
ok(!gcLean.includes('email') && !gcLean.includes('sms'), `'giftcard' lean (no list) uses no email/sms`)
ok(types('giftcard', LIST_ON).includes('email') && types('giftcard', LIST_ON).includes('sms'), `'giftcard' WITH a list adds email + last-day SMS`)
ok(types('giftcard', { offer: '$10 bonus on $50' }).filter((t) => t === 'story').length > gcLean.filter((t) => t === 'story').length, `'giftcard' bonus offer adds a 'Bonus this week' story`)
ok(composePlanForGoal('giftcard', { date: '2026-12-20' }).occasion === 'the gifting date', `'giftcard' + date sets occasion 'the gifting date' → backward schedule`)
// creator: no playbook (no date you control), but boost (whitelisting their post) attaches to the repost.
ok(eq(types('creator', {}), ['post', 'story', 'reel']), `'creator' is amplification + reuse (repost, reshare, reuse-cut), not a billed creator reel`)
ok(boosted('creator', { boost: 'yes, put spend behind it' }) && boostType('creator', { boost: 'yes, put spend behind it' }) === 'post', `'creator' boost attaches to the repost (whitelist their post), no retainer`)
ok(composePlanForGoal('creator', { boost: 'yes, put spend behind it' }).ads === false, `'creator' boost is one-time per-piece, not the monthly retainer`)
ok(composePlanForGoal('creator', {}).ads === false, `'creator' default has no paid reach`)
// A single reel (the asked-for case) can be boosted: one-time, on the reel, never a monthly retainer.
ok(boosted('reel', { boost: 'yes, boost it to nearby people' }) && boostType('reel', { boost: 'yes, boost it to nearby people' }) === 'reel', `a single reel can be boosted, on the reel itself`)
ok(composePlanForGoal('reel', { boost: 'yes, boost it to nearby people' }).ads === false, `a boosted reel adds no monthly ads retainer`)
ok(!boosted('reel', {}), `an un-boosted reel has no paid reach`)
ok(!boosted('reach', {}) && composePlanForGoal('reach', {}).ads === true, `'reach' uses the ongoing managed retainer, not a per-piece boost`)

// ── Format / channel-shaped pieces — the owner's pick changes the pieces produced ──
ok(eq(types('dish', {}), ['photo', 'post']), `'dish' default (a photo) → photo + post (today's seed)`)
ok(types('dish', { format: 'a short video' }).includes('reel'), `'dish' 'a short video' produces a reel`)
ok(types('dish', { format: 'a photo, a short video' }).includes('reel') && types('dish', { format: 'a photo, a short video' }).includes('photo'), `'dish' multi-format fans out to a photo AND a reel`)
ok(eq(types('shoot', {}), ['photo', 'reel']), `'shoot' default (photo and video) → both`)
ok(eq(types('shoot', { kind: 'photo' }), ['photo']), `'shoot' photo-only → no reel`)
ok(eq(types('shoot', { kind: 'video' }), ['reel']), `'shoot' video-only → no photo`)
ok(eq(types('slowoffer', {}), ['email', 'sms']), `'slowoffer' default channels → email + text (seed)`)
ok(eq(types('slowoffer', { channel: 'email' }), ['email']), `'slowoffer' email-only honors the channel pick`)
ok(types('slowoffer', { channel: 'a social post' }).includes('post'), `'slowoffer' 'a social post' produces a post`)
ok(eq(types('birthday', { channel: 'email' }), ['email']), `'birthday' email-only → no surprise text`)

// ── Reviews go to Google, where the rating lives ──
ok(channelsOf('reviewsplan')[0] === 'gbp', `'reviewsplan' asks for reviews on Google, not social`)
ok(channelsOf('reviewsreply')[0] === 'gbp', `'reviewsreply' replies live on the Google profile`)
ok(types('regulars').includes('story'), `'regulars' gains a get-seen story`)
ok(types('catering').includes('photo') && !types('catering').includes('reel'), `'catering' get-seen is a photo, not a reel`)
ok(eq(types('reach'), ['reel', 'post']), `'reach' already complete → unchanged`)
ok(eq(types('nights', WITH_LIST), ['post', 'sms', 'email']), `'nights' WITH a list keeps its day-before text + offer email`)
ok(composePlanForGoal('reach', {}).ads === true, `'reach' is an ads item by default`)
ok(composePlanForGoal('catering', {}).ads === false, `'catering' is not an ads item (no surprise paid media)`)

// ── Programs lean on the owner's list: gated on a real connection, social fallback otherwise ──
ok(!types('nights').includes('email') && !types('nights').includes('sms'), `'nights' with NO list drops the dead email/SMS, stays social`)
ok(types('regulars', WITH_LIST).includes('email') && types('regulars', WITH_LIST).includes('sms'), `'regulars' WITH a list keeps its come-back email + text`)
ok(!types('regulars').includes('email') && !types('regulars').includes('sms'), `'regulars' with NO list falls back to social, no dead sends`)
// catering's email is cold B2B outreach, NOT a subscriber send → never gated.
ok(types('catering').includes('email'), `'catering' keeps its outreach email even with no list (cold B2B)`)
// Paid reach is on by default for reach, but the owner can decline it.
ok(composePlanForGoal('reach', { paidreach: 'no, keep it organic' }).ads === false, `'reach' owner can decline paid ads`)

// ── firstvisit: the full TEMPLATE plan (SEE → offer → capture → bring back) + reach modes ──
const fvLean = types('firstvisit', {})
ok(fvLean.includes('reel') && fvLean.includes('photo') && fvLean.includes('post'), `'firstvisit' leads with a reel + hero photo + offer post`)
ok(channelsOf('firstvisit').includes('gbp'), `'firstvisit' adds a Google post for nearby searches`)
ok(fvLean.filter((t) => t === 'post').length >= 2, `'firstvisit' includes the table-QR capture post`)
ok(fvLean.includes('sms'), `'firstvisit' queues a second-visit nudge to bring the guest back`)
ok(types('firstvisit', WITH_LIST).includes('email') && !fvLean.includes('email'), `'firstvisit' adds an offer email only when a list is connected`)
// reach slot drives paid: a one-time boost by DEFAULT (not the $545/mo retainer), organic, or opt-in retainer.
ok(boosted('firstvisit', { reach: 'a small paid boost' }) && composePlanForGoal('firstvisit', { reach: 'a small paid boost' }).ads === false, `'firstvisit' default reach = a one-time boost on a piece, NOT a monthly retainer`)
ok(composePlanForGoal('firstvisit', { reach: 'always-on ads ($545/mo)' }).ads === true, `'firstvisit' "always-on" reach is the explicit opt-in to the $545/mo retainer`)
ok(!boosted('firstvisit', { reach: 'just my followers' }) && composePlanForGoal('firstvisit', { reach: 'just my followers' }).ads === false, `'firstvisit' "just my followers" = organic, no paid`)
// who → targeting (specFromVals routes {who} through mapAudience).
ok(mapAudience('families nearby').includes('families'), `firstvisit who 'families nearby' → families segment`)
ok(mapAudience('couples for date night').includes('datenight'), `firstvisit who 'couples for date night' → datenight segment`)
// Reach radius flows into the objective so the team sets ad targeting to match.
ok(/within 5 miles/.test(composePlanForGoal('reach', { radius: '5' }).tpl.objective), `'reach' radius reaches the objective`)
// The owner's real neighborhood (from the account profile) drives the "near me" framing.
ok(/in the Mission/.test(composePlanForGoal('firstvisit', { neighborhood: 'the Mission' }).tpl.objective), `account profile neighborhood reaches the objective`)
// Reviews method adds the matching piece (or stays lean when not picked).
ok(types('reviewsplan', { how: 'a table card or QR' }).filter((t) => t === 'post').length > types('reviewsplan').filter((t) => t === 'post').length, `'reviewsplan' table-card/QR adds a QR post`)
ok(types('reviewsplan', { how: 'a follow-up text or email' }).includes('sms'), `'reviewsplan' follow-up text adds an SMS`)
ok(!types('reviewsplan').includes('sms'), `'reviewsplan' with no method picked stays lean (no surprise SMS)`)
// Catering audience picks now drive real targeting segments.
ok(mapAudience('offices nearby').includes('offices'), `catering 'offices nearby' → offices segment`)
ok(mapAudience('event planners').includes('planners'), `catering 'event planners' → planners segment`)
ok(mapAudience('schools').includes('schools'), `catering 'schools' → schools segment`)
ok(mapAudience('past big orders').includes('past-orders'), `catering 'past big orders' → past-orders segment`)

// Targeting (mapAudience).
ok(mapAudience('our lapsed regulars who drifted').includes('lapsed'), `'lapsed' → lapsed`)
ok(mapAudience('loyal regulars').includes('regulars'), `'regulars' → regulars`)
ok(mapAudience('recent first-timers').includes('firsttimers'), `'first-timers' → firsttimers`)
ok(mapAudience('nearby offices').includes('new-locals'), `'nearby' → new-locals`)
ok(mapAudience('zzz qqq nothing').length === 0, `no keyword match → empty (keeps the goal default)`)
ok(mapAudience('date night couples').includes('datenight'), `'date night' → datenight (legit case kept)`)
// Regression: benign catering free-text must NOT over-match (substring 'date'/'new').
for (const w of ['corporate update meetings', 'candidates', 'accommodate big groups', 'mandate compliance']) ok(!mapAudience(w).includes('datenight'), `'${w}' does NOT match datenight`)
for (const w of ['new moms', 'new corporate clients']) ok(!mapAudience(w).includes('new-locals'), `'${w}' does NOT match new-locals`)

// ── adapt(): the situation-aware "best plan" pass — v1 NO-LIST CAPTURE ──
// A list-dependent program with NO list should START a list (capture at the table) instead of just
// degrading. The change carries an owner-facing 'because'; WITH a list the pass is identity.
const labelsOf = (id: string, spec: Record<string, string> = {}) => composePlanForGoal(id, spec).tpl.contentPlan.map((b) => b.label)
const becauses = (id: string, spec: Record<string, string> = {}) => composePlanForGoal(id, spec).tpl.contentPlan.filter((b) => b.because).length
ok(labelsOf('nights').some((l) => /table qr/i.test(l)), `no-list 'nights' starts a list (adapt adds a Table-QR capture)`)
ok(labelsOf('regulars').some((l) => /table qr/i.test(l)), `no-list 'regulars' starts a list (adapt adds a Table-QR capture)`)
ok(becauses('nights') >= 1, `the adapt-added capture carries an owner-facing 'because' (no silent change)`)
ok(!labelsOf('nights', WITH_LIST).some((l) => /table qr/i.test(l)), `WITH a list, 'nights' is identity — adapt adds nothing`)
ok(labelsOf('firstvisit').filter((l) => /table qr/i.test(l)).length === 1, `'firstvisit' already captures — adapt does NOT double-add`)
ok(!labelsOf('reel').some((l) => /table qr/i.test(l)) && !labelsOf('launch').some((l) => /table qr/i.test(l)), `adapt leaves non-program items (reel, launch) untouched`)

// ── THE LEAD MOVE: the plan leads with the operational move the binding constraint demands ──
// REPUTATION binds (a real low rating, >=15 reviews) → the review ENGINE is the lead + paid reach held.
const REP = { rating: '3.8', ratingCount: '50' }
const repReach = composePlanForGoal('reach', REP)
ok(repReach.leadMove?.serviceId === 'review-engine', `low rating → the LEAD move is the review engine (not a content post)`)
ok(repReach.heldAds === true && repReach.ads === false, `...and paid reach is HELD while the rating is the ceiling`)
ok(/rating/i.test(repReach.leadMove?.because || ''), `the lead move carries a rating-grounded 'because'`)
ok(composePlanForGoal('reach', { ...REP, reachOverride: 'on' }).heldAds !== true, `'run ads anyway' override un-holds the paid reach`)
ok(composePlanForGoal('reach', { rating: '4.6', ratingCount: '50' }).leadMove === undefined, `a strong rating → no lead move (identity)`)
// GET FOUND binds (weak Google listing, OR barely-on-the-map) on a first-visits/acquire program.
ok(composePlanForGoal('reach', { presence: '40' }).leadMove?.serviceId === 'gbp-setup', `a weak Google listing → the LEAD move is 'get found on Google'`)
ok(composePlanForGoal('reach', { ratingCount: '6' }).leadMove?.serviceId === 'gbp-setup', `barely-on-the-map (very few reviews) → get found leads`)
ok(composePlanForGoal('reach', { presence: '90' }).leadMove === undefined, `a strong listing → no lead move`)
ok(composePlanForGoal('reach', { presence: '40', ...REP }).leadMove?.serviceId === 'review-engine', `reputation outranks get-found when both bind`)
ok(composePlanForGoal('reel', { presence: '40' }).leadMove === undefined, `a single piece (reel) gets no lead move`)
ok(composePlanForGoal('reviewsplan', REP).leadMove === undefined, `a reviews campaign is not 'led' — it IS the fix`)

console.log(fails === 0 ? '\nALL COMPOSE-PLAN CHECKS PASS' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
