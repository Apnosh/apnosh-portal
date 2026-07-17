import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { listCampaigns, createCampaign, getCampaignProgressBatch } from '@/lib/campaigns/server'
import { getCampaignChargesBatch } from '@/lib/campaigns/work-orders'
import { getCampaignPaymentsBatch } from '@/lib/campaigns/campaign-payments-server'
import { draftSourceCatalogIds, unbuyableCatalogIds } from '@/lib/campaigns/data/catalog-availability'
import { shapeFor } from '@/lib/campaigns/builder/compose-plan'
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
  // these; this is the server-side guarantee. Checks EVERY source id a merged cart carries (not
  // just the first) with the same resolver + override map the store and /api/checkout/prepare
  // read; a fetch failure falls back to the code default, best-effort.
  const sourceIds = draftSourceCatalogIds(draft)
  if (sourceIds.length) {
    const overrides = await getContentOverrides().catch(() => ({}))
    const blocked = unbuyableCatalogIds(sourceIds, overrides)
    if (blocked.length) {
      const names = blocked.map((id) => `"${shapeFor(id)?.title ?? id}"`).join(' and ')
      return NextResponse.json({ error: `${names} ${blocked.length === 1 ? 'is' : 'are'} coming soon and cannot be ordered yet.` }, { status: 409 })
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
