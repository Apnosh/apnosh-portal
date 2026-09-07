'use client'

/**
 * The desk's till — a thin wrapper around the campaign checkout.
 *
 * There is exactly ONE card form in this app, and this is not a second one. A Request Desk order
 * is the same money as a cart order (the same 10% fee, the same Stripe Tax, the same kill switch,
 * the same saved card), so it pays through the same screen. All this adds is the placeholder plan
 * that screen expects: a draft with no items, which makes every plan-shaped part of it (the "what
 * we will need from you" panel, the shoot gate, the go-live phrase) resolve to nothing on its own,
 * so the desk gets the payment half and none of the campaign half.
 *
 * The real order lives in creative_requests; nothing here is sent to the server as a price. The
 * server prices the order from the row it already stored.
 */
import CampaignCheckout from '@/components/mvp/campaign-builder/campaign-checkout'
import type { CampaignDraft } from '@/lib/campaigns/types'

/** The placeholder plan. No items on purpose — see the note above. */
function standInDraft(requestId: string, label: string): CampaignDraft {
  return {
    id: `request:${requestId}`,
    name: label,
    intent: 'single-item',
    path: 'diy',
    budgetMonthly: 0,
    items: [],
  }
}

export default function DeskCheckout({ clientId, requestId, label, onDone, onCancel }: {
  clientId: string
  requestId: string
  /** The owner's own word for what they bought, e.g. "Photos" — used in the confirmation line. */
  label: string
  onDone: (requestId: string) => void
  onCancel: () => void
}) {
  return (
    <CampaignCheckout
      clientId={clientId}
      draft={standInDraft(requestId, label)}
      desk={{ requestId, label, onDone }}
      onSuccess={() => onDone(requestId)}
      onCancel={onCancel}
    />
  )
}
