/**
 * Fire the social-metrics sync for a single client immediately after a
 * connection is made, so a freshly-connected Instagram/Facebook account
 * populates right away instead of sitting at "last synced: never" until the
 * nightly cron. Best-effort: never throws, so it can't break the OAuth
 * callback / connect flow.
 */
export async function triggerSocialSync(clientId: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return false
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sync-social-metrics`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      // backfill so the first sync pulls history, not just today.
      body: JSON.stringify({ client_id: clientId, backfill: true }),
    })
    return res.ok
  } catch {
    return false
  }
}
