/**
 * GET /api/channels/[provider]/start — begin an OAuth connect (CHANNELS-PLAN P4).
 *
 * The signed-in owner is resolved to their client id (same two-path lookup as
 * connection-actions), the id is sealed into a signed, expiring state token, and the
 * browser is redirected to the vendor's authorize page. Only oauth-kind adapters route
 * here; the state signature is what the callback trusts, never the query string.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adapterFor } from '@/lib/channels/registry'
import { signState } from '@/lib/channels/oauth-state'
import { ChannelError } from '@/lib/channels/types'

export const runtime = 'nodejs'

async function resolveClientId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', userId).maybeSingle()
  if (biz?.client_id) return biz.client_id
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', userId).maybeSingle()
  return cu?.client_id ?? null
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const adapter = adapterFor(provider)
  if (!adapter || adapter.kind !== 'oauth') {
    return NextResponse.json({ error: 'Unknown connect provider' }, { status: 404 })
  }
  if (!adapter.isConfigured()) {
    return NextResponse.json({ error: `${provider} is not set up on the server yet` }, { status: 503 })
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const clientId = await resolveClientId(user.id)
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  try {
    const { url } = await adapter.connectStart(signState(clientId))
    if (!url) return NextResponse.json({ error: 'This channel does not connect by redirect' }, { status: 400 })
    return NextResponse.redirect(url)
  } catch (e) {
    const msg = e instanceof ChannelError ? e.message : 'Could not start the connection'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
