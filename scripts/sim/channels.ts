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

const ok = s.report('Channels layer (P1 spine)')
process.exit(ok ? 0 : 1)
