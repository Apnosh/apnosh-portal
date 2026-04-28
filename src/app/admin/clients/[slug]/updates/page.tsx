/**
 * Updates page for a client.
 *
 * Admin can:
 *   - See history of all updates (hours changes, menu items, promos, etc.)
 *   - Create a new update (currently: hours only -- more types coming)
 *   - See per-platform fanout status with retry on failure
 *
 * This is the admin-facing view of the unified updates system.
 * Client-facing dashboard view comes after this is proven.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listUpdates } from '@/lib/updates/actions'
import UpdatesView from '@/components/admin/updates/updates-view'

interface PageProps { params: Promise<{ slug: string }> }

export default async function ClientUpdatesPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!client) notFound()

  // Pull all locations for this client (assigned only) so the form can
  // present a location picker
  const { data: locations } = await supabase
    .from('gbp_locations')
    .select('id, location_name, address, hours, special_hours, store_code')
    .eq('client_id', client.id)
    .eq('status', 'assigned')
    .order('location_name')

  const updatesResult = await listUpdates(client.id, 50)
  const updates = updatesResult.success ? updatesResult.data.updates : []
  const fanouts = updatesResult.success ? updatesResult.data.fanouts : {}

  return (
    <div className="max-w-5xl">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {client.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">Updates</h1>
        <p className="text-sm text-ink-3">
          Push operational changes to every connected platform at once. Hours, menu items,
          promotions, events all flow through here.
        </p>
      </div>

      <UpdatesView
        clientId={client.id}
        clientName={client.name}
        clientSlug={client.slug}
        locations={(locations ?? []).map(l => ({
          id: l.id as string,
          name: l.location_name as string,
          address: (l.address as string | null) ?? null,
          hours: l.hours as Record<string, unknown> | null,
          specialHours: (l.special_hours as unknown[] | null) ?? [],
          storeCode: l.store_code as string,
        }))}
        initialUpdates={updates}
        initialFanouts={fanouts}
      />
    </div>
  )
}
