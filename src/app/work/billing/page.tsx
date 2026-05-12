/**
 * /work/billing — finance ops surface.
 *
 * Three rails: overdue (chase these), open (in flight), recently paid.
 * Plus a per-client usage table so finance can see who's
 * under-utilizing (downsell risk) vs over-utilizing (upsell
 * opportunity). AI tier-fit analyzer pulls activity + retrieval to
 * draft a position for renewal conversations.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getBillingData } from '@/lib/work/get-billing-queue'
import BillingView from './billing-view'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  await requireAnyCapability(['finance'])
  const data = await getBillingData()
  return <BillingView initialData={data} />
}
