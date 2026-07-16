import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { listCampaigns, createCampaign, getCampaignProgressBatch } from '@/lib/campaigns/server'
import { getCampaignChargesBatch } from '@/lib/campaigns/work-orders'
import { getCampaignPaymentsBatch } from '@/lib/campaigns/campaign-payments-server'
import { availabilityFor } from '@/lib/campaigns/data/catalog-availability'
import { getContentOverrides } from '@/lib/campaigns/content-overrides-server'
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
  const campaigns = await listCampaigns(clientId)
  // Real production progress per campaign, so the list shows In production / Live / Done honestly
  // (the line-item `lock` field is never advanced, so it can't drive state). Best-effort.
  const shippedIds = campaigns.filter((c) => c.status === 'shipped').map((c) => c.draft.id).filter((x): x is string => !!x)
  // Charges cover every launched campaign (shipped AND stopped) — the Orders money
  // view shows what a stopped campaign actually billed, not just live ones.
  // Best-effort: null (not {}) on failure so the client renders "unknown", not "$0".
  const launchedIds = campaigns.filter((c) => c.status !== 'draft').map((c) => c.draft.id).filter((x): x is string => !!x)
  const [progress, charges, payments] = await Promise.all([
    getCampaignProgressBatch(shippedIds).catch(() => ({})),
    getCampaignChargesBatch(launchedIds).catch(() => null),
    // Upfront charge-at-checkout receipts per launched campaign ({} on failure).
    getCampaignPaymentsBatch(launchedIds).catch(() => ({})),
  ])
  return NextResponse.json({ campaigns, progress, charges, payments })
}

// POST /api/campaigns — create a campaign from a built CampaignDraft.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = body.clientId as string | undefined
  const draft = body.draft as CampaignDraft | undefined
  if (!clientId || !draft) return NextResponse.json({ error: 'clientId and draft required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)
  // Honesty backstop (Phase 1): never let a bookmarked ("coming soon") or hidden campaign be
  // ordered, no matter how the request was crafted. The store already disables the buy footer for
  // these; this is the server-side guarantee. Admin CMS overrides (visibility) are honored via the
  // same override map the store reads; a fetch failure falls back to the code default, best-effort.
  const source = (draft.sourceCatalogId ?? '').trim()
  if (source) {
    const overrides = await getContentOverrides().catch(() => ({}))
    if (availabilityFor(source, overrides) !== 'live') {
      return NextResponse.json({ error: 'This campaign is coming soon and cannot be ordered yet.' }, { status: 409 })
    }
  }
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  try {
    const id = await createCampaign(clientId, user?.id ?? null, draft)
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status: 500 })
  }
}
