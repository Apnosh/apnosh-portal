/**
 * Serves a bespoke-generated site as raw HTML.
 *
 * Each client has at most one stored HTML document at a time (with a
 * full version history in bespoke_history). This route reads the
 * current version and renders it inline.
 *
 * Security: the HTML comes from Claude, which we're treating as a
 * trusted source for the bespoke tier. Reviewed by the AM before
 * publishing.
 */

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ v?: string }>
}

export default async function BespokeSitePage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { v } = await searchParams
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) notFound()

  // Fetch HTML — current or specific version
  let html: string | null = null
  if (v) {
    const { data: histRow } = await supabase
      .from('bespoke_history')
      .select('html_doc')
      .eq('client_id', client.id)
      .eq('version', parseInt(v, 10))
      .maybeSingle()
    html = histRow?.html_doc ?? null
  } else {
    const { data: row } = await supabase
      .from('bespoke_sites')
      .select('html_doc')
      .eq('client_id', client.id)
      .maybeSingle()
    html = row?.html_doc ?? null
  }

  if (!html) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: 48, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, marginBottom: 16 }}>No bespoke site generated yet</h1>
        <p style={{ color: '#666' }}>
          Open the Bespoke generation page in admin to create a custom site for {client.name}.
        </p>
        <a href={`/admin/clients/${client.slug}/bespoke`} style={{ display: 'inline-block', marginTop: 24, background: '#0B0B0B', color: 'white', padding: '12px 24px', borderRadius: 8, textDecoration: 'none' }}>
          Generate bespoke site →
        </a>
      </div>
    )
  }

  // Render the stored HTML as-is. This is intentional for the bespoke tier
  // — Claude's output IS the site. We trust it because admins review before
  // publishing.
  return (
    <div
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ minHeight: '100vh' }}
    />
  )
}
