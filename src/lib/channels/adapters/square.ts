/**
 * SQUARE ADAPTER — the only file that knows Square's wire format (CHANNELS-PLAN law 1).
 *
 * P4a: OAuth authorize URL + code-for-tokens exchange.
 * P4b: real daily-sales sync — COMPLETED payments from the last 7 days folded through
 * aggregateDaily into pos_daily_sales (idempotent on client_id+source+day, law 4).
 * Access tokens expire (~30 days); a 401 triggers one refresh-and-retry, and the
 * refreshed token is persisted before the retry so a crash never loses it.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'
import { aggregateDaily, windowStartMs, type PaymentEvent } from '../daily'
import { persistTokens } from '../tokens'

const API = 'https://connect.squareup.com'
/** Pin the API version so Square's monthly releases can't shift the shape under us. */
const SQUARE_VERSION = '2024-01-18'
/** Read-only scopes: sales into pos_daily_sales. Never payments-write. */
const SCOPES = ['MERCHANT_PROFILE_READ', 'ORDERS_READ', 'PAYMENTS_READ'] as const

/** The code-for-tokens exchange. Only this file knows Square's token endpoint. */
export async function squareExchangeCode(code: string): Promise<{
  accessToken: string
  refreshToken: string | null
  merchantId: string
  expiresAt: string | null
}> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof data.access_token !== 'string') {
    throw new ChannelError('auth', `Square token exchange failed (${res.status})`)
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    merchantId: typeof data.merchant_id === 'string' ? data.merchant_id : 'unknown',
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
  }
}

/** Refresh an expired access token. Square may or may not rotate the refresh token. */
async function squareRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string | null }> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof data.access_token !== 'string') {
    throw new ChannelError('auth', `Square token refresh failed (${res.status}) — the owner needs to reconnect`)
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
  }
}

/** Page through ListPayments for the window. Returns 'auth' (not a throw) on 401 so the
 *  caller can run the refresh-once-retry dance without exception plumbing. */
async function listPayments(token: string, beginMs: number, endMs: number): Promise<PaymentEvent[] | 'auth'> {
  const events: PaymentEvent[] = []
  let cursor: string | null = null
  do {
    const params = new URLSearchParams({
      begin_time: new Date(beginMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
      sort_order: 'ASC',
      limit: '100',
    })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`${API}/v2/payments?${params.toString()}`, {
      headers: { authorization: `Bearer ${token}`, 'Square-Version': SQUARE_VERSION },
    })
    if (res.status === 401 || res.status === 403) return 'auth'
    if (res.status === 429) throw new ChannelError('rate_limit', 'Square throttled the payments read')
    if (!res.ok) throw new ChannelError('upstream', `Square payments read failed (${res.status})`)
    const data = (await res.json().catch(() => ({}))) as {
      payments?: Array<{ status?: string; created_at?: string; amount_money?: { amount?: number } }>
      cursor?: string
    }
    for (const p of data.payments ?? []) {
      if (p.status !== 'COMPLETED') continue
      const atMs = p.created_at ? Date.parse(p.created_at) : NaN
      const cents = p.amount_money?.amount
      if (Number.isFinite(atMs) && typeof cents === 'number') events.push({ atMs, cents })
    }
    cursor = data.cursor ?? null
  } while (cursor)
  return events
}

export const squareAdapter: ChannelAdapter = {
  id: 'square',
  kind: 'oauth',

  isConfigured() {
    return Boolean(process.env.SQUARE_APP_ID && process.env.SQUARE_APP_SECRET)
  },

  async connectStart(state: string): Promise<ConnectStart> {
    const appId = process.env.SQUARE_APP_ID
    if (!appId || !process.env.SQUARE_APP_SECRET) {
      throw new ChannelError('not_configured', 'SQUARE_APP_ID / SQUARE_APP_SECRET are not set')
    }
    /* state is the SIGNED token from oauth-state.ts; the callback verifies it before
     * persisting anything. */
    const params = new URLSearchParams({
      client_id: appId,
      scope: SCOPES.join(' '),
      session: 'false',
      state,
    })
    return { url: `${API}/oauth2/authorize?${params.toString()}` }
  },

  async sync(connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'Square env keys are not set')
    let token = connection.access_token
    if (!token) throw new ChannelError('not_connected', 'Square connection has no access token')

    const endMs = Date.now()
    const beginMs = windowStartMs(endMs)

    let events = await listPayments(token, beginMs, endMs)
    if (events === 'auth') {
      if (!connection.refresh_token) {
        throw new ChannelError('auth', 'Square token expired and there is no refresh token — reconnect')
      }
      const fresh = await squareRefresh(connection.refresh_token)
      await persistTokens(connection.id, fresh) // before the retry: a crash never loses it
      token = fresh.accessToken
      events = await listPayments(token, beginMs, endMs)
      if (events === 'auth') throw new ChannelError('auth', 'Square rejected a freshly refreshed token')
    }

    const days = aggregateDaily(events)
    if (days.length > 0) {
      const admin = createAdminClient()
      const { error } = await admin.from('pos_daily_sales').upsert(
        days.map(d => ({
          client_id: connection.client_id,
          source: 'square',
          day: d.day,
          gross_cents: d.gross_cents,
          orders: d.orders,
          meta: { tz: 'UTC' },
        })),
        { onConflict: 'client_id,source,day' }
      )
      if (error) throw new ChannelError('upstream', `pos_daily_sales write failed: ${error.message}`)
    }
    return { itemsWritten: days.length, note: `${events.length} payments -> ${days.length} days` }
  },
}
