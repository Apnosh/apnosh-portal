/**
 * buildReceipt — rebuild a campaign's order receipt (content pieces, services, and the producer-aware
 * bill) from a SAVED campaign, so a historical receipt under Billing shows exactly what the owner
 * approved at ship. Mirrors the plan flow's derivation (planCampaignPieces + producerAwareBill +
 * creatives) so the reconstructed receipt matches the one shown right after ship. Pure: same campaign
 * in, same receipt out (piece dates clamp to `todayISO`, but prices are catalog-fixed, so totals are stable).
 */

import { planCampaignPieces } from './work-orders-core'
import { creatorById } from './creators'
import { summarize, type CampaignReceipt, type LineItem } from './types'
import type { SavedCampaign } from './view'

const isContent = (it: LineItem) => /^content-/.test(it.serviceId ?? '')

export function buildReceipt(camp: SavedCampaign, todayISO: string): CampaignReceipt {
  const items = camp.draft.items ?? []
  const pieces = planCampaignPieces(camp, todayISO)
  // Services = the plan's non-content line items (setup / monthly / per-occurrence). Content pieces are
  // priced separately, per producer, via planCampaignPieces — never from the content line's list price.
  const services = items.filter((it) => it.included && !isContent(it))
  const base = summarize(services)
  const contentDollars = pieces.reduce((s, p) => s + p.priceCents, 0) / 100
  const bill = { ...base, oneTimeOnDelivery: base.oneTimeOnDelivery + contentDollars }
  const creatives = pieces.map((p) => ({
    key: p.key, type: p.type, label: p.label, producer: p.producer, cents: p.priceCents,
    creatorName: p.creatorId ? creatorById(p.creatorId)?.name ?? undefined : undefined,
  }))
  return { creatives, services, bill }
}
