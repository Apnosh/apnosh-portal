/**
 * brain-routing — the golden that lets the strategist's signal pipe be widened safely.
 *
 * WHAT THIS FREEZES. For four fixture personas (an owner we know nothing about, a thin onboarding,
 * a rich connected client, and a GBP-only client): the data-richness routing, every ranked mix for
 * the four system goals across three tiers, and every nonzero signal-fit delta on the firstvisit
 * plays. Captured from the live modules on 2026-07-28, BEFORE any widening, so every later change
 * to what the brain consumes shows up here as an explicit, reviewable diff instead of a silent
 * drift in what plans clients get.
 *
 * THE TWO LAWS THIS CARRIES:
 *  - A blank persona produces ZERO deltas and routes SAFE. If nothing is known, nothing may nudge.
 *  - The ranking is deterministic: same signals in, same order out, every time.
 *
 * When a widening step legitimately moves a number here, the fixture is updated IN THE SAME COMMIT
 * with the diff called out in the commit message. An unexplained failure is a bug, not a chore.
 *
 * Run: npx tsx scripts/sim/brain-routing.ts
 */
import { Suite } from './lib'
import { emptySignals, richness, planRoute, type BrainSignals } from '../../src/lib/campaigns/brain/signals'
import { reading } from '../../src/lib/campaigns/brain/readiness'
import { brainRankedMix } from '../../src/lib/campaigns/brain/rank'
import { signalFit } from '../../src/lib/campaigns/brain/signal-fit'
import { playsForGoalAtoms, type PlanGoal } from '../../src/lib/campaigns/data/atom-plays'

/* ── the personas ─────────────────────────────────────────────────────────────────────────────
 * Four honest shapes of "what we know", not edge cases: these are the four kinds of client the
 * portal actually meets. */

/** Day zero. No onboarding, no connections. The brain must refuse to pretend otherwise. */
const coldStart = (): BrainSignals => emptySignals()

/** Typed the onboarding form, connected nothing. Rating came from the Places lookup. */
const onboardedThin = (): BrainSignals => ({
  ...emptySignals(),
  rating: reading(4.4), ratingCount: reading(120), monthlyBudget: reading(400), primaryGoal: reading('new-customers'),
})

/** The client every signal reader can see: connected, listed, with history. */
const richConnected = (): BrainSignals => ({
  ...emptySignals(),
  priceRange: reading('$$'), primaryGoal: reading('regulars'), cuisine: reading('korean bbq'), neighborhood: reading('downtown'),
  rating: reading(4.6), ratingCount: reading(340), listingCompleteness: reading(82),
  complaintThemes: reading(['slow service']), hasList: reading(true), listSize: reading(900), lapsedCount: reading(220),
  connectedChannels: reading(['gbp', 'instagram', 'site']), slowNights: reading(['Mon', 'Tue']),
  droppedServiceIds: reading(['qr-cards']), workingServiceIds: reading(['gbp-posts']),
  monthlyBudget: reading(900),
})

/** Connected Google and nothing else — the most common real shape after the gbp card. */
const gbpOnly = (): BrainSignals => ({
  ...emptySignals(),
  rating: reading(4.1), ratingCount: reading(45), listingCompleteness: reading(55), connectedChannels: reading(['gbp']),
})

const PERSONAS: Record<string, () => BrainSignals> = { coldStart, onboardedThin, richConnected, gbpOnly }
const GOALS: PlanGoal[] = ['firstvisit', 'nights', 'regulars', 'reviews']
const TIERS = ['lean', 'standard', 'aggressive'] as const

/* ── the golden, frozen 2026-07-28 pre-widening ─────────────────────────────────────────────── */
interface Golden { usableCore: number; route: string; mixes: Record<string, string[]>; fits: Record<string, number> }
const GOLDEN: Record<string, Golden> = {
  coldStart: {
    usableCore: 0, route: 'safe',
    mixes: {'firstvisit/lean': ['gbp-setup', 'site-menu', 'review-engine', 'street-sampling', 'friend-hook'], 'firstvisit/standard': ['gbp-posts', 'photo-library', 'gbp-setup', 'site-menu', 'landing-page', 'local-seo', 'crm-list', 'social-mgmt', 'review-engine', 'tracking', 'creator-monthly', 'lto-launch', 'street-sampling', 'creator-collab', 'friend-hook', 'ordering-setup', 'ugc-rights', 'google-food-order'], 'firstvisit/aggressive': ['gbp-posts', 'photo-library', 'email-found', 'gbp-setup', 'site-menu', 'video-engine', 'landing-page', 'local-seo', 'crm-list', 'social-mgmt', 'review-engine', 'tracking', 'welcome-seq', 'listings-sync', 'review-responses', 'creator-monthly', 'paid-ads', 'concierge', 'lto-launch', 'menu-photo-refresh', 'street-sampling', 'creator-collab', 'friend-hook', 'ordering-setup', 'ai-phone', 'ugc-rights', 'google-food-order', 'referral'], 'nights/lean': ['sms-found', 'gbp-posts', 'sms-program', 'crm-list', 'tracking', 'event-pkg'], 'nights/standard': ['sms-found', 'gbp-posts', 'sms-program', 'crm-list', 'tracking', 'reporting', 'event-pkg', 'lto-launch', 'reminder-send', 'bar-events', 'menu-eng'], 'nights/aggressive': ['sms-found', 'gbp-posts', 'sms-program', 'loyalty', 'crm-list', 'tracking', 'reporting', 'seasonal-cal', 'event-pkg', 'lto-launch', 'reminder-send', 'bar-events', 'menu-eng', 'paid-ads', 'reservation-protect'], 'regulars/lean': ['sms-found', 'crm-list', 'winback', 'incentive-design', 'welcome-seq', 'tracking', 'email-found', 'reminder-send'], 'regulars/standard': ['newsletter', 'sms-found', 'crm-list', 'loyalty', 'birthday', 'winback', 'incentive-design', 'welcome-seq', 'sms-program', 'tracking', 'email-found', 'feedback-loop', 'review-engine', 'reporting', 'referral', 'reminder-send', 'menu-eng', 'ugc-rights'], 'regulars/aggressive': ['newsletter', 'sms-found', 'crm-list', 'loyalty', 'birthday', 'winback', 'incentive-design', 'welcome-seq', 'sms-program', 'tracking', 'email-found', 'feedback-loop', 'review-engine', 'seasonal-cal', 'reporting', 'referral', 'vip-comms', 'reminder-send', 'menu-eng', 'bar-events', 'giftcards', 'ugc-rights'], 'reviews/lean': ['gbp-setup', 'review-claim', 'feedback-loop', 'review-engine', 'review-responses'], 'reviews/standard': ['gbp-setup', 'review-claim', 'feedback-loop', 'review-engine', 'review-responses', 'photo-library', 'menu-photo-refresh', 'staff-advocacy'], 'reviews/aggressive': ['gbp-setup', 'review-claim', 'feedback-loop', 'listings-sync', 'review-engine', 'review-responses', 'photo-library', 'menu-photo-refresh', 'staff-advocacy']},
    fits: {},
  },
  onboardedThin: {
    usableCore: 1, route: 'safe',
    mixes: {'firstvisit/lean': ['gbp-setup', 'site-menu', 'review-engine', 'street-sampling', 'friend-hook'], 'firstvisit/standard': ['gbp-posts', 'photo-library', 'gbp-setup', 'site-menu', 'landing-page', 'local-seo', 'crm-list', 'social-mgmt', 'review-engine', 'tracking', 'creator-monthly', 'lto-launch', 'street-sampling', 'creator-collab', 'friend-hook', 'ordering-setup', 'ugc-rights', 'google-food-order'], 'firstvisit/aggressive': ['gbp-posts', 'photo-library', 'email-found', 'gbp-setup', 'site-menu', 'video-engine', 'landing-page', 'local-seo', 'crm-list', 'social-mgmt', 'review-engine', 'tracking', 'welcome-seq', 'listings-sync', 'review-responses', 'creator-monthly', 'paid-ads', 'concierge', 'lto-launch', 'menu-photo-refresh', 'street-sampling', 'creator-collab', 'friend-hook', 'ordering-setup', 'ai-phone', 'ugc-rights', 'google-food-order', 'referral'], 'nights/lean': ['sms-found', 'gbp-posts', 'sms-program', 'crm-list', 'tracking', 'event-pkg'], 'nights/standard': ['sms-found', 'gbp-posts', 'sms-program', 'crm-list', 'tracking', 'reporting', 'event-pkg', 'lto-launch', 'reminder-send', 'bar-events', 'menu-eng'], 'nights/aggressive': ['sms-found', 'gbp-posts', 'sms-program', 'loyalty', 'crm-list', 'tracking', 'reporting', 'seasonal-cal', 'event-pkg', 'lto-launch', 'reminder-send', 'bar-events', 'menu-eng', 'paid-ads', 'reservation-protect'], 'regulars/lean': ['sms-found', 'crm-list', 'winback', 'incentive-design', 'welcome-seq', 'tracking', 'email-found', 'reminder-send'], 'regulars/standard': ['newsletter', 'sms-found', 'crm-list', 'loyalty', 'birthday', 'winback', 'incentive-design', 'welcome-seq', 'sms-program', 'tracking', 'email-found', 'feedback-loop', 'review-engine', 'reporting', 'referral', 'reminder-send', 'menu-eng', 'ugc-rights'], 'regulars/aggressive': ['newsletter', 'sms-found', 'crm-list', 'loyalty', 'birthday', 'winback', 'incentive-design', 'welcome-seq', 'sms-program', 'tracking', 'email-found', 'feedback-loop', 'review-engine', 'seasonal-cal', 'reporting', 'referral', 'vip-comms', 'reminder-send', 'menu-eng', 'bar-events', 'giftcards', 'ugc-rights'], 'reviews/lean': ['gbp-setup', 'review-claim', 'feedback-loop', 'review-engine', 'review-responses'], 'reviews/standard': ['gbp-setup', 'review-claim', 'feedback-loop', 'review-engine', 'review-responses', 'photo-library', 'menu-photo-refresh', 'staff-advocacy'], 'reviews/aggressive': ['gbp-setup', 'review-claim', 'feedback-loop', 'listings-sync', 'review-engine', 'review-responses', 'photo-library', 'menu-photo-refresh', 'staff-advocacy']},
    fits: {},
  },
  richConnected: {
    usableCore: 7, route: 'tailored',
    mixes: {'firstvisit/lean': ['gbp-setup', 'site-menu', 'review-engine', 'street-sampling', 'friend-hook'], 'firstvisit/standard': ['gbp-posts', 'photo-library', 'gbp-setup', 'site-menu', 'review-engine', 'landing-page', 'local-seo', 'crm-list', 'social-mgmt', 'tracking', 'creator-monthly', 'street-sampling', 'creator-collab', 'lto-launch', 'ugc-rights', 'friend-hook', 'ordering-setup', 'google-food-order'], 'firstvisit/aggressive': ['gbp-posts', 'welcome-seq', 'photo-library', 'email-found', 'gbp-setup', 'site-menu', 'review-engine', 'review-responses', 'video-engine', 'landing-page', 'local-seo', 'crm-list', 'social-mgmt', 'tracking', 'listings-sync', 'paid-ads', 'creator-monthly', 'street-sampling', 'creator-collab', 'concierge', 'lto-launch', 'menu-photo-refresh', 'ugc-rights', 'friend-hook', 'ordering-setup', 'ai-phone', 'google-food-order', 'referral'], 'nights/lean': ['sms-found', 'gbp-posts', 'sms-program', 'crm-list', 'tracking', 'event-pkg'], 'nights/standard': ['sms-found', 'gbp-posts', 'sms-program', 'crm-list', 'tracking', 'reporting', 'event-pkg', 'lto-launch', 'reminder-send', 'bar-events', 'menu-eng'], 'nights/aggressive': ['sms-found', 'gbp-posts', 'sms-program', 'loyalty', 'crm-list', 'tracking', 'reporting', 'seasonal-cal', 'reservation-protect', 'event-pkg', 'lto-launch', 'reminder-send', 'bar-events', 'paid-ads', 'menu-eng'], 'regulars/lean': ['winback', 'welcome-seq', 'sms-found', 'crm-list', 'incentive-design', 'tracking', 'email-found', 'reminder-send'], 'regulars/standard': ['winback', 'welcome-seq', 'newsletter', 'sms-found', 'crm-list', 'loyalty', 'birthday', 'review-engine', 'incentive-design', 'sms-program', 'tracking', 'email-found', 'feedback-loop', 'reporting', 'referral', 'ugc-rights', 'reminder-send', 'menu-eng'], 'regulars/aggressive': ['winback', 'welcome-seq', 'newsletter', 'sms-found', 'crm-list', 'loyalty', 'birthday', 'review-engine', 'incentive-design', 'sms-program', 'tracking', 'email-found', 'feedback-loop', 'seasonal-cal', 'reporting', 'referral', 'vip-comms', 'ugc-rights', 'reminder-send', 'menu-eng', 'bar-events', 'giftcards'], 'reviews/lean': ['review-engine', 'review-responses', 'gbp-setup', 'review-claim', 'feedback-loop'], 'reviews/standard': ['review-engine', 'review-responses', 'gbp-setup', 'review-claim', 'feedback-loop', 'photo-library', 'menu-photo-refresh', 'staff-advocacy'], 'reviews/aggressive': ['review-engine', 'review-responses', 'gbp-setup', 'review-claim', 'feedback-loop', 'listings-sync', 'photo-library', 'menu-photo-refresh', 'staff-advocacy']},
    fits: {'paid-ads': 15, 'creator-collab': 15, 'street-sampling': 15, 'welcome-seq': 70, 'review-engine': 15, 'review-responses': 15, 'ugc-rights': 15},
  },
  gbpOnly: {
    usableCore: 3, route: 'tailored',
    mixes: {'firstvisit/lean': ['gbp-setup', 'site-menu', 'review-engine', 'street-sampling', 'friend-hook'], 'firstvisit/standard': ['gbp-posts', 'gbp-setup', 'photo-library', 'local-seo', 'site-menu', 'review-engine', 'landing-page', 'crm-list', 'social-mgmt', 'tracking', 'creator-monthly', 'lto-launch', 'street-sampling', 'creator-collab', 'friend-hook', 'ordering-setup', 'ugc-rights', 'google-food-order'], 'firstvisit/aggressive': ['gbp-posts', 'gbp-setup', 'photo-library', 'email-found', 'local-seo', 'site-menu', 'review-engine', 'listings-sync', 'review-responses', 'video-engine', 'landing-page', 'crm-list', 'social-mgmt', 'tracking', 'welcome-seq', 'creator-monthly', 'paid-ads', 'concierge', 'lto-launch', 'menu-photo-refresh', 'street-sampling', 'creator-collab', 'friend-hook', 'ordering-setup', 'ai-phone', 'ugc-rights', 'google-food-order', 'referral'], 'nights/lean': ['sms-found', 'gbp-posts', 'sms-program', 'crm-list', 'tracking', 'event-pkg'], 'nights/standard': ['sms-found', 'gbp-posts', 'sms-program', 'crm-list', 'tracking', 'reporting', 'event-pkg', 'lto-launch', 'reminder-send', 'bar-events', 'menu-eng'], 'nights/aggressive': ['sms-found', 'gbp-posts', 'sms-program', 'loyalty', 'crm-list', 'tracking', 'reporting', 'seasonal-cal', 'event-pkg', 'lto-launch', 'reminder-send', 'bar-events', 'menu-eng', 'paid-ads', 'reservation-protect'], 'regulars/lean': ['sms-found', 'crm-list', 'winback', 'incentive-design', 'welcome-seq', 'tracking', 'email-found', 'reminder-send'], 'regulars/standard': ['newsletter', 'sms-found', 'crm-list', 'loyalty', 'birthday', 'winback', 'review-engine', 'incentive-design', 'welcome-seq', 'sms-program', 'tracking', 'email-found', 'feedback-loop', 'reporting', 'referral', 'reminder-send', 'menu-eng', 'ugc-rights'], 'regulars/aggressive': ['newsletter', 'sms-found', 'crm-list', 'loyalty', 'birthday', 'winback', 'review-engine', 'incentive-design', 'welcome-seq', 'sms-program', 'tracking', 'email-found', 'feedback-loop', 'seasonal-cal', 'reporting', 'referral', 'vip-comms', 'reminder-send', 'menu-eng', 'bar-events', 'giftcards', 'ugc-rights'], 'reviews/lean': ['gbp-setup', 'review-claim', 'review-engine', 'review-responses', 'feedback-loop'], 'reviews/standard': ['gbp-setup', 'review-claim', 'review-engine', 'review-responses', 'feedback-loop', 'photo-library', 'menu-photo-refresh', 'staff-advocacy'], 'reviews/aggressive': ['gbp-setup', 'review-claim', 'listings-sync', 'review-engine', 'review-responses', 'feedback-loop', 'photo-library', 'menu-photo-refresh', 'staff-advocacy']},
    fits: {'gbp-setup': 30, 'listings-sync': 30, 'local-seo': 30, 'review-engine': 30, 'review-responses': 30},
  },
}

const s = new Suite()

s.group('Routing: what we know decides which path a client gets')
for (const [name, make] of Object.entries(PERSONAS)) {
  const sig = make()
  const g = GOLDEN[name]
  const r = richness(sig)
  s.check(`${name}: ${r.usableCore} usable core signals (frozen ${g.usableCore})`, r.usableCore === g.usableCore)
  s.check(`${name}: routes ${g.route}`, planRoute(sig) === g.route)
}

s.group('A blank persona moves nothing')
{
  const sig = coldStart()
  let nonzero = 0
  for (const goal of GOALS) for (const p of playsForGoalAtoms(goal)) {
    if (signalFit(p, sig).delta !== 0) nonzero++
  }
  s.check('zero signal-fit deltas across every play of every goal', nonzero === 0,
    'if we know nothing, nothing may nudge a plan')
  s.check('and it routes to the deterministic safe plan', planRoute(sig) === 'safe')
}

s.group('Ranked mixes are frozen, goal by goal, tier by tier')
for (const [name, make] of Object.entries(PERSONAS)) {
  const sig = make()
  const g = GOLDEN[name]
  for (const goal of GOALS) for (const tier of TIERS) {
    const key = `${goal}/${tier}`
    const got = brainRankedMix(goal, tier, sig).mix
    const want = g.mixes[key]
    const same = got.length === want.length && got.every((x, i) => x === want[i])
    s.check(`${name} ${key}: ${want.length} ids in frozen order`, same,
      same ? '' : `now: ${JSON.stringify(got)}\n        frozen: ${JSON.stringify(want)}`)
  }
}

s.group('Signal-fit deltas are frozen (firstvisit plays)')
for (const [name, make] of Object.entries(PERSONAS)) {
  const sig = make()
  const g = GOLDEN[name]
  const got: Record<string, number> = {}
  for (const p of playsForGoalAtoms('firstvisit')) {
    const f = signalFit(p, sig)
    if (f.delta !== 0) got[p.serviceId] = f.delta
  }
  const same = JSON.stringify(got) === JSON.stringify(g.fits)
  s.check(`${name}: ${Object.keys(g.fits).length} nonzero delta(s) unchanged`, same,
    same ? '' : `now: ${JSON.stringify(got)}\n        frozen: ${JSON.stringify(g.fits)}`)
}

s.group('Determinism: same signals in, same order out')
{
  const sig = richConnected()
  const a = brainRankedMix('firstvisit', 'standard', sig).mix
  const b = brainRankedMix('firstvisit', 'standard', richConnected()).mix
  s.check('two runs agree exactly', JSON.stringify(a) === JSON.stringify(b))
}

s.report('Brain routing')
