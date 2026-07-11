/**
 * The ONE save + ship rail. Extracted from builder-entry's onConfirm so the single-item
 * Buy-now flow and the plan (cart) checkout ship through byte-identical requests:
 *   POST /api/campaigns (create as draft) → optional producer_choices PATCH →
 *   the status flip PATCH, which IS the order.
 * Throws an owner-facing Error; on any failure the campaign is at most a saved draft
 * (status never flipped), so nothing was ordered and retrying is safe.
 * Client-safe (fetch only).
 */
import type { CampaignDraft, PieceProducer } from '../types'

export const SHIP_FAIL = "That didn't go through. Nothing was ordered. Try again."

export async function saveAndShip({ clientId, draft, producerChoices }: {
  clientId: string
  draft: CampaignDraft
  producerChoices?: Record<string, PieceProducer>
}): Promise<string> {
  const h = { 'Content-Type': 'application/json' }
  const res = await fetch('/api/campaigns', { method: 'POST', headers: h, body: JSON.stringify({ clientId, draft }) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not create the campaign')
  const { id } = (await res.json()) as { id?: string }
  if (!id) throw new Error('Could not create the campaign')
  // Both PATCHes must land before we report success. The producer picks decide who
  // makes each piece (and what it bills), and the status flip IS the order: swallowing
  // a failure here would show "you're all set" over a campaign still sitting in draft.
  if (producerChoices && Object.keys(producerChoices).length) {
    const pr = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: { producer_choices: producerChoices } }) }).catch(() => null)
    if (!pr || !pr.ok) throw new Error(SHIP_FAIL)
  }
  const sr = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: { status: 'shipped', phase: 'monitor', shipped_at: new Date().toISOString() } }) }).catch(() => null)
  if (!sr || !sr.ok) throw new Error(SHIP_FAIL)
  return id
}
