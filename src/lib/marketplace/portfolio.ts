'use server'

/**
 * Vendor portfolio helpers.
 *
 * Reads from vendor_portfolio_items + resolves Supabase Storage paths
 * to public URLs for rendering. Writes (upload) live in the admin
 * tool and the vendor-dashboard upload action (Phase 3).
 */

import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'vendor-portfolio'

export interface PortfolioItem {
  id: string
  vendorId: string
  url: string                  // resolved public URL
  thumbnailUrl: string | null  // resolved public URL of thumbnail variant
  caption: string | null
  category: string | null
  displayOrder: number
  featured: boolean
  externalUrl: string | null
  width: number | null
  height: number | null
  createdAt: string
}

interface PortfolioRow {
  id: string
  vendor_id: string
  storage_path: string
  thumbnail_path: string | null
  caption: string | null
  category: string | null
  display_order: number
  featured: boolean
  external_url: string | null
  width: number | null
  height: number | null
  created_at: string
}

function resolvePublicUrl(path: string): string {
  /* Supabase public URL pattern. Avoids needing the client at render time. */
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`
}

function rowToItem(r: PortfolioRow): PortfolioItem {
  return {
    id: r.id,
    vendorId: r.vendor_id,
    url: resolvePublicUrl(r.storage_path),
    thumbnailUrl: r.thumbnail_path ? resolvePublicUrl(r.thumbnail_path) : null,
    caption: r.caption,
    category: r.category,
    displayOrder: r.display_order,
    featured: r.featured,
    externalUrl: r.external_url,
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
  }
}

/**
 * All portfolio items for a vendor, ordered for gallery display.
 * Used by /marketplace/[slug] profile page.
 */
export async function getVendorPortfolio(vendorId: string): Promise<PortfolioItem[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('vendor_portfolio_items')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false }) as { data: PortfolioRow[] | null }
  return (data ?? []).map(rowToItem)
}

/**
 * Featured items (max 3) for the card hero carousel. Falls back to
 * the first 3 portfolio items if none are explicitly featured.
 */
export async function getFeaturedPortfolio(vendorIds: string[]): Promise<Map<string, PortfolioItem[]>> {
  if (vendorIds.length === 0) return new Map()
  const admin = createAdminClient()
  const { data } = await admin
    .from('vendor_portfolio_items')
    .select('*')
    .in('vendor_id', vendorIds)
    .order('featured', { ascending: false })
    .order('display_order', { ascending: true }) as { data: PortfolioRow[] | null }

  const map = new Map<string, PortfolioItem[]>()
  for (const row of data ?? []) {
    const arr = map.get(row.vendor_id) ?? []
    /* Cap each vendor at 3 items in the carousel. */
    if (arr.length < 3) arr.push(rowToItem(row))
    map.set(row.vendor_id, arr)
  }
  return map
}
