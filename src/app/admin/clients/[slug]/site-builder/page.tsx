/**
 * Admin Site Builder — full-bleed three-pane workspace.
 *
 * The page itself is just a shell: data fetch + auth check, then hands
 * to the SiteBuilderForm client component which owns layout, top bar,
 * drawers, and the live preview.
 */

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDraft } from '@/lib/site-config/actions'
import { RESTAURANT_DEFAULTS } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'
import SiteBuilderForm from '@/components/admin/site-builder/site-builder-form'
import { requireAdminUser } from '@/lib/auth/require-admin'

interface PageProps { params: Promise<{ slug: string }> }

export default async function SiteBuilderPage({ params }: PageProps) {
  await requireAdminUser()
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

  if (!result.success) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="text-sm text-red-700 font-medium mb-2">Could not load Site Builder</p>
          <p className="text-xs text-red-600">{result.error}</p>
          <p className="text-xs text-red-600 mt-2 italic">Make sure migration 079_site_configs.sql has been applied.</p>
        </div>
      </div>
    )
  }

  return (
    // Negative margins match admin layout's main padding (p-4 lg:p-6) AND
    // pull above the Breadcrumbs row so we get a full-bleed workspace
    // immediately below the admin top bar.
    <div className="-m-4 lg:-m-6 -mt-10 lg:-mt-12">
      <SiteBuilderForm
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        initialData={initialData}
        initialPublishedAt={config?.published_at ?? null}
        initialVersion={config?.version ?? 0}
      />
    </div>
  )
}
