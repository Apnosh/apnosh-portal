/**
 * POST /api/gates/for-draft — which questions a cart must answer, and which ITEM each
 * one belongs to.
 *
 * Exists because gates were only ever computed inside /api/checkout/prepare, so the
 * cart could not know a question existed until the owner had already committed to
 * checking out. That is a late gate: you decide to buy, and only then are told the
 * thing might not apply to you.
 *
 * The shape follows a food-ordering app: an item with required options is flagged in
 * the cart, you open the item to answer, and you cannot place the order until every
 * flagged item is done. So this returns gates GROUPED BY the catalog card that caused
 * them, not as one flat checkout list.
 *
 * ONE source of truth, deliberately. resolveGatesForDraft is the same function
 * prepare calls, so the cart and the checkout can never disagree about what is
 * required. Duplicating that logic client-side is how two surfaces drift, which is a
 * bug pattern this codebase has already been bitten by more than once.
 *
 * Read-only. No money, no writes, no Stripe.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { resolveGatesForDraft } from '@/lib/campaigns/gates/config-server'
import type { CustomGate } from '@/lib/campaigns/gates/config'
import { gateItemIds } from '@/lib/campaigns/gates/item-map'
import type { CampaignDraft } from '@/lib/campaigns/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = body.clientId as string | undefined
  const draft = body.draft as CampaignDraft | undefined
  if (!clientId || !draft || !Array.isArray(draft.items)) {
    return NextResponse.json({ error: 'clientId and draft required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  const gates = await resolveGatesForDraft(draft, { clientId }).catch(() => ({ booking: null, custom: [] }))

  // Group by the card that caused each question, so the cart can badge that one item.
  const byItem: Record<string, CustomGate[]> = {}
  for (const g of gates.custom) {
    for (const itemId of gateItemIds(g.id)) {
      (byItem[itemId] ??= []).push(g)
    }
  }

  return NextResponse.json({
    // Per-card questions: { gbp: [...], friction: [...] }. The cart badges these items.
    byItem,
    // Anything we could not attribute to a single card (a booking gate spans the order).
    orderLevel: gates.custom.filter((g: CustomGate) => gateItemIds(g.id).length === 0),
    booking: gates.booking,
    // The count the cart needs to lock its button, without re-deriving the rule.
    requiredCount: gates.custom.filter((g: CustomGate) => g.required).length,
  })
}
