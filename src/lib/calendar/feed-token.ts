/**
 * HMAC tokens for the public-but-private calendar feed.
 *
 * The /api/calendar/feed endpoint serves a client's calendar as iCal
 * so the owner can subscribe in Google Calendar / Apple Calendar /
 * Outlook. We don't want the URL guessable, but we also don't want
 * the user to need a session cookie (subscription clients won't have
 * one). So we sign the clientId with a server-side secret; the URL
 * carries the clientId + token, and the route verifies before serving.
 *
 * Token can be rotated by changing CALENDAR_FEED_SECRET (will
 * invalidate every outstanding subscription).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET =
  process.env.CALENDAR_FEED_SECRET ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'dev-only-secret-do-not-use-in-prod'

export function signClientId(clientId: string): string {
  return createHmac('sha256', SECRET).update(clientId).digest('hex').slice(0, 32)
}

export function verifyClientId(clientId: string, token: string): boolean {
  if (!clientId || !token) return false
  const expected = signClientId(clientId)
  if (expected.length !== token.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token))
  } catch {
    return false
  }
}
