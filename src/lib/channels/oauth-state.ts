/**
 * OAUTH STATE — signed, expiring, tamper-evident (CHANNELS-PLAN P4).
 *
 * The state parameter carries the connecting client's id through the vendor round-trip.
 * It is HMAC-signed so a callback can never be forged into attaching a merchant's tokens
 * to someone else's client, and it expires in ten minutes so a stale link cannot be
 * replayed. Pure functions, golden-tested in scripts/sim/channels.ts.
 */

import { createHmac, timingSafeEqual } from 'crypto'

const TTL_MS = 10 * 60 * 1000

function secret(): string {
  const s = process.env.CRON_SECRET
  if (!s) throw new Error('CRON_SECRET is required to sign OAuth state')
  return s
}

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const unb64url = (s: string) => Buffer.from(s, 'base64url').toString('utf8')

function sig(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

/** clientId + expiry, signed. Safe to hand to a third party as an opaque token. */
export function signState(clientId: string, now = Date.now()): string {
  const payload = `${b64url(clientId)}.${now + TTL_MS}`
  return `${payload}.${sig(payload, secret())}`
}

/** Returns the clientId when the signature holds and the token is fresh; null otherwise.
 *  Never throws on garbage input: a bad state is a null, said out loud by the caller. */
export function verifyState(state: string | null, now = Date.now()): string | null {
  if (!state) return null
  const parts = state.split('.')
  if (parts.length !== 3) return null
  const [encoded, expiry, mac] = parts
  const payload = `${encoded}.${expiry}`
  const expected = sig(payload, secret())
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const exp = Number(expiry)
  if (!Number.isFinite(exp) || now > exp) return null
  try {
    return unb64url(encoded)
  } catch {
    return null
  }
}
