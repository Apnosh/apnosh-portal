'use server'

/**
 * Bulk GBP backfill -- takes a Looker Studio CSV export that covers
 * ALL managed locations for the last N months and routes each row
 * to the right client via fuzzy business-name matching.
 *
 * The single-client importer lives in
 *   src/app/admin/clients/[slug]/import-gbp/actions.ts
 * This file is the multi-client companion used by /admin/gbp/backfill.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSupabase = SupabaseClient<any, 'public', any>

function getAdminSupabase(): AdminSupabase {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as AdminSupabase
}

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Admin access required' }
  }
  return { ok: true, userId: user.id }
}

// ---------------------------------------------------------------------------
// Shape of a single parsed Looker Studio row (client-side parser produces this)
// ---------------------------------------------------------------------------

export interface LookerGbpRow {
  /** YYYY-MM-DD */
  date: string
  /** Business Profile location name as it appears in Looker (e.g. "Anchovies & Salt") */
  location_name: string

  // Impressions (split by surface + platform where available)
  impressions_search_mobile?: number
  impressions_search_desktop?: number
  impressions_maps_mobile?: number
  impressions_maps_desktop?: number
  impressions_total?: number

  // Engagement
  website_clicks?: number
  calls?: number
  directions?: number
  conversations?: number
  bookings?: number

  // Visibility
  photo_views?: number
  photo_count?: number
  post_views?: number
  post_clicks?: number

  // Search queries that surfaced the location that day
  top_queries?: Array<{ query: string; impressions: number }>
}

// ---------------------------------------------------------------------------
// Fuzzy client matching -- Looker's "Business Name" rarely matches
// clients.name verbatim (e.g. "Anchovies and Salt" vs "Anchovies & Salt").
// Strategy: normalize both sides, score by token overlap + substring.
// ---------------------------------------------------------------------------

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ClientRow { id: string; name: string; slug: string }

function scoreMatch(locationName: string, client: ClientRow): number {
  const a = normalizeForMatch(locationName)
  const b = normalizeForMatch(client.name)
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.85

  const aTokens = new Set(a.split(' ').filter(t => t.length > 2))
  const bTokens = new Set(b.split(' ').filter(t => t.length > 2))
  if (aTokens.size === 0 || bTokens.size === 0) return 0

  let overlap = 0
  for (const t of aTokens) if (bTokens.has(t)) overlap++
  return overlap / Math.max(aTokens.size, bTokens.size)
}

function findBestClient(locationName: string, clients: ClientRow[]): ClientRow | null {
  let best: { client: ClientRow; score: number } | null = null
  for (const c of clients) {
    const s = scoreMatch(locationName, c)
    if (!best || s > best.score) best = { client: c, score: s }
  }
  // Require > 0.5 to avoid false positives (two clients sharing one
  // generic word like "Kitchen" shouldn't auto-match).
  return best && best.score >= 0.5 ? best.client : null
}

// ---------------------------------------------------------------------------
// Preview -- group rows by location, show what would match, unmatched
// locations flagged so admin can fix the name in the DB before running.
// ---------------------------------------------------------------------------

export interface BackfillPreview {
  totalRows: number
  dateRangeStart: string
  dateRangeEnd: string
  locationsMatched: Array<{
    locationName: string
    clientId: string
    clientName: string
    rowCount: number
    dateFirst: string
    dateLast: string
  }>
  locationsUnmatched: Array<{ locationName: string; rowCount: number }>
}

export async function previewBackfill(
  rows: LookerGbpRow[],
): Promise<{ success: true; data: BackfillPreview } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (rows.length === 0) return { success: false, error: 'No rows to import' }

  const admin = getAdminSupabase()
  const { data: clientsRaw } = await admin.from('clients').select('id, name, slug')
  const clients = (clientsRaw ?? []) as ClientRow[]

  const byLocation = new Map<string, LookerGbpRow[]>()
  for (const r of rows) {
    const key = r.location_name.trim()
    if (!byLocation.has(key)) byLocation.set(key, [])
    byLocation.get(key)!.push(r)
  }

  const matched: BackfillPreview['locationsMatched'] = []
  const unmatched: BackfillPreview['locationsUnmatched'] = []

  for (const [loc, locRows] of byLocation) {
    const client = findBestClient(loc, clients)
    const dates = locRows.map(r => r.date).sort()
    if (client) {
      matched.push({
        locationName: loc,
        clientId: client.id,
        clientName: client.name,
        rowCount: locRows.length,
        dateFirst: dates[0],
        dateLast: dates[dates.length - 1],
      })
    } else {
      unmatched.push({ locationName: loc, rowCount: locRows.length })
    }
  }

  const allDates = rows.map(r => r.date).sort()
  return {
    success: true,
    data: {
      totalRows: rows.length,
      dateRangeStart: allDates[0],
      dateRangeEnd: allDates[allDates.length - 1],
      locationsMatched: matched.sort((a, b) => b.rowCount - a.rowCount),
      locationsUnmatched: unmatched,
    },
  }
}

// ---------------------------------------------------------------------------
// Ingest -- does the actual upsert. Idempotent: re-running the same
// export just overwrites the same (client, date) rows.
// ---------------------------------------------------------------------------

export async function runBackfill(args: {
  rows: LookerGbpRow[]
  filename?: string
  source?: 'looker_csv' | 'manual_upload'
}): Promise<{ success: true; data: {
  imported: number
  unmatched: number
  jobId: string
} } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (args.rows.length === 0) return { success: false, error: 'No rows to import' }

  const admin = getAdminSupabase()
  const { data: clientsRaw } = await admin.from('clients').select('id, name, slug')
  const clients = (clientsRaw ?? []) as ClientRow[]

  const source = args.source ?? 'looker_csv'

  // Bucket rows by resolved client_id so we can upsert in a few big batches
  // rather than one call per row.
  const byClient = new Map<string, LookerGbpRow[]>()
  const unmatchedLocations = new Set<string>()
  const matchedLocations = new Set<string>()

  for (const r of args.rows) {
    const client = findBestClient(r.location_name, clients)
    if (!client) {
      unmatchedLocations.add(r.location_name)
      continue
    }
    matchedLocations.add(r.location_name)
    if (!byClient.has(client.id)) byClient.set(client.id, [])
    byClient.get(client.id)!.push(r)
  }

  let imported = 0
  const allDates = args.rows.map(r => r.date).sort()
  const rangeStart = allDates[0]
  const rangeEnd = allDates[allDates.length - 1]

  for (const [clientId, clientRows] of byClient) {
    const locName = clientRows[0].location_name
    const locationId = `loc_${locName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50)}`

    // Make sure a gbp_connections row exists so the client tab can
    // show "last synced X".
    await admin.from('gbp_connections').upsert({
      client_id: clientId,
      location_id: locationId,
      location_name: locName,
      connection_type: 'csv_import',
      last_sync_at: new Date().toISOString(),
      sync_status: 'active',
    }, { onConflict: 'client_id,location_id' })

    // Build the full metric rows. `search_views` kept for back-compat;
    // new rich columns populated directly.
    const upsertRows = clientRows.map(r => {
      const total = r.impressions_total ?? (
        (r.impressions_search_mobile ?? 0) +
        (r.impressions_search_desktop ?? 0) +
        (r.impressions_maps_mobile ?? 0) +
        (r.impressions_maps_desktop ?? 0)
      )
      return {
        client_id: clientId,
        location_id: locationId,
        location_name: locName,
        date: r.date,
        directions: r.directions ?? 0,
        calls: r.calls ?? 0,
        website_clicks: r.website_clicks ?? 0,
        search_views: total, // legacy column -- keep populated
        impressions_search_mobile: r.impressions_search_mobile ?? 0,
        impressions_search_desktop: r.impressions_search_desktop ?? 0,
        impressions_maps_mobile: r.impressions_maps_mobile ?? 0,
        impressions_maps_desktop: r.impressions_maps_desktop ?? 0,
        impressions_total: total,
        photo_views: r.photo_views ?? 0,
        photo_count: r.photo_count ?? 0,
        post_views: r.post_views ?? 0,
        post_clicks: r.post_clicks ?? 0,
        conversations: r.conversations ?? 0,
        bookings: r.bookings ?? 0,
        top_queries: r.top_queries ?? null,
        source,
      }
    })

    // Chunk to stay under PostgREST's row limit
    for (let i = 0; i < upsertRows.length; i += 500) {
      const chunk = upsertRows.slice(i, i + 500)
      const { error } = await admin
        .from('gbp_metrics')
        .upsert(chunk, { onConflict: 'client_id,location_id,date' })
      if (error) {
        return { success: false, error: `Import failed at row ${i}: ${error.message}` }
      }
      imported += chunk.length
    }

    revalidatePath(`/admin/clients/${clientId}`)
  }

  // Record the job for audit
  const { data: job } = await admin.from('gbp_backfill_jobs').insert({
    uploaded_by: auth.userId,
    source,
    filename: args.filename ?? null,
    row_count: args.rows.length,
    matched_rows: imported,
    unmatched_rows: args.rows.length - imported,
    unmatched_locations: [...unmatchedLocations],
    date_range_start: rangeStart,
    date_range_end: rangeEnd,
    client_ids: [...byClient.keys()],
  }).select('id').maybeSingle()

  revalidatePath('/admin/gbp/backfill')
  return {
    success: true,
    data: {
      imported,
      unmatched: args.rows.length - imported,
      jobId: (job as { id: string } | null)?.id ?? '',
    },
  }
}

// ---------------------------------------------------------------------------
// Read-side helpers used by the Local SEO tab
// ---------------------------------------------------------------------------

export interface LocalSeoDailyRow {
  date: string
  impressions_total: number
  impressions_search: number
  impressions_maps: number
  website_clicks: number
  calls: number
  directions: number
  photo_views: number
  post_views: number
}

export interface LocalSeoSummary {
  daysCovered: number
  lastSyncAt: string | null
  dateFirst: string | null
  dateLast: string | null
  totals30d: {
    impressions: number; actions: number; calls: number; directions: number; website: number
  }
  totalsPrev30d: {
    impressions: number; actions: number; calls: number; directions: number; website: number
  }
  topQueries: Array<{ query: string; impressions: number }>
  daily: LocalSeoDailyRow[]
}

export async function getLocalSeoSummary(
  clientId: string,
  days = 90,
): Promise<{ success: true; data: LocalSeoSummary } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const { data: rows, error } = await admin
    .from('gbp_metrics')
    .select('date, impressions_total, impressions_search_mobile, impressions_search_desktop, impressions_maps_mobile, impressions_maps_desktop, website_clicks, calls, directions, photo_views, post_views, top_queries')
    .eq('client_id', clientId)
    .gte('date', cutoffIso)
    .order('date', { ascending: true })

  if (error) return { success: false, error: error.message }

  const daily: LocalSeoDailyRow[] = (rows ?? []).map(r => ({
    date: r.date,
    impressions_total: r.impressions_total ?? 0,
    impressions_search: (r.impressions_search_mobile ?? 0) + (r.impressions_search_desktop ?? 0),
    impressions_maps: (r.impressions_maps_mobile ?? 0) + (r.impressions_maps_desktop ?? 0),
    website_clicks: r.website_clicks ?? 0,
    calls: r.calls ?? 0,
    directions: r.directions ?? 0,
    photo_views: r.photo_views ?? 0,
    post_views: r.post_views ?? 0,
  }))

  // Window totals: last 30 days vs the 30 days before that
  const today = new Date()
  const d30 = new Date(today); d30.setDate(d30.getDate() - 30)
  const d60 = new Date(today); d60.setDate(d60.getDate() - 60)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const sumWindow = (fromIso: string, toIso: string) => {
    const win = daily.filter(r => r.date >= fromIso && r.date < toIso)
    const imp = win.reduce((a, r) => a + r.impressions_total, 0)
    const calls = win.reduce((a, r) => a + r.calls, 0)
    const dirs = win.reduce((a, r) => a + r.directions, 0)
    const web = win.reduce((a, r) => a + r.website_clicks, 0)
    return { impressions: imp, actions: calls + dirs + web, calls, directions: dirs, website: web }
  }

  const totals30d = sumWindow(iso(d30), iso(new Date(today.getTime() + 86400000)))
  const totalsPrev30d = sumWindow(iso(d60), iso(d30))

  // Aggregate top queries across the window
  const queryTotals = new Map<string, number>()
  for (const r of rows ?? []) {
    const qs = (r.top_queries as Array<{ query: string; impressions: number }> | null) ?? []
    for (const q of qs) {
      queryTotals.set(q.query, (queryTotals.get(q.query) ?? 0) + (q.impressions ?? 0))
    }
  }
  const topQueries = [...queryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([query, impressions]) => ({ query, impressions }))

  // Last sync from gbp_connections
  const { data: conn } = await admin
    .from('gbp_connections')
    .select('last_sync_at')
    .eq('client_id', clientId)
    .order('last_sync_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastSyncAt = (conn as { last_sync_at?: string } | null)?.last_sync_at ?? null

  return {
    success: true,
    data: {
      daysCovered: daily.length,
      lastSyncAt,
      dateFirst: daily[0]?.date ?? null,
      dateLast: daily[daily.length - 1]?.date ?? null,
      totals30d,
      totalsPrev30d,
      topQueries,
      daily,
    },
  }
}
