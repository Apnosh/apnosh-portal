/**
 * /admin/work-orders/[id] — the focused "Your Turn" inbox for ONE service work order. The machine has
 * already done every safe check and drafted every change (the sync endpoint runs on open); this page
 * sorts the remaining work into three piles by who acts: Your turn / Waiting / Done. The operator
 * works the top card, one decision at a time, until the piles are empty and the order delivers with
 * proof. The full 61-bullet playbook survives as an audit drawer, not the workspace.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServiceWorkOrder } from '@/lib/campaigns/service-work-orders'
import { playbookFor } from '@/lib/campaigns/data/service-playbooks'
import WorkOrderInbox from './work-order-inbox'

export default async function WorkOrderInboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') redirect('/admin')

  const swo = await getServiceWorkOrder(id)
  if (!swo) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Link href="/admin/campaign-orders" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"><ArrowLeft className="w-4 h-4" /> Back to campaign orders</Link>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">Work order not found.</div>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data: clientRow } = await admin.from('clients').select('name').eq('id', swo.clientId).maybeSingle()
  const deliverable = playbookFor(swo.serviceId)?.deliverable ?? { liveLinkLabel: 'Live result', metricLabel: '' }

  return (
    <WorkOrderInbox
      swo={{
        id: swo.id,
        campaignId: swo.campaignId,
        serviceId: swo.serviceId,
        title: swo.title,
        status: swo.status,
        dueDate: swo.dueDate,
        proofUrl: swo.proofUrl,
        proofNote: swo.proofNote,
        steps: swo.steps as unknown as Record<string, unknown>[],
      }}
      clientName={(clientRow?.name as string) ?? 'Client'}
      deliverableLabel={deliverable.liveLinkLabel}
    />
  )
}
