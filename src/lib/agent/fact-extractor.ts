/**
 * Fact extractor.
 *
 * Background job that walks a client's existing data + connected
 * surfaces and writes structured facts into client_facts. Once
 * populated, every agent conversation grounds itself in real info
 * about that client (brand voice, signature items, hours, channels,
 * etc.) without any manual setup.
 *
 * Sources (cheap-first):
 *   1. clients row -- name, industry, tier, slug
 *   2. apnosh-content.json from the client's site -- vertical, displayName, voice fields
 *   3. site_settings -- channels (instagram, facebook, tiktok), order URLs
 *   4. gbp_locations -- hours, address, location count
 *   5. menu_items -- price tier, signature items, dietary signals
 *   6. clients.brand_*, clients.tier -- brand config (when set)
 *
 * Future sources (not in v1):
 *   - Instagram bio + recent posts (LLM-extracted brand voice)
 *   - Recent reviews (sentiment, common themes)
 *   - GBP description (vertical, value props)
 *
 * Each extractor returns Array<FactWrite>; the runner upserts via
 * setFact() which is conflict-aware (owner_stated always wins).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { setFact } from './facts'
import { FACT_KEYS, type FactSource } from './types'

interface FactWrite {
  key: string
  value: unknown
  source: FactSource
  sourceRef?: Record<string, unknown>
  confidence?: number
}

// ─── Per-client run ───────────────────────────────────────────────

export interface ExtractResult {
  clientId: string
  factsWritten: number
  errors: string[]
}

export async function extractFactsForClient(clientId: string): Promise<ExtractResult> {
  const errors: string[] = []
  const allFacts: FactWrite[] = []

  for (const extractor of EXTRACTORS) {
    try {
      const facts = await extractor(clientId)
      allFacts.push(...facts)
    } catch (err) {
      errors.push(`${extractor.name}: ${(err as Error).message}`)
    }
  }

  let written = 0
  for (const f of allFacts) {
    try {
      await setFact({
        clientId,
        key: f.key,
        value: f.value,
        source: f.source,
        sourceRef: f.sourceRef,
        confidence: f.confidence,
      })
      written += 1
    } catch (err) {
      errors.push(`setFact ${f.key}: ${(err as Error).message}`)
    }
  }

  return { clientId, factsWritten: written, errors }
}

// ─── Extractors ───────────────────────────────────────────────────

const EXTRACTORS: Array<(clientId: string) => Promise<FactWrite[]>> = [
  extractFromClient,
  extractFromSiteSettings,
  extractFromApnoshContent,
  extractFromGbpLocations,
  extractFromMenuItems,
]

async function extractFromClient(clientId: string): Promise<FactWrite[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('clients')
    .select('id, name, slug, industry, tier')
    .eq('id', clientId)
    .maybeSingle()
  if (!data) return []
  const facts: FactWrite[] = []
  if (data.industry) {
    facts.push({
      key: FACT_KEYS.BUSINESS_VERTICAL,
      value: String(data.industry).toLowerCase(),
      source: 'platform',
    })
  }
  // Owner display name fallback (real name pulled separately if available)
  if (data.name) {
    facts.push({
      key: 'business.name',
      value: data.name,
      source: 'platform',
    })
  }
  return facts
}

async function extractFromSiteSettings(clientId: string): Promise<FactWrite[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_settings')
    .select('instagram_url, facebook_url, tiktok_url, order_online_url, reservation_url, external_site_url, external_repo_url')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data) return []
  const facts: FactWrite[] = []
  if (data.instagram_url && data.instagram_url !== '#') {
    const handle = extractHandle(data.instagram_url as string)
    if (handle) facts.push({ key: FACT_KEYS.CHANNEL_INSTAGRAM_HANDLE, value: handle, source: 'platform' })
  }
  if (data.facebook_url && data.facebook_url !== '#') {
    facts.push({ key: 'channels.facebook.url', value: data.facebook_url, source: 'platform' })
  }
  if (data.tiktok_url && data.tiktok_url !== '#') {
    facts.push({ key: 'channels.tiktok.url', value: data.tiktok_url, source: 'platform' })
  }
  if (data.order_online_url) {
    facts.push({ key: 'channels.order_online_url', value: data.order_online_url, source: 'platform' })
  }
  if (data.reservation_url) {
    facts.push({ key: 'channels.reservation_url', value: data.reservation_url, source: 'platform' })
  }
  if (data.external_repo_url) {
    facts.push({
      key: FACT_KEYS.CHANNEL_GITHUB_REPO,
      value: String(data.external_repo_url).replace(/^https:\/\/github\.com\//, ''),
      source: 'platform',
    })
  }
  return facts
}

async function extractFromApnoshContent(clientId: string): Promise<FactWrite[]> {
  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('site_settings')
    .select('external_site_url')
    .eq('client_id', clientId)
    .maybeSingle()
  const siteUrl = (settings?.external_site_url as string | null) ?? null
  if (!siteUrl) return []
  try {
    const url = new URL('/apnosh-content.json', siteUrl).toString()
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json() as {
      vertical?: string
      displayName?: string
      features?: string[]
    }
    const facts: FactWrite[] = []
    if (json.vertical) {
      facts.push({
        key: FACT_KEYS.BUSINESS_VERTICAL,
        value: json.vertical,
        source: 'extracted',
        sourceRef: { url },
        confidence: 0.85,
      })
    }
    if (json.displayName) {
      facts.push({
        key: 'business.display_name',
        value: json.displayName,
        source: 'extracted',
        sourceRef: { url },
        confidence: 0.85,
      })
    }
    if (Array.isArray(json.features)) {
      facts.push({
        key: 'site.features',
        value: json.features,
        source: 'extracted',
        sourceRef: { url },
        confidence: 0.95,
      })
    }
    return facts
  } catch {
    return []
  }
}

async function extractFromGbpLocations(clientId: string): Promise<FactWrite[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('gbp_locations')
    .select('id, name, primary_phone, address, hours, is_primary, gbp_location_id')
    .eq('client_id', clientId)
  const locations = (data ?? []) as Array<{
    id: string; name: string | null; primary_phone: string | null;
    address: Record<string, unknown> | null; hours: Record<string, unknown> | null;
    is_primary: boolean | null; gbp_location_id: string | null;
  }>
  if (locations.length === 0) return []

  const facts: FactWrite[] = [
    { key: FACT_KEYS.BUSINESS_LOCATION_COUNT, value: locations.length, source: 'platform' },
  ]
  const primary = locations.find(l => l.is_primary) ?? locations[0]
  if (primary?.gbp_location_id) {
    facts.push({ key: FACT_KEYS.CHANNEL_GBP_LOCATION_ID, value: primary.gbp_location_id, source: 'platform' })
  }
  if (primary?.hours) {
    facts.push({ key: FACT_KEYS.CALENDAR_HOURS, value: primary.hours, source: 'platform' })
  }
  if (primary?.address) {
    facts.push({ key: 'business.primary_address', value: primary.address, source: 'platform' })
  }
  if (primary?.primary_phone) {
    facts.push({ key: 'business.primary_phone', value: primary.primary_phone, source: 'platform' })
  }
  return facts
}

async function extractFromMenuItems(clientId: string): Promise<FactWrite[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('menu_items')
    .select('name, price_cents, category, is_featured')
    .eq('client_id', clientId)
  const items = (data ?? []) as Array<{
    name: string; price_cents: number | null; category: string | null; is_featured: boolean | null;
  }>
  if (items.length === 0) return []

  const facts: FactWrite[] = []

  // Price tier: cheap, mid, fancy based on median price_cents.
  const prices = items.map(i => i.price_cents).filter((p): p is number => typeof p === 'number')
  if (prices.length > 0) {
    prices.sort((a, b) => a - b)
    const median = prices[Math.floor(prices.length / 2)]
    const tier = median < 1000 ? '$' : median < 2000 ? '$$' : median < 3500 ? '$$$' : '$$$$'
    facts.push({
      key: FACT_KEYS.MENU_PRICE_TIER,
      value: tier,
      source: 'extracted',
      sourceRef: { method: 'median_price_cents', median },
      confidence: 0.8,
    })
  }

  // Signature items: items flagged is_featured.
  const signatures = items.filter(i => i.is_featured).map(i => i.name).slice(0, 8)
  if (signatures.length > 0) {
    facts.push({
      key: FACT_KEYS.MENU_SIGNATURE_ITEMS,
      value: signatures,
      source: 'extracted',
      confidence: 0.9,
    })
  }
  return facts
}

// ─── Walk all clients ─────────────────────────────────────────────

export interface ExtractAllReport {
  clientsProcessed: number
  totalFactsWritten: number
  errors: Array<{ clientId: string; messages: string[] }>
}

export async function extractFactsForAllClients(): Promise<ExtractAllReport> {
  const admin = createAdminClient()
  const { data: clients } = await admin.from('clients').select('id').order('created_at')
  const errors: ExtractAllReport['errors'] = []
  let total = 0
  for (const c of (clients ?? []) as Array<{ id: string }>) {
    const result = await extractFactsForClient(c.id)
    total += result.factsWritten
    if (result.errors.length > 0) errors.push({ clientId: c.id, messages: result.errors })
  }
  return {
    clientsProcessed: (clients ?? []).length,
    totalFactsWritten: total,
    errors,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function extractHandle(igUrl: string): string | null {
  const m = igUrl.match(/instagram\.com\/([^/?#]+)/i)
  if (!m) return null
  return `@${m[1].replace(/\/$/, '')}`
}
