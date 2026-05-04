/**
 * Admin Site Builder — unified one-page form for everything that drives a
 * client's website. Replaces the older /site/ page over time.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getDraft } from '@/lib/site-config/actions'
import { RESTAURANT_DEFAULTS } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import SiteBuilderForm from '@/components/admin/site-builder/site-builder-form'

interface PageProps { params: Promise<{ slug: string }> }

export default async function SiteBuilderPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!client) notFound()

  const result = await getDraft(client.id, 'restaurant')
  const config = result.success ? result.data! : null

  const initialData: RestaurantSite = (config?.draft_data as RestaurantSite) ?? RESTAURANT_DEFAULTS

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-6">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {client.name}
      </Link>

      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-4 font-semibold mb-1">Site Builder</div>
          <h1 className="text-2xl font-bold text-ink">{client.name}</h1>
          <p className="text-sm text-ink-3 mt-1">
            One source of truth for everything the customer site renders. Edits auto-save to draft. Click Publish to push live.
          </p>
        </div>

        {!result.success && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg max-w-md">
            Could not load: {result.error}. Did you apply migration 079_site_configs.sql in Supabase?
          </p>
        )}

        <Link
          href={`/sites/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-5 hover:bg-bg-2 shrink-0"
        >
          <ExternalLink className="w-3 h-3" /> Preview live site
        </Link>
      </header>

      <SiteBuilderForm
        clientId={client.id}
        clientSlug={client.slug}
        initialData={initialData}
        initialPublishedAt={config?.published_at ?? null}
        initialVersion={config?.version ?? 0}
      />
    </div>
  )
}
