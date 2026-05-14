'use server'

/**
 * NAP citation audit -- checks that the client's name / address /
 * phone is consistent across the major directories. Inconsistencies
 * hurt local SEO ranking; even a different suite number or old phone
 * is enough to drop a listing in Google's "near me" results.
 *
 * For platforms where we have an API (Yelp Fusion), the check is
 * fully automated. For platforms where we don't (Apple Maps, BBB),
 * the strategist marks them verified after a manual check.
 *
 * Reads the GBP listing as the source-of-truth NAP. Each platform's
 * findings are compared and surfaced in citation_audits.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getClientListing } from '@/lib/gbp-listing'

export type CitationPlatform =
  | 'yelp' | 'tripadvisor' | 'apple_maps' | 'facebook' | 'foursquare' | 'bbb'

export interface CitationAudit {
  platform: CitationPlatform
  listingUrl: string | null
  nameFound: string | null
  addressFound: string | null
  phoneFound: string | null
  consistent: boolean | null
  inconsistencies: string[]
  checkedAt: string
  source: 'manual' | 'api' | 'scrape'
  notes: string | null
}

export interface AuditSummary {
  source: { name: string; address: string; phone: string }
  audits: CitationAudit[]
}

export async function getCitationAudits(clientId: string): Promise<AuditSummary | null> {
  const admin = createAdminClient()
  const [listingRes, conn, auditsRes] = await Promise.all([
    getClientListing(clientId).catch(() => null),
    admin
      .from('channel_connections')
      .select('platform_account_name, metadata')
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .eq('status', 'active')
      .neq('platform_account_id', 'pending')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('citation_audits')
      .select('platform, listing_url, name_found, address_found, phone_found, consistent, inconsistencies, checked_at, source, notes')
      .eq('client_id', clientId)
      .order('checked_at', { ascending: false }),
  ])

  const fields = listingRes?.ok ? listingRes.fields : null
  const meta = (conn.data?.metadata ?? {}) as Record<string, unknown>
  const source = {
    name: conn.data?.platform_account_name ?? '',
    address: (meta.address as string | undefined) ?? '',
    phone: fields?.primaryPhone ?? '',
  }

  const rows = (auditsRes.data ?? []) as Array<{
    platform: string
    listing_url: string | null
    name_found: string | null
    address_found: string | null
    phone_found: string | null
    consistent: boolean | null
    inconsistencies: string[] | null
    checked_at: string
    source: string
    notes: string | null
  }>

  return {
    source,
    audits: rows.map(r => ({
      platform: r.platform as CitationPlatform,
      listingUrl: r.listing_url,
      nameFound: r.name_found,
      addressFound: r.address_found,
      phoneFound: r.phone_found,
      consistent: r.consistent,
      inconsistencies: r.inconsistencies ?? [],
      checkedAt: r.checked_at,
      source: r.source as 'manual' | 'api' | 'scrape',
      notes: r.notes,
    })),
  }
}

/* Save a manual audit entry (strategist pasted what they see). */
export async function saveCitationAudit(
  clientId: string,
  userId: string,
  input: {
    platform: CitationPlatform
    listingUrl?: string
    nameFound?: string
    addressFound?: string
    phoneFound?: string
    notes?: string
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const summary = await getCitationAudits(clientId)
  if (!summary) return { ok: false, error: 'Could not read source NAP' }

  const inconsistencies = compareNap(summary.source, {
    name: input.nameFound ?? '',
    address: input.addressFound ?? '',
    phone: input.phoneFound ?? '',
  })
  const consistent = inconsistencies.length === 0

  /* Upsert by (client_id, platform). */
  await admin.from('citation_audits').delete()
    .eq('client_id', clientId).eq('platform', input.platform)

  const { error } = await admin.from('citation_audits').insert({
    client_id: clientId,
    platform: input.platform,
    listing_url: input.listingUrl ?? null,
    name_found: input.nameFound ?? null,
    address_found: input.addressFound ?? null,
    phone_found: input.phoneFound ?? null,
    consistent,
    inconsistencies,
    checked_by: userId,
    source: 'manual',
    notes: input.notes ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* Yelp Fusion automated check. Free key required. Searches by name
   + city, picks the top match, reads back NAP. */
export async function checkYelpForClient(
  clientId: string,
  userId: string,
): Promise<{ ok: true; matched: boolean } | { ok: false; error: string }> {
  const apiKey = process.env.YELP_API_KEY
  if (!apiKey) return { ok: false, error: 'YELP_API_KEY not configured' }

  const summary = await getCitationAudits(clientId)
  if (!summary) return { ok: false, error: 'Could not read source NAP' }
  const { name, address } = summary.source
  if (!name || !address) return { ok: false, error: 'Missing GBP name or address — cannot search Yelp' }

  const city = address.split(',')[1]?.trim() ?? ''
  const url = new URL('https://api.yelp.com/v3/businesses/search')
  url.searchParams.set('term', name)
  url.searchParams.set('location', city || address)
  url.searchParams.set('limit', '5')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const body = await res.json() as { businesses?: Array<{
    name: string; phone: string; display_phone: string; location: { display_address: string[] }; url: string
  }> }
  if (!res.ok) return { ok: false, error: `Yelp HTTP ${res.status}` }

  const matches = body.businesses ?? []
  const top = matches.find(b => b.name.toLowerCase().includes(name.toLowerCase().slice(0, 8)))
    ?? matches[0]

  if (!top) {
    return persistAudit(clientId, userId, {
      platform: 'yelp', source: 'api',
      listingUrl: null, nameFound: null, addressFound: null, phoneFound: null,
      notes: 'No matching listing found on Yelp.',
    }).then(r => ({ ...r, matched: false }))
  }

  const found = {
    name: top.name,
    address: top.location.display_address.join(', '),
    phone: top.display_phone || top.phone,
  }
  return persistAudit(clientId, userId, {
    platform: 'yelp', source: 'api',
    listingUrl: top.url,
    nameFound: found.name,
    addressFound: found.address,
    phoneFound: found.phone,
    notes: null,
  }).then(r => ({ ...r, matched: true }))
}

async function persistAudit(
  clientId: string,
  userId: string,
  input: {
    platform: CitationPlatform
    listingUrl: string | null
    nameFound: string | null
    addressFound: string | null
    phoneFound: string | null
    source: 'manual' | 'api' | 'scrape'
    notes: string | null
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const summary = await getCitationAudits(clientId)
  if (!summary) return { ok: false, error: 'Could not read source NAP' }
  const inconsistencies = input.nameFound || input.addressFound || input.phoneFound
    ? compareNap(summary.source, {
        name: input.nameFound ?? '',
        address: input.addressFound ?? '',
        phone: input.phoneFound ?? '',
      })
    : []
  const consistent = input.nameFound !== null && inconsistencies.length === 0

  await admin.from('citation_audits').delete()
    .eq('client_id', clientId).eq('platform', input.platform)
  const { error } = await admin.from('citation_audits').insert({
    client_id: clientId,
    platform: input.platform,
    listing_url: input.listingUrl,
    name_found: input.nameFound,
    address_found: input.addressFound,
    phone_found: input.phoneFound,
    consistent,
    inconsistencies,
    checked_by: userId,
    source: input.source,
    notes: input.notes,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* Normalize + compare. Returns the names of fields that differ. */
function compareNap(
  source: { name: string; address: string; phone: string },
  found: { name: string; address: string; phone: string },
): string[] {
  const diffs: string[] = []
  if (norm(found.name) && norm(found.name) !== norm(source.name)) diffs.push('name')
  if (normAddress(found.address) && normAddress(found.address) !== normAddress(source.address)) diffs.push('address')
  if (normPhone(found.phone) && normPhone(found.phone) !== normPhone(source.phone)) diffs.push('phone')
  return diffs
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

function normAddress(s: string): string {
  return s.toLowerCase()
    .replace(/\b(suite|ste|unit|apt|#)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function normPhone(s: string): string {
  return s.replace(/\D/g, '').slice(-10)
}
