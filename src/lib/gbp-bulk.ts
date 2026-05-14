'use server'

/**
 * Bulk operations across multiple GBP locations for one client.
 * Fans out single-location PATCH calls; reports per-location success.
 *
 * Restricted to a few high-value operations where a multi-location
 * client genuinely wants the same change on every location:
 *   - Adding a special-hours date (e.g. Thanksgiving closed)
 *   - Toggling an attribute (e.g. accepts_reservations true)
 *   - Setting the menu link URL
 */

import { updateClientListing, updateClientAttributes, type SpecialHours, type AttributeValues, getClientListing } from '@/lib/gbp-listing'
import { updateClientMenuLink } from '@/lib/gbp-menu'

export interface BulkResult {
  succeeded: string[]
  failed: Array<{ locationId: string; error: string }>
}

/* Add (or update) a single special-hours entry across many locations.
   Existing entries for the same date are replaced; other entries
   remain. Empty time means "Closed that day". */
export async function bulkSetSpecialHours(
  clientId: string,
  locationIds: string[],
  entry: { date: string; closed: boolean; open?: string; close?: string },
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] }
  for (const locId of locationIds) {
    try {
      const listing = await getClientListing(clientId, locId)
      if (!listing.ok) {
        result.failed.push({ locationId: locId, error: listing.error })
        continue
      }
      const existing = (listing.fields.specialHours ?? []) as SpecialHours
      const filtered = existing.filter(s => s.date !== entry.date)
      const next: SpecialHours = entry.closed
        ? [...filtered, { date: entry.date, closed: true }]
        : [...filtered, { date: entry.date, closed: false, open: entry.open ?? '00:00', close: entry.close ?? '23:59' }]
      const update = await updateClientListing(clientId, { specialHours: next }, locId)
      if (update.ok) result.succeeded.push(locId)
      else result.failed.push({ locationId: locId, error: update.error })
    } catch (err) {
      result.failed.push({ locationId: locId, error: (err as Error).message })
    }
  }
  return result
}

/* Toggle one or more attributes across many locations. Passing
   `null` for a value clears the attribute. */
export async function bulkSetAttributes(
  clientId: string,
  locationIds: string[],
  values: AttributeValues,
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] }
  for (const locId of locationIds) {
    try {
      const update = await updateClientAttributes(clientId, values, locId)
      if (update.ok) result.succeeded.push(locId)
      else result.failed.push({ locationId: locId, error: update.error })
    } catch (err) {
      result.failed.push({ locationId: locId, error: (err as Error).message })
    }
  }
  return result
}

/* Set the same menu link URL across many locations. */
export async function bulkSetMenuLink(
  clientId: string,
  locationIds: string[],
  menuUrl: string,
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] }
  for (const locId of locationIds) {
    try {
      const update = await updateClientMenuLink(clientId, menuUrl, locId)
      if (update.ok) result.succeeded.push(locId)
      else result.failed.push({ locationId: locId, error: update.error })
    } catch (err) {
      result.failed.push({ locationId: locId, error: (err as Error).message })
    }
  }
  return result
}
