/**
 * Admin Bespoke generation page.
 *
 * Premium tier: Claude generates a complete custom-coded HTML+CSS site
 * for the client. Operator briefs Claude with a design direction +
 * optional reference URLs, hits Generate, gets back a full bespoke site
 * served at /bespoke/sites/<slug>.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import BespokeForm from '@/components/admin/site-builder/bespoke-form'

interface PageProps { params: Promise<{ slug: string }> }

export default async function BespokePage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) notFound()

  // Load current bespoke site if any
  const admin = createAdminClient()
  const { data: bespoke } = await admin
    .from('bespoke_sites')
    .select('version, brief, reference_urls, generated_at, generation_ms, model')
    .eq('client_id', client.id)
    .maybeSingle()

  return (
    <div className="-m-4 lg:-m-6 -mt-10 lg:-mt-12 flex flex-col h-[calc(100dvh-3.5rem)] bg-bg-2/30">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-ink-6 shrink-0">
        <Link href={`/admin/clients/${slug}/site-builder`} className="text-ink-4 hover:text-ink p-1 -ml-1">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-widest text-ink-4 font-semibold">Bespoke · Premium tier</span>
          <span className="text-ink-5">·</span>
          <span className="text-sm font-semibold text-ink truncate">{client.name}</span>
        </div>
        <div className="flex-1" />
        {bespoke && (
          <Link
            href={`/bespoke/sites/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-ink-3 hover:text-ink rounded-md border border-ink-6 px-2.5 py-1.5"
          >
            Open in new tab
          </Link>
        )}
      </header>

      <BespokeForm
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        initialBrief={bespoke?.brief ?? ''}
        initialRefs={(bespoke?.reference_urls as string[] | null) ?? []}
        currentVersion={bespoke?.version ?? null}
        currentGeneratedAt={bespoke?.generated_at as string | null ?? null}
        currentModel={bespoke?.model as string | null ?? null}
      />
    </div>
  )
}
