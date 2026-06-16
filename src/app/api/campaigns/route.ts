import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { listCampaigns, createCampaign } from '@/lib/campaigns/server'
import type { CampaignDraft } from '@/lib/campaigns/types'

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

// GET /api/campaigns?clientId=… — list the client's campaigns (with line items + brief).
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)
  return NextResponse.json({ campaigns: await listCampaigns(clientId) })
}

// POST /api/campaigns — create a campaign from a built CampaignDraft.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = body.clientId as string | undefined
  const draft = body.draft as CampaignDraft | undefined
  if (!clientId || !draft) return NextResponse.json({ error: 'clientId and draft required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  const id = await createCampaign(clientId, user?.id ?? null, draft)
  return NextResponse.json({ id })
}
