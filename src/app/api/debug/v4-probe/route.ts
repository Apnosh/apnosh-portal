/**
 * TEMPORARY diagnostic endpoint — checks whether this Google Cloud
 * project has been granted v4 Google Business Profile API access for
 * review data (the legacy mybusiness.googleapis.com/v4 surface that is
 * gated behind a per-project Google allowlist application).
 *
 * Read-only: refreshes a stored GBP token and does a single GET against
 * the v4 reviews endpoint. Never writes. Never returns tokens.
 *
 * Owner-gated (apnosh@gmail.com only). DELETE after the test.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshGoogleToken } from '@/lib/google'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // 1) Auth gate — owner only.
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  if (user.email !== 'apnosh@gmail.com') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // 2) Find an active GBP connection with a refresh token + real resource name.
  const { data: conns } = await admin
    .from('channel_connections')
    .select('platform_account_id, refresh_token, access_token, token_expires_at')
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
    .not('refresh_token', 'is', null)
    .limit(5)

  if (!conns || conns.length === 0) {
    return NextResponse.json({ error: 'no active GBP connection with a refresh token found' }, { status: 404 })
  }

  const results: Array<Record<string, unknown>> = []
  let verdict: string | null = null

  for (const c of conns) {
    const resource = c.platform_account_id as string // accounts/{a}/locations/{l}
    let accessToken: string
    try {
      const tok = await refreshGoogleToken(c.refresh_token as string)
      accessToken = tok.access_token
    } catch (e) {
      results.push({ resource, step: 'refresh', error: (e as Error).message })
      verdict = verdict || 'REFRESH_FAILED'
      continue
    }

    const url = `https://mybusiness.googleapis.com/v4/${resource}/reviews?pageSize=5`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    const text = await res.text()
    let parsed: unknown = null
    try { parsed = JSON.parse(text) } catch { /* keep raw */ }

    const errMsg =
      (parsed as { error?: { message?: string; status?: string } })?.error?.message ?? null
    const reviewCount =
      (parsed as { reviews?: unknown[] })?.reviews?.length ?? null

    results.push({
      resource,
      httpStatus: res.status,
      errorMessage: errMsg,
      reviewCount,
      bodyPreview: text.slice(0, 400),
    })

    if (res.ok) { verdict = 'GRANTED'; break }
    if (res.status === 403) {
      verdict = /SERVICE_DISABLED|has not been used|disabled/i.test(text)
        ? 'PENDING_SERVICE_DISABLED'
        : 'PENDING_DENIED'
    } else if (res.status === 429) {
      verdict = verdict || 'LIKELY_GRANTED_RATE_LIMITED'
    } else {
      verdict = verdict || `UNEXPECTED_${res.status}`
    }
  }

  const interpretation: Record<string, string> = {
    GRANTED: '✅ v4 review access is GRANTED — the endpoint returned reviews.',
    PENDING_SERVICE_DISABLED: '❌ Still pending — Business Profile API not enabled / project not allowlisted (SERVICE_DISABLED).',
    PENDING_DENIED: '❌ Still pending — 403 PERMISSION_DENIED (application not yet approved).',
    LIKELY_GRANTED_RATE_LIMITED: '⚠️ 429 rate limited — usually means access IS granted but quota was hit.',
    REFRESH_FAILED: '⚠️ Could not refresh the stored token — inconclusive.',
  }

  return NextResponse.json({
    verdict,
    interpretation: verdict ? (interpretation[verdict] ?? 'See results.') : 'No probe ran.',
    results,
  })
}
