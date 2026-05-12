/**
 * AI Marketing Operator page for a single client.
 *
 * Admin can:
 *   - Trigger an analysis pass on demand
 *   - Review pending proposals (approve/reject)
 *   - See agent run history (audit + cost trail)
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listProposals, listAgentRuns } from '@/lib/operator/actions'
import OperatorView from '@/components/admin/operator/operator-view'
import { requireAdminUser } from '@/lib/auth/require-admin'

interface PageProps { params: Promise<{ slug: string }> }

export default async function ClientOperatorPage({ params }: PageProps) {
  await requireAdminUser()
  const { slug } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!client) notFound()

  const [proposalsRes, runsRes] = await Promise.all([
    listProposals(client.id),
    listAgentRuns(client.id),
  ])

  const proposals = proposalsRes.success ? proposalsRes.data : []
  const runs = runsRes.success ? runsRes.data : []

  return (
    <div className="max-w-5xl">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {client.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">AI Marketing Operator</h1>
        <p className="text-sm text-ink-3">
          The agent analyzes recent performance, brand context, and what&apos;s already
          published, then proposes weekly marketing actions for your approval.
        </p>
      </div>

      <OperatorView
        clientId={client.id}
        clientSlug={client.slug}
        initialProposals={proposals}
        initialRuns={runs}
      />
    </div>
  )
}
