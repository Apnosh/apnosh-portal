/**
 * /api/dashboard/gbp/status — client-side capability check.
 *
 * Tells the UI what features it can safely expose for the connected
 * Google Business Profile listing. Three signals matter:
 *
 *   v4Enabled  — Can we read/write reviews and post Local Posts?
 *                Requires the legacy mybusiness.googleapis.com API,
 *                which Google gates behind a separate allowlist.
 *                Detected by checking sync_error for the well-known
 *                "Google My Business API has not been used" message.
 *
 *   verified   — Is the listing verified by Google? Unverified
 *                listings can't return Performance API metrics
 *                ("Requested entity was not found") and reject most
 *                write operations.
 *
 *   connected  — Is there an active per-client OAuth connection at
 *                all? Without it nothing else matters.
 *
 * The UI uses these to disable buttons, surface banners, and skip
 * fetches that would otherwise error.
 */

import { NextResponse } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('channel_connections')
    .select('id, status, platform_account_name, sync_error, last_sync_at')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .maybeSingle()

  if (!row || row.status !== 'active') {
    return NextResponse.json({
      connected: false,
      v4Enabled: false,
      verified: false,
      caseId: '5-7311000040463',
    })
  }

  const syncErr = ((row.sync_error as string | null) ?? '').toLowerCase()

  /* v4 disabled signal: Google's standard "API has not been used"
     error from mybusiness.googleapis.com. Once they approve our case
     and we successfully fetch a single review, sync_error drops the
     v4 portion and this flips to true. */
  const v4Disabled = /api has not been used|mybusiness\.googleapis\.com.*disabled/.test(syncErr)
  const v4Enabled = !v4Disabled && !!row.last_sync_at

  /* Verification signal: "Requested entity was not found" on the
     Performance API for THIS location means it's unverified or
     service-area-only. */
  const unverified = /metrics .*?: requested entity was not found/i.test(syncErr)

  return NextResponse.json({
    connected: true,
    v4Enabled,
    verified: !unverified,
    locationName: row.platform_account_name,
    syncError: row.sync_error,
    caseId: '5-7311000040463',
  })
}
