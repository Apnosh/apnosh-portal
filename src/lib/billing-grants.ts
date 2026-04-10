/**
 * Service-area grant/revoke helpers used by the Stripe webhook (and any
 * admin tools) to keep clients.services_active in sync with what the
 * client is actually paying for.
 *
 * Pure functions — caller passes in a Supabase client (admin/service role).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceArea } from '@/types/database'

/** Friendly names stored in clients.services_active. */
export const SERVICE_AREA_FRIENDLY: Record<ServiceArea, string> = {
  social: 'Social Media',
  website: 'Website',
  local_seo: 'Local SEO',
  email_sms: 'Email & SMS',
}

/* ------------------------------------------------------------------ */
/*  Catalog lookups                                                    */
/* ------------------------------------------------------------------ */

/**
 * Look up a single catalog item and return the service area it unlocks
 * (null if it's an add-on with no associated tab).
 */
export async function lookupCatalogUnlock(
  supabase: SupabaseClient,
  catalogItemId: string,
): Promise<ServiceArea | null> {
  const { data } = await supabase
    .from('service_catalog')
    .select('unlocks_service_area')
    .eq('id', catalogItemId)
    .maybeSingle()
  return (data?.unlocks_service_area as ServiceArea | null) ?? null
}

/* ------------------------------------------------------------------ */
/*  Client resolution                                                  */
/* ------------------------------------------------------------------ */

/**
 * Resolve (or create) a clients row for a given Stripe customer.
 *
 * Lookup order:
 *   1. businesses.stripe_customer_id → businesses.client_id
 *   2. clients.email == provided email
 *
 * If neither finds a row, create a new clients row + brand + patterns
 * + client_users link, and back-fill businesses.client_id when possible.
 *
 * Returns the resolved clients.id, or null if no business or email
 * could be matched.
 */
export async function ensureClientForStripeCustomer(
  supabase: SupabaseClient,
  opts: {
    stripeCustomerId: string
    email?: string | null
    name?: string | null
  },
): Promise<string | null> {
  // 1. Try via businesses bridge
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, owner_id, client_id')
    .eq('stripe_customer_id', opts.stripeCustomerId)
    .maybeSingle()

  if (business?.client_id) return business.client_id

  // 2. Try via email match on clients
  if (opts.email) {
    const { data: existingByEmail } = await supabase
      .from('clients')
      .select('id')
      .eq('email', opts.email)
      .maybeSingle()
    if (existingByEmail?.id) {
      // Backfill businesses.client_id if we have one
      if (business && !business.client_id) {
        await supabase
          .from('businesses')
          .update({ client_id: existingByEmail.id })
          .eq('id', business.id)
      }
      return existingByEmail.id
    }
  }

  // 3. Create new client (if we have anything to name it)
  const displayName = opts.name || business?.name || opts.email?.split('@')[0]
  if (!displayName) return null

  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const { data: newClient, error: createErr } = await supabase
    .from('clients')
    .insert({
      name: displayName,
      slug,
      email: opts.email ?? null,
      services_active: [],
      tier: 'Standard',
      billing_status: 'active',
    })
    .select('id')
    .single()

  if (createErr || !newClient) {
    console.error('[billing-grants] failed to create client:', createErr?.message)
    return null
  }

  // Sister rows
  await supabase.from('client_brands').insert({ client_id: newClient.id })
  await supabase.from('client_patterns').insert({ client_id: newClient.id })

  // Link the auth user via client_users if we know who they are
  if (business?.owner_id) {
    await supabase.from('client_users').insert({
      client_id: newClient.id,
      email: opts.email ?? '',
      name: displayName,
      role: 'owner',
      status: 'active',
      auth_user_id: business.owner_id,
    })
    // Backfill businesses bridge
    await supabase
      .from('businesses')
      .update({ client_id: newClient.id })
      .eq('id', business.id)
  }

  return newClient.id
}

/* ------------------------------------------------------------------ */
/*  Grant / revoke                                                     */
/* ------------------------------------------------------------------ */

/**
 * Add the friendly service-area name to clients.services_active if it
 * isn't already there. No-ops for unknown areas. Idempotent.
 */
export async function grantServiceArea(
  supabase: SupabaseClient,
  clientId: string,
  area: ServiceArea,
): Promise<void> {
  const friendly = SERVICE_AREA_FRIENDLY[area]
  if (!friendly) return

  const { data: client } = await supabase
    .from('clients')
    .select('services_active')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return

  const current: string[] = client.services_active ?? []
  if (current.includes(friendly)) return

  await supabase
    .from('clients')
    .update({ services_active: [...current, friendly] })
    .eq('id', clientId)
}

/**
 * Remove the friendly service-area name from clients.services_active.
 * Idempotent.
 */
export async function revokeServiceArea(
  supabase: SupabaseClient,
  clientId: string,
  area: ServiceArea,
): Promise<void> {
  const friendly = SERVICE_AREA_FRIENDLY[area]
  if (!friendly) return

  const { data: client } = await supabase
    .from('clients')
    .select('services_active')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return

  const current: string[] = client.services_active ?? []
  if (!current.includes(friendly)) return

  await supabase
    .from('clients')
    .update({ services_active: current.filter(s => s !== friendly) })
    .eq('id', clientId)
}

/**
 * Convenience: look up the catalog item and grant whatever it unlocks.
 * Used by the webhook on checkout/subscription.
 */
export async function grantFromCatalogItem(
  supabase: SupabaseClient,
  clientId: string,
  catalogItemId: string,
): Promise<ServiceArea | null> {
  const area = await lookupCatalogUnlock(supabase, catalogItemId)
  if (!area) return null
  await grantServiceArea(supabase, clientId, area)
  return area
}

/**
 * Convenience: look up the catalog item and revoke whatever it unlocked.
 * Used by the webhook on subscription cancellation.
 */
export async function revokeFromCatalogItem(
  supabase: SupabaseClient,
  clientId: string,
  catalogItemId: string,
): Promise<ServiceArea | null> {
  const area = await lookupCatalogUnlock(supabase, catalogItemId)
  if (!area) return null
  await revokeServiceArea(supabase, clientId, area)
  return area
}
