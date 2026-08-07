/**
 * CLOVER ADAPTER — the only file that knows Clover's wire format (CHANNELS-PLAN law 1).
 *
 * P4a: env kill-switch + OAuth v2 authorize URL + code-for-tokens exchange.
 * P4b: real daily-sales sync — SUCCESS payments from the last 7 days folded through
 * aggregateDaily into pos_daily_sales (idempotent on client_id+source+day, law 4).
 *
 * Clover OAuth v2 access tokens are SHORT-lived (~30 minutes), so the 401→refresh→retry
 * path is the common case here, not the edge. Clover also ROTATES the refresh token on
 * every refresh — the new pair is persisted BEFORE the retry so a crash never strands
 * the connection on a spent token.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'
import { aggregateDaily, windowStartMs, type PaymentEvent } from '../daily'
import { persistTokens } from '../tokens'

/* CLOVER_ENV=sandbox points every URL at Clover's sandbox (the dev app we configured);
 * unset/production points at the real thing. One switch, all URLs follow (law 3). */
const sandbox = () => process.env.CLOVER_ENV === 'sandbox'
const authorizeBase = () => (sandbox() ? 'https://sandbox.dev.clover.com' : 'https://www.clover.com')
export const cloverApiBase = () => (sandbox() ? 'https://apisandbox.dev.clover.com' : 'https://api.clover.com')

/** The code-for-tokens exchange (OAuth v2). Only this file knows Clover's endpoints. */
export async function cloverExchangeCode(code: string): Promise<{
  accessToken: string
  refreshToken: string | null
}> {
  const res = await fetch(`${cloverApiBase()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.CLOVER_APP_ID,
      client_secret: process.env.CLOVER_APP_SECRET,
      code,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof data.access_token !== 'string') {
    throw new ChannelError('auth', `Clover token exchange failed (${res.status})`)
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
  }
}

/** Refresh flow. Clover rotates BOTH tokens — the caller must persist the new pair. */
async function cloverRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string | null }> {
  const res = await fetch(`${cloverApiBase()}/oauth/v2/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.CLOVER_APP_ID,
      refresh_token: refreshToken,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof data.access_token !== 'string') {
    throw new ChannelError('auth', `Clover token refresh failed (${res.status}) — the owner needs to reconnect`)
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
  }
}

/** Page through the merchant's payments since a timestamp. Returns 'auth' (not a throw)
 *  on 401 so the caller can run refresh-once-retry without exception plumbing. */
async function listPayments(token: string, merchantId: string, sinceMs: number): Promise<PaymentEvent[] | 'auth'> {
  const events: PaymentEvent[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      filter: `createdTime>=${sinceMs}`,
      limit: String(PAGE),
      offset: String(offset),
    })
    const res = await fetch(`${cloverApiBase()}/v3/merchants/${merchantId}/payments?${params.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) return 'auth'
    if (res.status === 429) throw new ChannelError('rate_limit', 'Clover throttled the payments read')
    if (!res.ok) throw new ChannelError('upstream', `Clover payments read failed (${res.status})`)
    const data = (await res.json().catch(() => ({}))) as {
      elements?: Array<{ result?: string; amount?: number; createdTime?: number }>
    }
    const rows = data.elements ?? []
    for (const p of rows) {
      if (p.result && p.result !== 'SUCCESS') continue
      if (typeof p.amount === 'number' && typeof p.createdTime === 'number') {
        events.push({ atMs: p.createdTime, cents: p.amount })
      }
    }
    if (rows.length < PAGE) break
  }
  return events
}

export const cloverAdapter: ChannelAdapter = {
  id: 'clover',
  kind: 'oauth',

  isConfigured() {
    return Boolean(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET)
  },

  async connectStart(state: string): Promise<ConnectStart> {
    const appId = process.env.CLOVER_APP_ID
    if (!appId || !process.env.CLOVER_APP_SECRET) {
      throw new ChannelError('not_configured', 'CLOVER_APP_ID / CLOVER_APP_SECRET are not set')
    }
    const params = new URLSearchParams({ client_id: appId, state })
    return { url: `${authorizeBase()}/oauth/v2/authorize?${params.toString()}` }
  },

  async sync(connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'Clover env keys are not set')
    let token = connection.access_token
    if (!token) throw new ChannelError('not_connected', 'Clover connection has no access token')
    const merchantId = connection.platform_account_id
    if (!merchantId) throw new ChannelError('not_connected', 'Clover connection has no merchant id')

    const sinceMs = windowStartMs(Date.now())

    let events = await listPayments(token, merchantId, sinceMs)
    if (events === 'auth') {
      if (!connection.refresh_token) {
        throw new ChannelError('auth', 'Clover token expired and there is no refresh token — reconnect')
      }
      const fresh = await cloverRefresh(connection.refresh_token)
      await persistTokens(connection.id, fresh) // rotated pair lands before the retry
      token = fresh.accessToken
      events = await listPayments(token, merchantId, sinceMs)
      if (events === 'auth') throw new ChannelError('auth', 'Clover rejected a freshly refreshed token')
    }

    const days = aggregateDaily(events)
    if (days.length > 0) {
      const admin = createAdminClient()
      const { error } = await admin.from('pos_daily_sales').upsert(
        days.map(d => ({
          client_id: connection.client_id,
          source: 'clover',
          day: d.day,
          gross_cents: d.gross_cents,
          orders: d.orders,
          meta: { tz: 'UTC', env: sandbox() ? 'sandbox' : 'production' },
        })),
        { onConflict: 'client_id,source,day' }
      )
      if (error) throw new ChannelError('upstream', `pos_daily_sales write failed: ${error.message}`)
    }
    return { itemsWritten: days.length, note: `${events.length} payments -> ${days.length} days` }
  },
}
