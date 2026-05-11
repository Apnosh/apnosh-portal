/**
 * /admin/clients/[slug]/quotes/new — strategist quote builder.
 *
 * Optional ?requestId=<client_task_id> pre-populates the source.
 * Strategist composes title + line items + message + turnaround,
 * hits send → POST /api/admin/quotes → client_quotes row created
 * with status='sent'.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertClientDetailAccess } from '@/lib/auth/client-detail-gate'
import QuoteBuilder, { type PricingPreset } from './quote-builder'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ requestId?: string }>
}

export default async function NewQuotePage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { requestId } = await searchParams
  await assertClientDetailAccess(slug)
  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) notFound()

  // Pre-populate from a source request if provided.
  let prefilledTitle = ''
  let prefilledSourceSummary = ''
  let aiAnalysis: Record<string, unknown> | null = null
  if (requestId) {
    const { data: task } = await admin
      .from('client_tasks')
      .select('title, body, ai_analysis')
      .eq('id', requestId)
      .eq('client_id', client.id)
      .maybeSingle()
    if (task) {
      const taskTitle = (task.title as string) ?? ''
      prefilledTitle = taskTitle.replace(/^Request:\s*/, '')
      prefilledSourceSummary = (task.body as string)?.split('\n').slice(0, 5).join('\n') ?? ''
      aiAnalysis = (task.ai_analysis as Record<string, unknown> | null) ?? null
    }
  }

  // Pull the active pricing rubric so the quote builder presets are
  // editable from /admin/settings/pricing rather than hardcoded.
  const { data: rubricRows } = await admin
    .from('pricing_rubric')
    .select('content_type, label, unit_price, category, blurb, display_order')
    .eq('active', true)
    .order('display_order', { ascending: true })

  const presets: PricingPreset[] = (rubricRows ?? []).map(r => ({
    label: r.label as string,
    qty: 1,
    unitPrice: Number(r.unit_price ?? 0),
    category: (r.category as string) ?? 'content',
  }))

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to {client.name as string}
      </Link>

      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            New quote · {client.name as string}
          </p>
        </div>
        <h1 className="text-[28px] font-bold text-ink tracking-tight leading-tight">
          Build a quote
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          Compose line items and send to the client. They&rsquo;ll see it on their social hub
          and can approve, ask for changes, or decline. Work begins on approval.
        </p>
      </header>

      <QuoteBuilder
        clientId={client.id as string}
        clientSlug={client.slug as string}
        sourceRequestId={requestId ?? null}
        prefilledTitle={prefilledTitle}
        prefilledSourceSummary={prefilledSourceSummary}
        presets={presets}
        aiAnalysis={aiAnalysis}
      />
    </div>
  )
}
