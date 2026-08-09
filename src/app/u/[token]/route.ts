/**
 * GET /u/[token] — one-tap unsubscribe, no login, works forever.
 *
 * The token is HMAC-signed (rail-core.unsubToken); a bad signature changes
 * nothing and says so plainly. Unsubscribing is idempotent and permanent
 * until the guest opts back in with the owner.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyUnsubToken } from '@/lib/email/rail-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const page = (title: string, line: string) => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title></head>
<body style="margin:0;background:#F5F3EB;font-family:Georgia,serif;color:#1c2420;">
<div style="max-width:420px;margin:18vh auto 0;padding:0 20px;text-align:center;">
<h1 style="font-size:22px;margin:0 0 10px;">${title}</h1>
<p style="font-size:15px;line-height:1.6;color:#5a584e;margin:0;">${line}</p>
</div></body></html>`

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const secret = process.env.UNSUB_SECRET || process.env.CRON_SECRET || 'unsub-dev-secret'
  const contactId = verifyUnsubToken(token, secret)
  if (!contactId) {
    return new NextResponse(page('This link is not valid', 'It may have been cut short. Use the unsubscribe link at the bottom of the email.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  const admin = createAdminClient()
  await admin
    .from('guest_contacts')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', contactId)
    .is('unsubscribed_at', null)
  return new NextResponse(page('You are unsubscribed', 'You will not get emails from this restaurant again.'), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

/** RFC 8058 one-click unsubscribe (mail clients POST here). Same effect. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return GET(req, ctx)
}
