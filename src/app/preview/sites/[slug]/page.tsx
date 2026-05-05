/**
 * Preview route — renders the Site Builder draft (or published) state for a
 * client. Used by the iframe in /admin/clients/[slug]/site-builder/.
 *
 * Modes:
 *   ?mode=draft      → render draft_data (default)
 *   ?mode=published  → render published_data
 *
 * Auth: admin only (via middleware) or client_user own row (via RLS).
 */

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTemplate } from '@/components/sites/registry'
import { RESTAURANT_DEFAULTS } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ mode?: string }>
}

export default async function PreviewPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { mode = 'draft' } = await searchParams
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) notFound()

  const { data: row } = await supabase
    .from('site_configs')
    .select('draft_data, published_data')
    .eq('client_id', client.id)
    .maybeSingle()

  const data: RestaurantSite =
    (mode === 'published' ? (row?.published_data as RestaurantSite | null) : (row?.draft_data as RestaurantSite | null))
    ?? RESTAURANT_DEFAULTS

  // Pick template based on identity.templateId (falls back to restaurant-bold)
  const tpl = getTemplate(data.identity?.templateId)
  const Template = tpl.Component

  return (
    <>
      {/* Reset body styles so the template controls everything */}
      <style dangerouslySetInnerHTML={{ __html: `
        body { margin: 0; padding: 0; }
        .preview-banner {
          position: fixed; top: 0; right: 0;
          background: ${mode === 'published' ? '#10B981' : '#CC0A0A'};
          color: white;
          font: 600 11px/1 system-ui, sans-serif;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-bottom-left-radius: 6px;
          z-index: 100;
        }
      `}} />
      <div className="preview-banner">
        {mode === 'published' ? 'Live · Published' : 'Draft preview'}
        <span style={{ marginLeft: 8, opacity: 0.75, fontWeight: 400 }}>· {tpl.name}</span>
      </div>
      <Template site={data} />
    </>
  )
}
