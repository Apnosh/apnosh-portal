/**
 * THE SYNC ENGINE — pure orchestration over the adapter contract (CHANNELS-PLAN law 2).
 *
 * Walks active connections whose channel has a registered, configured adapter; runs each
 * sync in its own try/catch; writes a channel_sync_runs ledger row for EVERY attempt; and
 * maintains consecutive_failures on the connection. Exactly on the transition to
 * ALERT_THRESHOLD the owner gets one notification through the existing path — never a
 * repeat per failing run, never silence (the GA4 outage law).
 *
 * The failure-counting decision is a pure function (nextFailureState) so the goldens can
 * pin every transition without a database.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { notifyClientOwners } from '@/lib/notifications'
import { adapterFor } from './registry'
import { ChannelError, countsAsFailure, type ChannelConnection } from './types'

export const ALERT_THRESHOLD = 3

export interface FailureDecision {
  failures: number
  status: 'active' | 'error'
  shouldAlert: boolean
}

/** The whole alert policy in one pure function. ok resets; counted failures increment;
 *  the alert fires exactly when the count REACHES the threshold, not on every run past
 *  it; structural errors (not_configured / not_implemented / not_connected) neither
 *  count nor alert — they are gaps to show in the UI, not incidents to page about. */
export function nextFailureState(prevFailures: number, outcome: 'ok' | 'counted_failure' | 'structural'): FailureDecision {
  if (outcome === 'ok') return { failures: 0, status: 'active', shouldAlert: false }
  if (outcome === 'structural') return { failures: prevFailures, status: 'active', shouldAlert: false }
  const failures = prevFailures + 1
  return { failures, status: failures >= ALERT_THRESHOLD ? 'error' : 'active', shouldAlert: failures === ALERT_THRESHOLD }
}

/** Owner alert copy. House lint applies: plain words, no em or en dashes. */
export function buildAlertCopy(channel: string): { kind: 'channel_broken'; title: string; body: string; link: string } {
  const name = channel === 'yelp' ? 'Yelp' : channel === 'square' ? 'Square' : channel === 'clover' ? 'Clover' : channel === 'ayrshare' ? 'social accounts' : channel
  return {
    kind: 'channel_broken' as const,
    title: `Your ${name} connection stopped working`,
    body: `We could not pull fresh ${name} data after three tries. Reconnect it and everything resumes on its own.`,
    link: '/dashboard/connected-accounts',
  }
}

export interface EngineRun {
  scanned: number
  synced: number
  failed: number
  skipped: number
  alerts: number
}

export async function syncChannels(only?: string[]): Promise<EngineRun> {
  const admin = createAdminClient()
  const run: EngineRun = { scanned: 0, synced: 0, failed: 0, skipped: 0, alerts: 0 }

  let query = admin
    .from('channel_connections')
    .select('id, client_id, channel, connection_type, platform_account_id, access_token, refresh_token, status, consecutive_failures, metadata')
    .eq('status', 'active')
  if (only && only.length > 0) query = query.in('channel', only)
  const { data: connections, error } = await query
  if (error) throw new Error(`channels engine could not list connections: ${error.message}`)

  for (const raw of connections ?? []) {
    const connection = raw as unknown as ChannelConnection
    run.scanned++
    const adapter = adapterFor(connection.channel)
    if (!adapter || !adapter.isConfigured()) {
      run.skipped++
      continue
    }

    const startedAt = new Date().toISOString()
    let ok = false
    let itemsWritten = 0
    let errorText: string | null = null
    let structural = false

    try {
      const result = await adapter.sync(connection)
      ok = true
      itemsWritten = result.itemsWritten
      errorText = result.note ?? null
    } catch (e) {
      const ce = e instanceof ChannelError ? e : new ChannelError('upstream', e instanceof Error ? e.message : String(e))
      errorText = `${ce.code}: ${ce.message}`
      structural = !countsAsFailure(ce.code)
    }

    /* The ledger row: every attempt, success or failure (law 2). The table ships in
     * migration 234; until the owner applies it, the failure to write the ledger is
     * ITSELF said loudly in logs rather than crashing the sync. */
    try {
      await admin.from('channel_sync_runs').insert({
        connection_id: connection.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: ok ? 'ok' : 'error',
        items_written: itemsWritten,
        error_text: ok ? errorText : errorText,
      })
    } catch (ledgerErr) {
      console.error('[channels] sync ledger write failed (is migration 234 applied?)', ledgerErr)
    }

    const decision = nextFailureState(
      connection.consecutive_failures ?? 0,
      ok ? 'ok' : structural ? 'structural' : 'counted_failure',
    )

    const update: Record<string, unknown> = {
      last_sync_at: new Date().toISOString(),
      sync_error: ok ? null : errorText,
      status: decision.status,
      consecutive_failures: decision.failures,
    }
    const { error: upErr } = await admin.from('channel_connections').update(update).eq('id', connection.id)
    if (upErr) {
      /* consecutive_failures ships in 234; degrade to the columns that exist. */
      delete update.consecutive_failures
      await admin.from('channel_connections').update(update).eq('id', connection.id)
    }

    if (ok) run.synced++
    else if (!structural) run.failed++
    else run.skipped++

    if (decision.shouldAlert) {
      run.alerts++
      try {
        await notifyClientOwners(connection.client_id, buildAlertCopy(connection.channel))
      } catch (notifyErr) {
        console.error('[channels] owner alert failed', notifyErr)
      }
    }
  }

  return run
}
