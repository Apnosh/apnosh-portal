/**
 * ZERNIO WEBHOOKS — the vendor has been trying to tell us things for months.
 * =========================================================================
 * Zernio declares 53 webhook events. We were subscribed to none of them and had
 * no endpoint to receive one, so every fact below arrived nowhere:
 *
 *   account.disconnected     a client's Instagram token died and nobody knew
 *   post.failed              a scheduled post never went out, silently
 *   post.platform.failed     it went out on two of three accounts
 *   review.new               a new Google review, unanswered
 *   lead.received            a lead form submission
 *
 * The first two are the ones that make the product dishonest: a dashboard that
 * shows numbers from a dead connection, and a scheduler that loses posts without
 * saying so. Both are fixed by a URL existing.
 *
 * ON THE SIGNATURE. The spec says payloads are "signed with HMAC-SHA256 via the
 * X-Zernio-Signature header when the subscription has a secret". It does NOT say
 * the encoding, the prefix, or which bytes are signed -- I checked, and that is
 * genuinely absent rather than missed. So rather than guess one shape and reject
 * real deliveries, this compares the raw body's HMAC against every plausible
 * encoding in constant time, and records which one matched so the next version
 * can be exact. It fails CLOSED: no secret configured means no deliveries
 * accepted, because an unauthenticated webhook that writes to the database is a
 * worse bug than a webhook that does not work.
 *
 * ON DUPLICATES. Delivery is at-least-once and X-Zernio-Event-Id is stable across
 * retries and redeliveries, so the insert into zernio_webhook_events IS the lock.
 * A second delivery collides on the primary key, we answer 200, and no handler
 * runs twice.
 *
 * Always 200 on a well-formed, authentic event, even when a handler fails. A 500
 * here makes Zernio retry, and after 20 terminal failures it disables the
 * subscription entirely -- so a bug in one handler must not cost us the endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Every shape the header might plausibly carry, since the spec names none.
 *  Exported so scripts/smoke-zernio-webhook.ts can prove it, because "the
 *  signature check works" is not a thing to take on faith. */
export function signatureMatches(raw: string, secret: string, header: string): { ok: boolean; shape: string } {
  const sent = header.trim().replace(/^sha256=/i, '')
  const mac = createHmac('sha256', secret).update(raw, 'utf8').digest()
  const candidates: Array<[string, string]> = [
    ['hex', mac.toString('hex')],
    ['base64', mac.toString('base64')],
    ['base64url', mac.toString('base64url')],
  ]
  for (const [shape, expected] of candidates) {
    /* Length first, because timingSafeEqual throws on a mismatch rather than
       returning false, and the length is not the secret. */
    if (expected.length !== sent.length) continue
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(sent))) return { ok: true, shape }
  }
  return { ok: false, shape: '' }
}

interface Payload {
  id?: string
  event?: string
  account?: { accountId?: string; profileId?: string; platform?: string; username?: string; disconnectionType?: string; reason?: string }
  post?: Record<string, unknown>
  [k: string]: unknown
}

export async function POST(req: NextRequest) {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET
  if (!secret) {
    console.error('[zernio-webhook] ZERNIO_WEBHOOK_SECRET is not set; refusing every delivery')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  /* The RAW body, before any parsing: an HMAC is over bytes, and JSON.parse
     followed by JSON.stringify is not the same bytes. */
  const raw = await req.text()
  const header = req.headers.get('x-zernio-signature') ?? req.headers.get('x-late-signature') ?? ''
  if (!header) return NextResponse.json({ error: 'unsigned' }, { status: 401 })

  const check = signatureMatches(raw, secret, header)
  if (!check.ok) {
    console.warn('[zernio-webhook] signature did not match any known encoding; header length', header.length)
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  let body: Payload
  try { body = JSON.parse(raw) as Payload } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const eventId = body.id || req.headers.get('x-zernio-event-id') || req.headers.get('x-late-event-id') || ''
  const event = body.event || req.headers.get('x-zernio-event') || req.headers.get('x-late-event') || ''
  if (!eventId || !event) return NextResponse.json({ error: 'missing id or event' }, { status: 400 })

  const admin = createAdminClient()

  /* The insert is the lock. A duplicate collides here and stops. */
  const { error: dupe } = await admin.from('zernio_webhook_events')
    .insert({ id: eventId, event, payload: body as unknown as Record<string, unknown> })
  if (dupe) {
    if (dupe.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
    console.error('[zernio-webhook] could not record the event:', dupe.message)
    /* Recording failed, so we cannot promise a handler will not run twice.
       Better to do nothing than to act without the guard. */
    return NextResponse.json({ ok: true, recorded: false })
  }

  let note = `signature:${check.shape}`
  try {
    note = `${note} ${await handle(event, body, admin)}`
  } catch (e) {
    note = `${note} handler-error: ${e instanceof Error ? e.message : 'unknown'}`
    console.error('[zernio-webhook] handler failed for', event, e)
  }
  await admin.from('zernio_webhook_events').update({ handled: true, handler_note: note.slice(0, 500) }).eq('id', eventId)

  return NextResponse.json({ ok: true })
}

type Admin = ReturnType<typeof createAdminClient>

async function handle(event: string, body: Payload, admin: Admin): Promise<string> {
  switch (event) {
    /* ── A CONNECTION DIED ────────────────────────────────────────────────
       The one that matters most. Until now a revoked token showed up as
       numbers that quietly stopped moving, which reads as a quiet month
       rather than a broken integration. disconnectionType tells us which
       conversation to have: "you disconnected this" or "this expired". */
    case 'account.disconnected': {
      const profileId = body.account?.profileId
      if (!profileId) return 'no profileId'
      const intentional = body.account?.disconnectionType === 'intentional'
      /* 'error' and 'disconnected' rather than a new value: the column has had a
         CHECK since migration 043 allowing only pending | active | error |
         disconnected, and inventing a status here would fail the write at
         runtime for the one event we most need to land. They also happen to be
         the right words -- the owner took it away, or it broke. */
      const { error, count } = await admin.from('channel_connections')
        .update({
          status: intentional ? 'disconnected' : 'error',
          sync_error: `${body.account?.platform ?? 'account'} ${intentional ? 'was disconnected' : 'lost access'}: ${body.account?.reason ?? 'no reason given'}`,
        }, { count: 'exact' })
        .eq('channel', 'zernio')
        .eq('platform_account_id', profileId)
      if (error) throw new Error(error.message)
      return `marked ${count ?? 0} connection(s) ${intentional ? 'disconnected' : 'error'}`
    }

    case 'account.connected': {
      const profileId = body.account?.profileId
      if (!profileId) return 'no profileId'
      const { count } = await admin.from('channel_connections')
        .update({ status: 'active', sync_error: null, consecutive_failures: 0 }, { count: 'exact' })
        .eq('channel', 'zernio').eq('platform_account_id', profileId)
      return `reactivated ${count ?? 0} connection(s)`
    }

    /* ── A POST DID NOT GO OUT ────────────────────────────────────────────
       post.failed is nothing published; post.partial is some platforms did.
       Both were invisible. This also answers the Facebook Reel duration
       question for free: if Zernio's documented 3-60s is stale, a rejected
       75-second Reel arrives here with the platform's own error text. */
    case 'post.failed':
    case 'post.partial':
    case 'post.platform.failed': {
      const post = (body.post ?? {}) as Record<string, unknown>
      const postId = String(post.id ?? post._id ?? '')
      if (!postId) return 'no post id'
      const reason = String(post.error ?? post.reason ?? (body as Record<string, unknown>).reason ?? event)
      const { count } = await admin.from('content_drafts')
        .update({ status: 'rejected', rejection_reason: `${event}: ${reason}`.slice(0, 500) }, { count: 'exact' })
        .eq('published_post_id', postId)
      return `flagged ${count ?? 0} draft(s) as failed`
    }

    case 'post.published': {
      const post = (body.post ?? {}) as Record<string, unknown>
      const postId = String(post.id ?? post._id ?? '')
      if (!postId) return 'no post id'
      const { count } = await admin.from('content_drafts')
        .update({ status: 'published', published_at: new Date().toISOString() }, { count: 'exact' })
        .eq('published_post_id', postId)
      return `confirmed ${count ?? 0} draft(s) published`
    }

    /* Recorded and left alone for now. Both deserve a screen, and neither
       should be invented in a webhook handler at 2am. */
    case 'review.new':
    case 'review.updated':
    case 'lead.received':
    case 'comment.received':
      return 'recorded, no handler yet'

    case 'webhook.test':
      return 'test received'

    default:
      return 'no handler'
  }
}

/** Zernio verifies an endpoint before enabling it; a bare GET should not 404. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'zernio-webhooks' })
}
