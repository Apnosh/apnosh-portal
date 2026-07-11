/**
 * POST /api/dashboard/gbp-post  { clientId, text, cta? }
 *
 * The owner "Post an update" rail: publishes ONE Google Business Profile post
 * (What's New) to the client's live listing, through the same v4 localPosts
 * publisher the admin work-order lane uses (src/lib/gbp-apply/owner-post.ts →
 * src/lib/publish/gbp.ts).
 *
 * cta shapes: { type: 'LEARN_MORE' | 'ORDER', url: 'https://...' } or
 * { type: 'CALL' } (uses the listing's phone; takes no url). Text + button
 * only — no photos and no scheduling on this rail.
 *
 * Gates, in order (same pattern as the sibling gbp-apply route):
 *   1. checkClientAccess — signed-in user must be linked to the client
 *   2. isProTier — 403 for non-Pro plans (server-enforced, never UI-only)
 *   3. deterministic validation (400 before anything touches Google)
 *   4. publishOwnerGbpPost — multi-location refusal, per-location rate slot
 *      (429), then the live publish.
 *
 * Response is HONEST — never 200 with a fake success:
 *   200 { ok: true, live: boolean, postUrl: string|null, message: string }
 *       live:true ONLY when Google returned the created post's resource name
 *       (a create's own confirmation); postUrl is Google's public searchUrl
 *       when one came back.
 *   4xx/5xx { ok: false, error: string } — plain owner words only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { publishOwnerGbpPost, validateOwnerPost } from '@/lib/gbp-apply/owner-post'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

export async function POST(req: NextRequest) {
  let body: { clientId?: unknown; text?: unknown; cta?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })
  }
  const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : null
  if (!clientId) return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })

  // Gate 1: the signed-in user must actually be this client.
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)

  // Gate 2: Pro plan, enforced at the SERVER (never trust the client UI alone).
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not post right now. Try again in a minute.' }, { status: 502 })
  }
  const { data: row } = await admin.from('clients').select('tier').eq('id', clientId).maybeSingle()
  if (!isProTier((row as { tier?: string | null } | null)?.tier)) {
    return NextResponse.json({ error: 'Posting from here is on the Pro plan.' }, { status: 403 })
  }

  // Gate 3: deterministic validation — a bad post is a 400 before anything touches Google.
  const checked = validateOwnerPost({ text: body.text, cta: body.cta })
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 })

  // Gate 4: the honest publish pipeline (multi-location refusal, rate slot, live create).
  const result = await publishOwnerGbpPost(clientId, { text: checked.text, cta: checked.cta })
  if (!result.ok) {
    if (result.code === 'rate_limited') {
      return NextResponse.json({ ok: false, error: 'Google only allows a few edits per minute. Try again in a minute.' }, { status: 429 })
    }
    const status = result.code === 'invalid' ? 400 : 502
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }

  // ok:true means Google accepted the post; live is true ONLY when Google
  // returned the created post's resource name (the create's own proof).
  return NextResponse.json({ ok: true, live: result.live, postUrl: result.postUrl, message: result.summary })
}
