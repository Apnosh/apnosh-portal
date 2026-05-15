/**
 * Meta Deauthorize Callback.
 *
 * Meta hits this endpoint when a user removes the Apnosh app from their
 * Facebook or Instagram account settings. We delete the matching
 * platform_connections row(s) so we stop trying to refresh dead tokens.
 *
 * Configured in the Meta App dashboard under:
 *   App Settings → Basic → Deauthorize Callback URL
 *   = https://portal.apnosh.com/api/meta/deauthorize
 *
 * Per Meta's spec we must respond with JSON containing a confirmation
 * URL + code so the user has a way to see deletion status.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMetaCallbackResponse, newConfirmationCode, verifyMetaSignedRequest } from '@/lib/meta-signed-request'
import { logEvent } from '@/lib/events/log'

export const runtime = 'nodejs'

const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.apnosh.com'

export async function POST(req: Request) {
  if (!APP_SECRET) {
    return NextResponse.json({ error: 'App secret not configured' }, { status: 503 })
  }

  /* Meta always posts a form body. Guard against probes (empty body,
     wrong content-type) so reviewers see a clean 400 instead of a 500. */
  let signedRequest: string | null = null
  try {
    const form = await req.formData()
    const raw = form.get('signed_request')
    if (typeof raw === 'string') signedRequest = raw
  } catch {
    /* fall through to the 400 below */
  }
  if (!signedRequest) {
    return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 })
  }

  const payload = verifyMetaSignedRequest(signedRequest, APP_SECRET)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const metaUserId = payload.user_id
  const confirmationCode = newConfirmationCode()

  /* Delete every Apnosh connection that we know belongs to this Meta
     user id. We match against platform_user_id on platform_connections,
     across both instagram and facebook rows since one Meta user can
     authorize both. */
  const admin = createAdminClient()
  const { data: matches } = await admin
    .from('platform_connections')
    .select('id, client_id, platform')
    .in('platform', ['instagram', 'facebook'])
    .eq('platform_user_id', metaUserId)

  if (matches && matches.length > 0) {
    await admin
      .from('platform_connections')
      .delete()
      .in('id', matches.map(m => m.id))

    // Audit log per affected client.
    for (const m of matches) {
      await logEvent({
        clientId: m.client_id,
        eventType: 'connection.deauthorized',
        subjectType: 'platform_connection',
        subjectId: m.id,
        actorRole: 'webhook',
        payload: { platform: m.platform, meta_user_id: metaUserId, confirmation_code: confirmationCode },
        summary: `${m.platform} deauthorized from Meta settings`,
      }).catch(() => { /* don't fail the webhook on log errors */ })
    }
  }

  return NextResponse.json(
    buildMetaCallbackResponse(confirmationCode, `${APP_BASE_URL}/data-deletion`),
  )
}
