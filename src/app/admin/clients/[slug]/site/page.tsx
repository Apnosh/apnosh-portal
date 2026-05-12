/**
 * Admin Site Settings page for a client.
 *
 * Lets admin (and eventually the client) configure how their Apnosh
 * Site looks: hero photo, tagline, brand colors, ordering links,
 * social handles, publication state.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSiteSettings } from '@/lib/site-settings/actions'
import SiteSettingsForm from '@/components/admin/site/site-settings-form'
import { requireAdminUser } from '@/lib/auth/require-admin'

interface PageProps { params: Promise<{ slug: string }> }

export default async function ClientSitePage({ params }: PageProps) {
  await requireAdminUser()
  const { slug } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!client) notFound()

  const settingsResult = await getSiteSettings(client.id)
  const settings = settingsResult.success ? settingsResult.data : null

  return (
    <div className="max-w-3xl">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {client.name}
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">Apnosh Site</h1>
          <p className="text-sm text-ink-3">
            Configure how the public site looks and what it links to. Hours, events, and promotions
            update automatically through the Updates system.
          </p>
        </div>
        <Link
          href={`/sites/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-5 hover:bg-bg-2 shrink-0"
        >
          <ExternalLink className="w-3 h-3" /> Preview live site
        </Link>
      </div>

      <SiteSettingsForm clientId={client.id} clientSlug={client.slug} initial={settings} />
    </div>
  )
}
