/**
 * CHANNELS LAYER GOLDENS (docs/CHANNELS-PLAN.md, P1) — npm run sim:channels
 *
 * Pins the pure spine: registry completeness, the alert policy's every transition,
 * structural-vs-counted failure classification, the upload lane's idempotency key, the
 * OAuth URL builders, and the owner alert copy under the house lint (no dashes).
 */

import { Suite } from './lib'
import { CHANNELS, CHANNEL_IDS, adapterFor } from '../../src/lib/channels/registry'
import { ALERT_THRESHOLD, buildAlertCopy, nextFailureState } from '../../src/lib/channels/sync'
import { ChannelError, countsAsFailure, type ChannelErrorCode } from '../../src/lib/channels/types'
import { dayKey, normalizeSource } from '../../src/lib/channels/adapters/statements'
import { signState, verifyState } from '../../src/lib/channels/oauth-state'
import { aggregateDaily, dayOfMs, windowStartMs } from '../../src/lib/channels/daily'
import { mapSocialAnalytics, AYRSHARE_PLATFORMS } from '../../src/lib/channels/adapters/ayrshare'
import { aggregateZernioPosts, aggregateZernioPostsByDay, normalizePlatform, ZERNIO_PLATFORMS } from '../../src/lib/channels/adapters/zernio'

const s = new Suite()

s.group('Registry: closed, complete, no silent gaps')
{
  s.check('every ChannelId has an adapter', CHANNEL_IDS.every((id) => Boolean(CHANNELS[id])))
  s.check('every adapter id matches its key', CHANNEL_IDS.every((id) => CHANNELS[id].id === id))
  s.check('unknown channels resolve to null, never crash', adapterFor('carrier-pigeon') === null)
  s.check('foreign rows (google etc) are not ours to sync', adapterFor('gbp') === null && adapterFor('instagram') === null)
  const kinds = new Set(CHANNEL_IDS.map((id) => CHANNELS[id].kind))
  s.check('kinds stay in the contract vocabulary', [...kinds].every((k) => ['api_key', 'oauth', 'upload', 'hosted_link'].includes(k)))
  s.check('the upload lane is ALWAYS available (the floor has no kill switch)', CHANNELS.statements.isConfigured() === true)
}

s.group('Alert policy: loud exactly once, at exactly three')
{
  s.check('ok resets the count', nextFailureState(2, 'ok').failures === 0 && !nextFailureState(2, 'ok').shouldAlert)
  s.check('first failure: count 1, no alert', nextFailureState(0, 'counted_failure').failures === 1 && !nextFailureState(0, 'counted_failure').shouldAlert)
  s.check('second failure: count 2, no alert', !nextFailureState(1, 'counted_failure').shouldAlert)
  s.check('third failure: ALERT, status error', nextFailureState(2, 'counted_failure').shouldAlert && nextFailureState(2, 'counted_failure').status === 'error')
  s.check('fourth failure: still error, NO repeat alert', !nextFailureState(3, 'counted_failure').shouldAlert && nextFailureState(3, 'counted_failure').status === 'error')
  s.check('recovery after alert resets to active', nextFailureState(5, 'ok').status === 'active')
  s.check('structural gaps never count and never alert', (() => { const d = nextFailureState(2, 'structural'); return d.failures === 2 && !d.shouldAlert && d.status === 'active' })())
  s.check('threshold is 3 (the plan of record number)', ALERT_THRESHOLD === 3)
}

s.group('Failure classification: incidents vs honest gaps')
{
  const counted: ChannelErrorCode[] = ['auth', 'rate_limit', 'upstream']
  const structural: ChannelErrorCode[] = ['not_configured', 'not_implemented', 'not_connected']
  s.check('runtime failures count', counted.every((c) => countsAsFailure(c)))
  s.check('structural states do not', structural.every((c) => !countsAsFailure(c)))
  s.check('ChannelError carries its code', new ChannelError('rate_limit', 'x').code === 'rate_limit')
}

s.group('Upload lane: the idempotency contract')
{
  s.check('day key is deterministic', dayKey('c1', 'square', '2026-08-06') === dayKey('c1', 'square', '2026-08-06'))
  s.check('day key separates sources', dayKey('c1', 'square', '2026-08-06') !== dayKey('c1', 'clover', '2026-08-06'))
  s.check('day key separates days', dayKey('c1', 'square', '2026-08-06') !== dayKey('c1', 'square', '2026-08-07'))
  s.check('statement sources normalize predictably', normalizeSource('DoorDash') === 'statement:doordash' && normalizeSource('Uber Eats') === 'statement:uber-eats')
}

s.group('OAuth adapters: env kill switch + honest URLs')
{
  const hadSq = { id: process.env.SQUARE_APP_ID, secret: process.env.SQUARE_APP_SECRET }
  delete process.env.SQUARE_APP_ID
  delete process.env.SQUARE_APP_SECRET
  s.check('square unconfigured without env', CHANNELS.square.isConfigured() === false)
  process.env.SQUARE_APP_ID = 'sq0idp-test'
  process.env.SQUARE_APP_SECRET = 'sq0csp-test'
  s.check('square configured with env', CHANNELS.square.isConfigured() === true)
  if (hadSq.id) process.env.SQUARE_APP_ID = hadSq.id
  if (hadSq.secret) process.env.SQUARE_APP_SECRET = hadSq.secret
}

s.group('OAuth state: signed, expiring, tamper-evident')
{
  process.env.CRON_SECRET = process.env.CRON_SECRET || 'sim-secret'
  const t0 = 1_000_000_000_000
  const tok = signState('client-abc', t0)
  s.check('roundtrip returns the client id', verifyState(tok, t0 + 1000) === 'client-abc')
  s.check('expires after ten minutes', verifyState(tok, t0 + 11 * 60 * 1000) === null)
  s.check('a tampered signature is rejected', verifyState(tok.slice(0, -2) + 'xx', t0 + 1000) === null)
  s.check('a tampered payload is rejected', (() => { const [p1, p2, mac] = tok.split('.'); void p1; return verifyState(`${Buffer.from('client-EVIL').toString('base64url')}.${p2}.${mac}`, t0 + 1000) === null })())
  s.check('garbage input is a calm null, never a crash', verifyState('not-a-token', t0) === null && verifyState(null, t0) === null && verifyState('a.b', t0) === null)
}

s.group('Owner alert copy: the house lint')
{
  for (const id of CHANNEL_IDS) {
    const copy = buildAlertCopy(id)
    s.check(`${id}: no em or en dash, has link, plain words`, !/[—–]/.test(copy.title + copy.body) && copy.link.startsWith('/dashboard'))
  }
  s.check('alert names the channel', buildAlertCopy('yelp').title.includes('Yelp'))
}

s.group('Daily aggregation: the POS fold (P4b)')
{
  const NOON = Date.UTC(2026, 7, 5, 12, 0, 0) // 2026-08-05T12:00Z
  const LATE = Date.UTC(2026, 7, 5, 23, 59, 59)
  const NEXT = Date.UTC(2026, 7, 6, 0, 0, 1) // one second into the next UTC day
  const days = aggregateDaily([
    { atMs: NOON, cents: 1250 },
    { atMs: LATE, cents: 800 },
    { atMs: NEXT, cents: 500 },
  ])
  s.check('payments bucket by UTC day', days.length === 2 && days[0].day === '2026-08-05' && days[1].day === '2026-08-06')
  s.check('gross sums within a day', days[0].gross_cents === 2050 && days[1].gross_cents === 500)
  s.check('orders count payments, not dollars', days[0].orders === 2 && days[1].orders === 1)
  s.check('days come back sorted ascending', days.every((d, i) => i === 0 || days[i - 1].day < d.day))

  const refunded = aggregateDaily([{ atMs: NOON, cents: 1000 }, { atMs: NOON, cents: -1000 }])
  s.check('a refund nets against the day, both count as orders', refunded[0].gross_cents === 0 && refunded[0].orders === 2)

  const dirty = aggregateDaily([{ atMs: NaN, cents: 100 }, { atMs: NOON, cents: NaN }, { atMs: NOON, cents: 300 }])
  s.check('garbage rows are skipped, never a crash', dirty.length === 1 && dirty[0].gross_cents === 300 && dirty[0].orders === 1)

  s.check('empty input is an empty fold, not an error', aggregateDaily([]).length === 0)
  s.check('the fold is deterministic (same input, same output)', JSON.stringify(aggregateDaily([{ atMs: NOON, cents: 7 }])) === JSON.stringify(aggregateDaily([{ atMs: NOON, cents: 7 }])))

  s.check('the sync window is seven days', dayOfMs(windowStartMs(NOON)) === '2026-07-29')
}

s.group('Ayrshare mapper: canonical columns from vendor aliases (P3)')
{
  const full = mapSocialAnalytics({ followersCount: 1200, reachCount: 5000, impressionsCount: 8000, profileViewsCount: 300, engagementCount: 450 })
  s.check('primary aliases map straight through',
    full.followers_total === 1200 && full.reach === 5000 && full.impressions === 8000 && full.profile_visits === 300 && full.engagement === 450)
  const alt = mapSocialAnalytics({ fanCount: 900, views: 4000, profileViews: 120, likeCount: 30, commentsCount: 12, sharesCount: 8 })
  s.check('fallback aliases work (fanCount, views, likes+comments+shares)',
    alt.followers_total === 900 && alt.impressions === 4000 && alt.profile_visits === 120 && alt.engagement === 50)
  const empty = mapSocialAnalytics({})
  s.check('missing metrics are honest zeros, never guesses',
    empty.reach === 0 && empty.impressions === 0 && empty.followers_total === 0 && empty.engagement === 0)
  s.check('null and garbage survive without crashing',
    mapSocialAnalytics(null).reach === 0 && mapSocialAnalytics({ followersCount: -5 }).followers_total === 0 && mapSocialAnalytics({ reach: 'lots' as unknown as number }).reach === 0)
  const fb = mapSocialAnalytics({ fanCount: 2100, pagePostEngagements: 640 })
  s.check('Facebook documented names: fanCount + pagePostEngagements',
    fb.followers_total === 2100 && fb.engagement === 640)
  const tk = mapSocialAnalytics({ followersCount: 5400, viewCountTotal: 90000, likeCountTotal: 700, commentCountTotal: 80, shareCountTotal: 20, profileViews: 400 })
  s.check('TikTok documented names: viewCountTotal + *Total engagement + profileViews',
    tk.followers_total === 5400 && tk.impressions === 90000 && tk.engagement === 800 && tk.profile_visits === 400)
  const li = mapSocialAnalytics({ impressionCount: 3000, commentCount: 12, likeCount: 88, followers: { totalFollowerCount: 640 } })
  s.check('LinkedIn documented names: impressionCount + nested followers object',
    li.impressions === 3000 && li.followers_total === 640 && li.engagement === 100)
  s.check('the platform list matches the social_metrics CHECK constraint',
    JSON.stringify(AYRSHARE_PLATFORMS) === JSON.stringify(['instagram', 'facebook', 'tiktok', 'linkedin']))
  s.check('the adapter is hosted_link and env kill-switched',
    CHANNELS.ayrshare.kind === 'hosted_link' && (Boolean(process.env.AYRSHARE_API_KEY) || CHANNELS.ayrshare.isConfigured() === false))
}

s.group('Zernio fold: post analytics -> daily platform totals (bake-off)')
{
  const rows = [
    { platform: 'instagram', analytics: { reach: 100, impressions: 150, likes: 10, comments: 2, shares: 1, saves: 3 } },
    { platform: 'instagram', analytics: { reach: 50, views: 80, likes: 5 } },
    { platform: 'facebook', analytics: { impressions: 200, likes: 20 } },
    { platform: 'x', analytics: { impressions: 999 } },
    { platform: 'tiktok', analytics: null },
  ]
  const out = aggregateZernioPosts(rows)
  s.check('per-platform sums are right (views backfills missing impressions)',
    out.instagram.reach === 150 && out.instagram.impressions === 230 && out.instagram.engagement === 21)
  s.check('facebook folds separately', out.facebook.impressions === 200 && out.facebook.engagement === 20)
  s.check('platforms outside our table are dropped, null analytics is a zero row',
    !('x' in out) && out.tiktok.reach === 0 && out.tiktok.engagement === 0)
  s.check('empty and null inputs fold to empty', Object.keys(aggregateZernioPosts([])).length === 0 && Object.keys(aggregateZernioPosts(null)).length === 0)
  s.check('zernio and ayrshare cover the same four platforms',
    JSON.stringify(ZERNIO_PLATFORMS) === JSON.stringify(AYRSHARE_PLATFORMS))
  s.check('the adapter is hosted_link and env kill-switched',
    CHANNELS.zernio.kind === 'hosted_link' && (Boolean(process.env.ZERNIO_API_KEY) || CHANNELS.zernio.isConfigured() === false))

  /* platform normalization: vendor variants map to our canonical four */
  s.check('platform names normalize by prefix, unknowns to empty',
    normalizePlatform('instagram-business') === 'instagram' &&
    normalizePlatform('Facebook Page') === 'facebook' &&
    normalizePlatform('TIKTOK') === 'tiktok' &&
    normalizePlatform('bluesky') === '' && normalizePlatform(null) === '')

  /* per-day fold: dated posts land on their day, undated on the fallback */
  {
    const dayRows = [
      { platform: 'instagram', publishedAt: '2026-08-01T12:00:00Z', analytics: { reach: 10, impressions: 20, likes: 1 } },
      { platform: 'instagram', publishedAt: '2026-08-01T18:00:00Z', analytics: { reach: 5, impressions: 5 } },
      { platform: 'facebook', date: '2026-08-03', analytics: { impressions: 7, likes: 2 } },
      { platform: 'instagram', analytics: { reach: 99 } },
    ]
    const byDay = aggregateZernioPostsByDay(dayRows, '2026-08-09')
    s.check('same-day posts sum on their day',
      byDay['2026-08-01'].instagram.reach === 15 && byDay['2026-08-01'].instagram.impressions === 25 && byDay['2026-08-01'].instagram.engagement === 1)
    s.check('other platforms keep their own day', byDay['2026-08-03'].facebook.impressions === 7)
    s.check('undated posts land on the fallback day', byDay['2026-08-09'].instagram.reach === 99)
    s.check('by-day fold of nothing is empty', Object.keys(aggregateZernioPostsByDay([], '2026-08-09')).length === 0)
  }
}

const ok = s.report('Channels layer (P1 spine)')
process.exit(ok ? 0 : 1)
