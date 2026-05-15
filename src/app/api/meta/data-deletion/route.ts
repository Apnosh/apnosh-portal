/**
 * Meta Data Deletion Request Callback.
 *
 * Meta hits this endpoint when a user explicitly requests that Apnosh
 * delete the data we hold about them (separate from "deauthorize",
 * which just revokes the token). We do the deletion immediately and
 * return a confirmation code Meta surfaces to the user.
 *
 * Configured in the Meta App dashboard under:
 *   App Settings → Basic → Data Deletion Request URL
 *   = https://portal.apnosh.com/api/meta/data-deletion
 *
 * GDPR / CCPA / Meta Platform Terms require us to honor this request
 * across every system we control. For now that means platform_connections,
 * any cached social_metrics rows referencing the user, and the audit log
 * is kept (deletion log itself is necessary for compliance proof).
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
    return NextResponse.json({ error: 'App secret not configured' }, { status: 500 })
  }

  const form = await req.formData()
  const signedRequest = form.get('signed_request')
  if (typeof signedRequest !== 'string') {
    return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 })
  }

  const payload = verifyMetaSignedRequest(signedRequest, APP_SECRET)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const metaUserId = payload.user_id
  const confirmationCode = newConfirmationCode()

  const admin = createAdminClient()

  /* 1) Pull every Apnosh connection that belongs to this Meta user.
     Capture client_ids so we can scrub their cached metrics next. */
  const { data: matches } = await admin
    .from('platform_connections')
    .select('id, client_id, platform')
    .in('platform', ['instagram', 'facebook'])
    .eq('platform_user_id', metaUserId)

  const affectedClientIds = Array.from(new Set((matches ?? []).map(m => m.client_id)))

  /* 2) Delete the connections (tokens + identifiers). */
  if (matches && matches.length > 0) {
    await admin
      .from('platform_connections')
      .delete()
      .in('id', matches.map(m => m.id))
  }

  /* 3) Scrub cached metrics rows tied to this user. social_metrics
     stores aggregates by platform + client, not by individual user, so
     the granular path is to clear meta-platform rows for the affected
     clients. We delete instagram + facebook social_metrics rows so
     nothing about this user's reach / engagement remains. */
  if (affectedClientIds.length > 0) {
    await admin
      .from('social_metrics')
      .delete()
      .in('client_id', affectedClientIds)
      .in('platform', ['instagram', 'facebook'])
  }

  /* 4) Audit log per affected client (kept for compliance proof). */
  for (const m of matches ?? []) {
    await logEvent({
      clientId: m.client_id,
      eventType: 'connection.data_deleted',
      subjectType: 'platform_connection',
      subjectId: m.id,
      actorRole: 'webhook',
      payload: { platform: m.platform, meta_user_id: metaUserId, confirmation_code: confirmationCode },
      summary: `${m.platform} data deletion processed`,
    }).catch(() => { /* never fail the webhook on log errors */ })
  }

  return NextResponse.json(
    buildMetaCallbackResponse(confirmationCode, `${APP_BASE_URL}/data-deletion`),
  )
}
