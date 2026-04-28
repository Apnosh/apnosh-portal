/**
 * Looker Studio GBP CSV parser -- shared between the browser upload
 * page (/admin/gbp/backfill) and the server-side Vercel cron ingest
 * (/api/cron/gbp-ingest). Keeping a single implementation means both
 * paths behave identically.
 *
 * Pure functions only, no IO, safe to import from any runtime.
 */

import type { LookerGbpRow } from '@/lib/gbp-backfill-actions'

type Field =
  | 'date' | 'location_name' | 'store_code' | 'address'
  | 'impressions_search_mobile' | 'impressions_search_desktop'
  | 'impressions_maps_mobile'   | 'impressions_maps_desktop'
  | 'impressions_total'
  | 'website_clicks' | 'calls' | 'directions' | 'conversations' | 'bookings'
  | 'photo_views' | 'photo_count' | 'post_views' | 'post_clicks'

const PATTERNS: Array<{ field: Field; re: RegExp }> = [
  { field: 'date', re: /^(date|day|period|metric\s*date)$/i },
  { field: 'location_name', re: /^(business[_\s]*name|location[_\s]*name|location|name)$/i },
  { field: 'store_code', re: /^(store[_\s]*code|location[_\s]*id|place[_\s]*id)$/i },
  { field: 'address', re: /^(address|street[_\s]*address|location[_\s]*address)$/i },
  { field: 'impressions_search_mobile', re: /search.*mobile|mobile.*search/i },
  { field: 'impressions_search_desktop', re: /search.*desktop|desktop.*search/i },
  { field: 'impressions_maps_mobile', re: /maps.*mobile|mobile.*maps/i },
  { field: 'impressions_maps_desktop', re: /maps.*desktop|desktop.*maps/i },
  { field: 'impressions_total', re: /^(total[_\s]*impressions?|impressions?[_\s]*total|views?|total[_\s]*views?)$/i },
  { field: 'website_clicks', re: /website/i },
  { field: 'calls', re: /^(calls?|phone[_\s]*calls?|call[_\s]*clicks?)$/i },
  { field: 'directions', re: /direction/i },
  { field: 'conversations', re: /conversation|message/i },
  { field: 'bookings', re: /booking/i },
  { field: 'photo_views', re: /photo[_\s]*view/i },
  { field: 'photo_count', re: /photo[_\s]*count|photos?$/i },
  { field: 'post_views', re: /post[_\s]*view/i },
  { field: 'post_clicks', re: /post[_\s]*click/i },
]

export function splitCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  return lines.map(line => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue }
      current += ch
    }
    cells.push(current.trim())
    return cells
  })
}

export function normalizeDate(raw: string): string | null {
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (mdy) {
    const [, m, d, y] = mdy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const ymd = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function parseIntLoose(v: string | undefined): number {
  if (!v) return 0
  const n = parseInt(v.replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export interface ParsedCsv {
  rows: LookerGbpRow[]
  totalRows: number
  errors: string[]
}

/**
 * Parse a Looker Studio GBP CSV into normalized rows.
 * Returns rows + count of parse errors (capped at first 5 for brevity).
 */
export function parseLookerCsv(text: string): ParsedCsv {
  const rawRows = splitCsvRows(text)
  if (rawRows.length < 2) return { rows: [], totalRows: 0, errors: ['File has no data rows'] }

  const headers = rawRows[0]
  const fieldIdx: Partial<Record<Field, number>> = {}

  headers.forEach((h, i) => {
    const match = PATTERNS.find(p => p.re.test(h.trim()))
    if (match && fieldIdx[match.field] === undefined) {
      fieldIdx[match.field] = i
    }
  })

  if (fieldIdx.date === undefined) {
    return { rows: [], totalRows: 0, errors: ['No date column. Headers: ' + headers.join(', ')] }
  }
  if (fieldIdx.location_name === undefined) {
    return { rows: [], totalRows: 0, errors: ['No business/location name column. Headers: ' + headers.join(', ')] }
  }

  const rows: LookerGbpRow[] = []
  const errors: string[] = []

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    const date = normalizeDate(row[fieldIdx.date!])
    const loc = row[fieldIdx.location_name!]?.trim()
    if (!date || !loc) {
      if (errors.length < 5) errors.push(`Row ${i + 1}: missing date or location`)
      continue
    }

    const get = (f: Field) => fieldIdx[f] !== undefined ? parseIntLoose(row[fieldIdx[f]!]) : 0
    const getStr = (f: Field) => fieldIdx[f] !== undefined ? row[fieldIdx[f]!]?.trim() || undefined : undefined

    rows.push({
      date,
      location_name: loc,
      store_code: getStr('store_code'),
      address: getStr('address'),
      impressions_search_mobile: get('impressions_search_mobile'),
      impressions_search_desktop: get('impressions_search_desktop'),
      impressions_maps_mobile: get('impressions_maps_mobile'),
      impressions_maps_desktop: get('impressions_maps_desktop'),
      impressions_total: fieldIdx.impressions_total !== undefined ? get('impressions_total') : undefined,
      website_clicks: get('website_clicks'),
      calls: get('calls'),
      directions: get('directions'),
      conversations: get('conversations'),
      bookings: get('bookings'),
      photo_views: get('photo_views'),
      photo_count: get('photo_count'),
      post_views: get('post_views'),
      post_clicks: get('post_clicks'),
    })
  }

  return { rows, totalRows: rawRows.length - 1, errors }
}

// ---------------------------------------------------------------------------
// GMB Insights "Local Reports" CSV (Business Profile Manager bulk export).
//
// This format is AGGREGATE: one row per location with totals over the
// reporting period -- there is no per-day breakdown. To get a time
// series, the admin downloads multiple monthly windows and we stamp
// each row with the END date of its window so they line up on a chart.
//
// Filename carries the date range, e.g.:
//   "GMB insights (Performance Report) - 2026-3-1 - 2026-3-31 - <hash>.csv"
// Header row has the metric names; row 2 is a long human-readable
// description (skipped). Data rows start at index 2.
// ---------------------------------------------------------------------------

export function extractDateRangeFromGmbFilename(
  filename: string,
): { start: string; end: string } | null {
  const m = filename.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*-\s*(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return null
  const pad2 = (s: string) => s.padStart(2, '0')
  return {
    start: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`,
    end:   `${m[4]}-${pad2(m[5])}-${pad2(m[6])}`,
  }
}

export function parseGmbInsightsCsv(
  text: string,
  dateRange: { start: string; end: string },
): ParsedCsv {
  const rawRows = splitCsvRows(text)
  if (rawRows.length < 3) {
    return { rows: [], totalRows: 0, errors: ['File has too few rows for GMB Insights format'] }
  }

  const headers = rawRows[0].map(h => h.trim())
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => { idx[h] = i })

  // Sanity-check this really is the GMB Insights format
  if (idx['Business name'] === undefined || idx['Google Search - Mobile'] === undefined) {
    return { rows: [], totalRows: 0, errors: ['Not GMB Insights format (missing "Business name" / "Google Search - Mobile")'] }
  }

  const get = (row: string[], col: string): number => {
    if (idx[col] === undefined) return 0
    const raw = row[idx[col]]
    if (!raw) return 0
    const n = parseInt(raw.replace(/[,\s]/g, ''))
    return Number.isFinite(n) ? n : 0
  }

  // GMB exports include "Store code" (Google's stable ID) and "Address".
  // Both are optional in older exports but present in current downloads.
  const getStr = (row: string[], col: string): string | undefined => {
    if (idx[col] === undefined) return undefined
    return row[idx[col]]?.trim() || undefined
  }

  const rows: LookerGbpRow[] = []
  // rawRows[0] = headers, rawRows[1] = description blurb (skip), data from index 2
  for (let i = 2; i < rawRows.length; i++) {
    const row = rawRows[i]
    const name = row[idx['Business name']]?.trim()
    if (!name) continue

    const searchMobile = get(row, 'Google Search - Mobile')
    const searchDesktop = get(row, 'Google Search - Desktop')
    const mapsMobile = get(row, 'Google Maps - Mobile')
    const mapsDesktop = get(row, 'Google Maps - Desktop')

    rows.push({
      // Stamp every row with the period's END date so monthly windows
      // chart as one point per month at the month-end.
      date: dateRange.end,
      location_name: name,
      store_code: getStr(row, 'Store code') ?? getStr(row, 'Store Code'),
      address: getStr(row, 'Address'),
      impressions_search_mobile: searchMobile,
      impressions_search_desktop: searchDesktop,
      impressions_maps_mobile: mapsMobile,
      impressions_maps_desktop: mapsDesktop,
      impressions_total: searchMobile + searchDesktop + mapsMobile + mapsDesktop,
      website_clicks: get(row, 'Website clicks'),
      calls: get(row, 'Calls'),
      directions: get(row, 'Directions'),
      conversations: get(row, 'Messages') || get(row, 'Conversations'),
      bookings: get(row, 'Bookings') || get(row, 'Bookings count'),
      photo_views: get(row, 'Photo views') || get(row, 'Photos views'),
      photo_count: get(row, 'Photo count') || get(row, 'Total photos'),
      post_views: get(row, 'Post views') || get(row, 'Posts views'),
      post_clicks: get(row, 'Post clicks') || get(row, 'Posts clicks'),
      food_orders: get(row, 'Food orders'),
      food_menu_clicks: get(row, 'Food menu clicks'),
    })
  }

  return { rows, totalRows: rawRows.length - 2, errors: [] }
}

/**
 * Auto-detecting parser: tries GMB Insights format first (using the
 * filename's date range), falls back to Looker daily format.
 */
export function parseGbpCsvAuto(text: string, filename: string): ParsedCsv & {
  format: 'gmb_aggregate' | 'looker_daily' | 'unknown'
} {
  const dateRange = extractDateRangeFromGmbFilename(filename)
  if (dateRange) {
    const gmb = parseGmbInsightsCsv(text, dateRange)
    if (gmb.rows.length > 0) return { ...gmb, format: 'gmb_aggregate' }
  }
  const looker = parseLookerCsv(text)
  if (looker.rows.length > 0) return { ...looker, format: 'looker_daily' }
  return { ...looker, format: 'unknown' }
}
