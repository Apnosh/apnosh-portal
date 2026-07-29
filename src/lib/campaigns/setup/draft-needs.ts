/**
 * needsForDraftItems — "what we will need from you", derived from the draft itself.
 *
 * Every setup card's LANES carry requirement ids (`needs`), and the lane the owner picked
 * decides which set applies: the free lane of the Google card needs the connection so we can
 * read; the done-for-you lane needs manager access on top so we can write. The lane pick is
 * decoded from the line exactly the way the router encodes it (builder/routing.ts stampLane):
 * producer 'diy' + ownerMode 'ai' → the card's ai lane; producer 'diy' → the diy lane;
 * anything else → the team lane. Content lines and services without a setup card contribute
 * nothing — their asks live on the post-ship rail (service-needs.ts), not the checkout promise.
 *
 * Pure, client-safe: the checkout component renders this before any server round trip.
 */
import type { LineItem } from '../types'
import { setupCardByServiceId } from './cards'
import type { SetupLaneKind } from './types'

function laneFor(it: LineItem): SetupLaneKind {
  if (it.producer === 'diy') return it.ownerMode === 'ai' ? 'ai' : 'diy'
  return 'team'
}

export function needsForDraftItems(items: readonly LineItem[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const it of items) {
    if (!it.included || it.optOut) continue
    if (it.serviceable === false) continue
    const card = setupCardByServiceId(it.serviceId ?? '')
    if (!card) continue
    const lane = card.lanes.find((l) => l.kind === laneFor(it))
    for (const id of lane?.needs ?? []) {
      if (!seen.has(id)) { seen.add(id); out.push(id) }
    }
  }
  return out
}
