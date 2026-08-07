/**
 * GET /api/channels/[provider]/callback — the OAuth return leg (CHANNELS-PLAN P4).
 *
 * Trusts ONLY the signed state (oauth-state.ts): a forged or expired callback attaches
 * nothing. On a good code the vendor adapter exchanges it for tokens, and the connection
 * lands in the EXISTING channel_connections registry (043) as status 'active', replacing
 * any prior connection for the same client+channel (the reconnect pattern connectYelp
 * uses). The owner returns to connected-accounts with the result said out loud.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyState } from '@/lib/channels/oauth-state'
import { squareExchangeCode } from '@/lib/channels/adapters/square'
import { cloverExchangeCode } from '@/lib/channels/adapters/clover'
import { ChannelError } from '@/lib/channels/types'

export const runtime = 'nodejs'

const DONE = '/dashboard/connected-accounts'

function back(req: Request, query: string): NextResponse {
  return NextResponse.redirect(new URL(`${DONE}?${query}`, req.url))
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (provider !== 'square' && provider !== 'clover') {
    return NextResponse.json({ error: 'Unknown callback provider' }, { status: 404 })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const clientId = verifyState(url.searchParams.get('state'))
  if (!clientId) return back(req, `connect_error=${provider}&reason=bad_state`)
  if (!code) return back(req, `connect_error=${provider}&reason=denied`)

  try {
    let accessToken: string
    let refreshToken: string | null
    let merchantId: string | null

    if (provider === 'square') {
      const t = await squareExchangeCode(code)
      accessToken = t.accessToken
      refreshToken = t.refreshToken
      merchantId = t.merchantId
    } else {
      const t = await cloverExchangeCode(code)
      accessToken = t.accessToken
      refreshToken = t.refreshToken
      /* Clover sends the merchant id alongside the code rather than in the token body. */
      merchantId = url.searchParams.get('merchant_id')
    }

    const admin = createAdminClient()
    /* Reconnect-safe: wipe any prior connection for this client+channel first, the same
     * way connectYelp and the Google callbacks do. */
    await admin
      .from('channel_connections')
      .delete()
      .eq('client_id', clientId)
      .eq('channel', provider)

    const { error: insertErr } = await admin.from('channel_connections').insert({
      client_id: clientId,
      channel: provider,
      connection_type: 'oauth',
      platform_account_id: merchantId,
      access_token: accessToken,
      refresh_token: refreshToken,
      status: 'active',
      connected_at: new Date().toISOString(),
      metadata: { env: provider === 'clover' ? (process.env.CLOVER_ENV ?? 'production') : 'production' },
    })
    if (insertErr) throw new Error(insertErr.message)

    return back(req, `connected=${provider}`)
  } catch (e) {
    console.error(`[channels] ${provider} callback failed`, e)
    const reason = e instanceof ChannelError ? e.code : 'exchange_failed'
    return back(req, `connect_error=${provider}&reason=${reason}`)
  }
}
