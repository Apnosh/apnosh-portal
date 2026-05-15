'use server'

/**
 * Server data layer for the client-facing services catalog.
 *
 * Reads service_catalog (the master list of products) and joins
 * against the current client's client_services (so we can show
 * "Already subscribed" on the right cards). The portal stays free
 * forever; this surfaces the paid add-on services a restaurant can
 * subscribe to whenever they want help.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface CatalogService {
  id: string
  name: string
  category: string
  description: string | null
  shortDescription: string | null
  /** Numeric price, $0 means "request a quote" / one-time. */
  price: number
  /** 'per_month' | 'one_time' | 'per_post' etc. */
  priceUnit: string
  features: string[]
  isSubscription: boolean
  /** Set once you wire the service in the Stripe dashboard. */
  stripePriceId: string | null
  /** When the client subscribes, this unlocks a portal section. */
  unlocksServiceArea: string | null
  /** Sort order within its category. */
  sortOrder: number
  /** Existing subscription status on this client_id, if any. */
  clientStatus: 'active' | 'paused' | 'cancelled' | null
}

export interface ServiceCategory {
  id: string
  label: string
  description: string
  services: CatalogService[]
}

const CATEGORY_META: Record<string, { label: string; description: string; order: number }> = {
  marketing:  { label: 'Marketing',       description: 'Run your social, email, and SMS', order: 1 },
  seo:        { label: 'Local SEO',       description: 'Get found by locals on Google and Maps', order: 2 },
  websites:   { label: 'Websites',        description: 'Build, host, and care for your site', order: 3 },
  creative:   { label: 'Creative',        description: 'Brand identity, logos, photography', order: 4 },
  automation: { label: 'AI & Automation', description: 'Lead response, reporting, customer journeys', order: 5 },
}

async function resolveClientId(): Promise<string | null> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle()
  if (biz?.client_id) return biz.client_id
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  return cu?.client_id ?? null
}

export async function getServicesCatalog(): Promise<ServiceCategory[]> {
  const admin = createAdminClient()
  const clientId = await resolveClientId()

  const [catalogRes, mineRes] = await Promise.all([
    admin
      .from('service_catalog')
      .select('id, name, category, description, short_description, price, price_unit, features, is_subscription, stripe_price_id, unlocks_service_area, sort_order')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true }),
    clientId
      ? admin
          .from('client_services')
          .select('service_slug, status')
          .eq('client_id', clientId)
      : Promise.resolve({ data: [] as Array<{ service_slug: string; status: string }> }),
  ])

  const myStatus = new Map<string, CatalogService['clientStatus']>()
  for (const row of (mineRes.data ?? []) as Array<{ service_slug: string; status: string }>) {
    const s = row.status
    if (s === 'active' || s === 'paused' || s === 'cancelled') myStatus.set(row.service_slug, s)
  }

  /* Group services by category in a single pass. */
  const byCategory = new Map<string, CatalogService[]>()
  for (const row of (catalogRes.data ?? []) as Array<Record<string, unknown>>) {
    const cat = (row.category as string) || 'other'
    const features = Array.isArray(row.features)
      ? (row.features as string[])
      : (typeof row.features === 'object' && row.features !== null
          ? Object.values(row.features as Record<string, unknown>).filter((v): v is string => typeof v === 'string')
          : [])

    const id = row.id as string
    const service: CatalogService = {
      id,
      name: row.name as string,
      category: cat,
      description: (row.description as string | null) ?? null,
      shortDescription: (row.short_description as string | null) ?? null,
      price: Number(row.price ?? 0),
      priceUnit: (row.price_unit as string) ?? 'per_month',
      features,
      isSubscription: Boolean(row.is_subscription),
      stripePriceId: (row.stripe_price_id as string | null) ?? null,
      unlocksServiceArea: (row.unlocks_service_area as string | null) ?? null,
      sortOrder: Number(row.sort_order ?? 0),
      clientStatus: myStatus.get(id) ?? null,
    }
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(service)
  }

  return Array.from(byCategory.entries())
    .map(([id, services]) => {
      const meta = CATEGORY_META[id] ?? { label: id, description: '', order: 99 }
      return { id, label: meta.label, description: meta.description, services, order: meta.order }
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...rest }) => rest)
}

export interface ActiveSubscription {
  clientServiceId: string
  serviceId: string
  serviceName: string
  status: 'active' | 'paused' | 'pending'
  monthlyPriceCents: number
  startedAt: string | null
  /** Category from service_catalog for grouping the active list. */
  category: string | null
}

export async function getActiveSubscriptions(): Promise<ActiveSubscription[]> {
  const clientId = await resolveClientId()
  if (!clientId) return []
  const admin = createAdminClient()

  const { data } = await admin
    .from('client_services')
    .select(`
      id, service_slug, display_name, status, monthly_price_cents, started_at,
      service_catalog(category)
    `)
    .eq('client_id', clientId)
    .in('status', ['active', 'paused', 'pending'])
    .order('started_at', { ascending: false })

  type Row = {
    id: string
    service_slug: string
    display_name: string
    status: 'active' | 'paused' | 'pending'
    monthly_price_cents: number
    started_at: string | null
    service_catalog: { category: string | null } | { category: string | null }[] | null
  }

  return ((data ?? []) as unknown as Row[]).map(r => {
    const cat = Array.isArray(r.service_catalog) ? r.service_catalog[0] : r.service_catalog
    return {
      clientServiceId: r.id,
      serviceId: r.service_slug,
      serviceName: r.display_name,
      status: r.status,
      monthlyPriceCents: r.monthly_price_cents,
      startedAt: r.started_at,
      category: cat?.category ?? null,
    }
  })
}

export async function getServiceById(serviceId: string): Promise<CatalogService | null> {
  const admin = createAdminClient()
  const clientId = await resolveClientId()

  const [serviceRes, mineRes] = await Promise.all([
    admin
      .from('service_catalog')
      .select('id, name, category, description, short_description, price, price_unit, features, is_subscription, stripe_price_id, unlocks_service_area, sort_order')
      .eq('id', serviceId)
      .eq('is_active', true)
      .maybeSingle(),
    clientId
      ? admin
          .from('client_services')
          .select('status')
          .eq('client_id', clientId)
          .eq('service_slug', serviceId)
          .maybeSingle()
      : Promise.resolve({ data: null as { status: string } | null }),
  ])

  if (!serviceRes.data) return null
  const row = serviceRes.data as Record<string, unknown>
  const features = Array.isArray(row.features)
    ? (row.features as string[])
    : (typeof row.features === 'object' && row.features !== null
        ? Object.values(row.features as Record<string, unknown>).filter((v): v is string => typeof v === 'string')
        : [])

  const status = mineRes.data?.status
  return {
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string) || 'other',
    description: (row.description as string | null) ?? null,
    shortDescription: (row.short_description as string | null) ?? null,
    price: Number(row.price ?? 0),
    priceUnit: (row.price_unit as string) ?? 'per_month',
    features,
    isSubscription: Boolean(row.is_subscription),
    stripePriceId: (row.stripe_price_id as string | null) ?? null,
    unlocksServiceArea: (row.unlocks_service_area as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    clientStatus: (status === 'active' || status === 'paused' || status === 'cancelled')
      ? status as 'active' | 'paused' | 'cancelled'
      : null,
  }
}
