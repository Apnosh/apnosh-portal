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
import { useEffect, useMemo, useRef } from 'react'
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
  // BOTH OF THESE ARE MEMOIZED ON PURPOSE. They are the checkout's effect dependencies, and they
  // were fresh objects on every render — a new draft and a new desk object each time a parent
  // re-rendered. The checkout's own `started` ref is what actually stops a second PaymentIntent,
  // and it holds; this makes it not the only thing standing between a re-render and a second
  // charge. (No cancelled-flag cleanup here: that pair deadlocked the screen in dev.)
  //
  // onDone is read through a ref rather than listed as a dependency, because every caller passes an
  // inline arrow — memoizing on it would memoize nothing. The ref always calls the latest one.
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  const draft = useMemo(() => standInDraft(requestId, label), [requestId, label])
  const desk = useMemo(() => ({ requestId, label, onDone: (id: string) => onDoneRef.current(id) }), [requestId, label])
  return (
    <CampaignCheckout
      clientId={clientId}
      draft={draft}
      desk={desk}
      onSuccess={() => onDone(requestId)}
      onCancel={onCancel}
    />
  )
}
