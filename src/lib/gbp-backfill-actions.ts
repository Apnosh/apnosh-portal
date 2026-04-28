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
  /**
   * Google's stable store_code. Present in GMB Insights "Local Reports" CSVs
   * (column "Store code") and in API responses. Optional only because legacy
   * Looker daily exports pre-2024 don't always include it. When present we
   * route deterministically; when absent we fall back to fuzzy name matching.
   */
  store_code?: string
  /** Optional address from the CSV "Address" column, used for display in admin UI */
  address?: string

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

  // Restaurant-specific (in GMB monthly CSV)
  food_orders?: number
  food_menu_clicks?: number
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

interface ClientRow { id: string; name: string; slug: string; gbp_location_aliases?: string[] | null }

function scoreMatch(locationName: string, client: ClientRow): number {
  const a = normalizeForMatch(locationName)

  // Aliases are an exact-match shortcut: if the admin set one, treat it
  // as authoritative regardless of how different from client.name.
  for (const alias of client.gbp_location_aliases ?? []) {
    if (normalizeForMatch(alias) === a) return 1
  }

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
// Store_code resolution
// ---------------------------------------------------------------------------
// Modern GMB Insights CSVs include "Store code" (Google's stable ID).
// Older Looker daily exports might not. For rows missing store_code we
// generate a stable synthetic key from the location name so legacy data
// still flows through the same gbp_locations pipeline (just less precise:
// if the name changes, a new synthetic key would be generated and
// produce a duplicate location row -- the admin can merge in the UI).
// ---------------------------------------------------------------------------

function resolveStoreCode(r: LookerGbpRow): string {
  if (r.store_code && r.store_code.trim()) return r.store_code.trim()
  const slug = r.location_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `synthetic:${slug}`
}

// ---------------------------------------------------------------------------
// Preview -- group rows by store_code, classify each unique location into:
//   1. Will import   (location.status='assigned') -- silent, just import
//   2. Skipped       (location.status='skipped')  -- silent, ignored
//   3. Needs claim   (no row OR status='unassigned') -- admin assigns
//
// Side effect: for any unseen store_code, we upsert a gbp_locations row
// with status='unassigned' so the UI has a stable ID to send back when
// the admin clicks "Assign to client X".
// ---------------------------------------------------------------------------

export interface PendingLocation {
  /** gbp_locations.id (stable across the preview/run round-trip) */
  id: string
  storeCode: string
  locationName: string
  address: string | null
  rowCount: number
  /** First date observed in this CSV for this location */
  dateFirst: string
  /** Last date observed */
  dateLast: string
  /** Best fuzzy-match guess so we can pre-select in the dropdown */
  suggestedClientId: string | null
}

export interface AssignedLocation extends PendingLocation {
  clientId: string
  clientName: string
}

export interface BackfillPreview {
  totalRows: number
  dateRangeStart: string
  dateRangeEnd: string
  /** Locations already mapped to a client; will import without prompting */
  willImport: AssignedLocation[]
  /** Locations the admin previously marked "skip"; silently ignored */
  willSkip: PendingLocation[]
  /** New or never-claimed locations; admin must assign or skip */
  needsAssignment: PendingLocation[]
  /** All clients, for populating the assignment dropdown */
  clients: Array<{ id: string; name: string; slug: string }>
}

export async function previewBackfill(
  rows: LookerGbpRow[],
): Promise<{ success: true; data: BackfillPreview } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (rows.length === 0) return { success: false, error: 'No rows to import' }

  const admin = getAdminSupabase()
  // Defensively select aliases only if the column exists -- migration 068
  // adds it but is optional. Fallback to bare select if it's missing.
  type ClientWithAliases = { id: string; name: string; slug: string; gbp_location_aliases?: string[] | null }
  let clientsRaw: ClientWithAliases[] = []
  const tryWithAliases = await admin.from('clients').select('id, name, slug, gbp_location_aliases')
  if (tryWithAliases.error) {
    const fallback = await admin.from('clients').select('id, name, slug')
    clientsRaw = (fallback.data ?? []) as unknown as ClientWithAliases[]
  } else {
    clientsRaw = (tryWithAliases.data ?? []) as unknown as ClientWithAliases[]
  }
  const clients = clientsRaw as ClientRow[]

  // Group rows by store_code
  const byStoreCode = new Map<string, { rows: LookerGbpRow[]; name: string; address: string | null }>()
  for (const r of rows) {
    const code = resolveStoreCode(r)
    let entry = byStoreCode.get(code)
    if (!entry) {
      entry = { rows: [], name: r.location_name, address: r.address ?? null }
      byStoreCode.set(code, entry)
    }
    entry.rows.push(r)
    // Use the most recent row's name/address (CSVs are usually time-ordered)
    if (r.location_name) entry.name = r.location_name
    if (r.address) entry.address = r.address
  }

  // Bulk fetch existing gbp_locations
  const storeCodes = [...byStoreCode.keys()]
  const { data: existingLocs } = await admin
    .from('gbp_locations')
    .select('id, store_code, client_id, status, location_name')
    .in('store_code', storeCodes)
  const existingByCode = new Map<string, {
    id: string; client_id: string | null; status: string; location_name: string
  }>(
    (existingLocs ?? []).map(l => [l.store_code as string, {
      id: l.id as string,
      client_id: (l.client_id as string | null) ?? null,
      status: l.status as string,
      location_name: l.location_name as string,
    }])
  )

  // Upsert any new store_codes as 'unassigned'. This guarantees every
  // location in the preview has a real gbp_locations.id we can pass to
  // assignLocations() in the next step.
  const toUpsert: Array<{
    store_code: string; location_name: string; address: string | null
  }> = []
  for (const [code, info] of byStoreCode) {
    if (!existingByCode.has(code)) {
      toUpsert.push({ store_code: code, location_name: info.name, address: info.address })
    } else {
      // Refresh last_seen and any name drift
      await admin
        .from('gbp_locations')
        .update({ location_name: info.name, last_seen_at: new Date().toISOString() })
        .eq('store_code', code)
    }
  }
  if (toUpsert.length > 0) {
    const { data: inserted } = await admin
      .from('gbp_locations')
      .upsert(toUpsert, { onConflict: 'store_code' })
      .select('id, store_code, status, client_id, location_name')
    for (const row of inserted ?? []) {
      existingByCode.set(row.store_code as string, {
        id: row.id as string,
        client_id: (row.client_id as string | null) ?? null,
        status: row.status as string,
        location_name: row.location_name as string,
      })
    }
  }

  const willImport: AssignedLocation[] = []
  const willSkip: PendingLocation[] = []
  const needsAssignment: PendingLocation[] = []
  const clientById = new Map(clients.map(c => [c.id, c]))

  for (const [code, info] of byStoreCode) {
    const loc = existingByCode.get(code)!
    const dates = info.rows.map(r => r.date).sort()
    const base: PendingLocation = {
      id: loc.id,
      storeCode: code,
      locationName: info.name,
      address: info.address,
      rowCount: info.rows.length,
      dateFirst: dates[0],
      dateLast: dates[dates.length - 1],
      suggestedClientId: null,
    }

    if (loc.status === 'assigned' && loc.client_id) {
      const client = clientById.get(loc.client_id)
      if (client) {
        willImport.push({ ...base, clientId: client.id, clientName: client.name })
        continue
      }
      // Edge case: location is assigned but client was deleted. Treat as needs_assignment.
    }

    if (loc.status === 'skipped') {
      willSkip.push(base)
      continue
    }

    // Suggest a client via fuzzy match for the dropdown's default
    const guess = findBestClient(info.name, clients)
    needsAssignment.push({ ...base, suggestedClientId: guess?.id ?? null })
  }

  const allDates = rows.map(r => r.date).sort()
  return {
    success: true,
    data: {
      totalRows: rows.length,
      dateRangeStart: allDates[0],
      dateRangeEnd: allDates[allDates.length - 1],
      willImport: willImport.sort((a, b) => b.rowCount - a.rowCount),
      willSkip,
      needsAssignment: needsAssignment.sort((a, b) => b.rowCount - a.rowCount),
      clients: clients.map(c => ({ id: c.id, name: c.name, slug: c.slug })),
    },
  }
}

// ---------------------------------------------------------------------------
// Assign locations -- the admin's decisions about each unclaimed location.
// Called between preview and run.
// ---------------------------------------------------------------------------

export interface LocationAssignment {
  /** gbp_locations.id from the preview */
  locationId: string
  action: 'assign' | 'skip'
  /** Required when action='assign' */
  clientId?: string
}

export async function applyLocationAssignments(
  assignments: LocationAssignment[],
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  for (const a of assignments) {
    if (a.action === 'assign') {
      if (!a.clientId) return { success: false, error: 'Missing clientId for assign' }
      const { error } = await admin
        .from('gbp_locations')
        .update({
          client_id: a.clientId,
          status: 'assigned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', a.locationId)
      if (error) return { success: false, error: error.message }
    } else {
      const { error } = await admin
        .from('gbp_locations')
        .update({
          client_id: null,
          status: 'skipped',
          updated_at: new Date().toISOString(),
        })
        .eq('id', a.locationId)
      if (error) return { success: false, error: error.message }
    }
  }
  return { success: true }
}

// ---------------------------------------------------------------------------
// Ingest -- does the actual upsert. Idempotent: re-running the same
// export just overwrites the same (client, date) rows.
// ---------------------------------------------------------------------------

export async function runBackfill(args: {
  rows: LookerGbpRow[]
  filename?: string
  source?: 'looker_csv' | 'manual_upload' | 'gmb_aggregate'
}): Promise<{ success: true; data: {
  imported: number
  skipped: number
  unmatched: number
  jobId: string
} } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (args.rows.length === 0) return { success: false, error: 'No rows to import' }

  const admin = getAdminSupabase()
  const source = args.source ?? 'looker_csv'

  // Resolve every row's location via store_code -> gbp_locations
  const storeCodes = [...new Set(args.rows.map(resolveStoreCode))]
  const { data: locs, error: locErr } = await admin
    .from('gbp_locations')
    .select('id, store_code, client_id, status')
    .in('store_code', storeCodes)
  if (locErr) return { success: false, error: locErr.message }

  const locByCode = new Map<string, { id: string; client_id: string | null; status: string }>(
    (locs ?? []).map(l => [l.store_code as string, {
      id: l.id as string,
      client_id: (l.client_id as string | null) ?? null,
      status: l.status as string,
    }])
  )

  // Partition rows
  let imported = 0
  let skipped = 0
  let unmatched = 0
  const upsertRows: Array<Record<string, unknown>> = []
  const touchedClients = new Set<string>()

  for (const r of args.rows) {
    const code = resolveStoreCode(r)
    const loc = locByCode.get(code)
    if (!loc) { unmatched++; continue }
    if (loc.status === 'skipped') { skipped++; continue }
    if (loc.status !== 'assigned' || !loc.client_id) { unmatched++; continue }

    const total = r.impressions_total ?? (
      (r.impressions_search_mobile ?? 0) +
      (r.impressions_search_desktop ?? 0) +
      (r.impressions_maps_mobile ?? 0) +
      (r.impressions_maps_desktop ?? 0)
    )
    upsertRows.push({
      // gbp_metrics_sync_client_id() trigger sets client_id from the location
      gbp_location_id: loc.id,
      // Legacy text location_id kept populated for backwards-compat queries
      location_id: code,
      location_name: r.location_name,
      date: r.date,
      directions: r.directions ?? 0,
      calls: r.calls ?? 0,
      website_clicks: r.website_clicks ?? 0,
      search_views: total,
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
      food_orders: r.food_orders ?? 0,
      food_menu_clicks: r.food_menu_clicks ?? 0,
      top_queries: r.top_queries ?? null,
      source,
    })
    touchedClients.add(loc.client_id)
  }

  // Bulk upsert keyed by (gbp_location_id, date) -- one row per location-day
  for (let i = 0; i < upsertRows.length; i += 500) {
    const chunk = upsertRows.slice(i, i + 500)
    const { error } = await admin
      .from('gbp_metrics')
      .upsert(chunk, { onConflict: 'gbp_location_id,date' })
    if (error) {
      return { success: false, error: `Import failed at row ${i}: ${error.message}` }
    }
    imported += chunk.length
  }

  // Refresh last_sync_at on a per-client gbp_connections row so existing
  // "last synced X" UIs keep working without immediately rewriting them.
  for (const clientId of touchedClients) {
    await admin.from('gbp_connections').upsert({
      client_id: clientId,
      location_id: 'agency_csv_import',
      location_name: 'CSV Import (agency)',
      connection_type: 'csv_import',
      last_sync_at: new Date().toISOString(),
      sync_status: 'active',
    }, { onConflict: 'client_id,location_id' })
    revalidatePath(`/admin/clients/${clientId}`)
  }

  const allDates = args.rows.map(r => r.date).sort()
  const { data: job } = await admin.from('gbp_backfill_jobs').insert({
    uploaded_by: auth.userId,
    source,
    filename: args.filename ?? null,
    row_count: args.rows.length,
    matched_rows: imported,
    unmatched_rows: unmatched,
    unmatched_locations: [],
    date_range_start: allDates[0],
    date_range_end: allDates[allDates.length - 1],
    client_ids: [...touchedClients],
  }).select('id').maybeSingle()

  revalidatePath('/admin/gbp/backfill')
  return {
    success: true,
    data: {
      imported,
      skipped,
      unmatched,
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
  food_orders: number
  food_menu_clicks: number
}

export interface PeriodTotals {
  impressions: number
  impressionsSearch: number
  impressionsMaps: number
  actions: number
  calls: number
  directions: number
  website: number
  photoViews: number
  postViews: number
  foodOrders: number
  foodMenuClicks: number
}

export interface AnomalyCallout {
  /** "calls", "impressions", etc. for icon selection */
  metric: 'calls' | 'directions' | 'website' | 'impressions' | 'photo_views'
  /** Headline like "Calls dropped 89% at IJ Sushi Alderwood mall" */
  headline: string
  /** Plain-English explainer */
  body: string
  /** Whether this is a positive or negative movement */
  tone: 'good' | 'bad'
  /** Sortable severity: bigger = more dramatic */
  severity: number
}

export interface LocalSeoSummary {
  daysCovered: number
  lastSyncAt: string | null
  dateFirst: string | null
  dateLast: string | null
  granularity: 'daily' | 'monthly'
  lastSource: string | null
  totals30d: PeriodTotals
  totalsPrev30d: PeriodTotals
  currentPeriodLabel: string
  priorPeriodLabel: string
  topQueries: Array<{ query: string; impressions: number }>
  /** Aggregated -- one entry per distinct date (sums all locations) */
  daily: LocalSeoDailyRow[]
  /** Auto-detected callouts: biggest movers, worth admin attention */
  anomalies: AnomalyCallout[]
}

function isMonthEnd(iso: string): boolean {
  // Parse as UTC to avoid timezone bouncing
  const d = new Date(iso + 'T00:00:00Z')
  if (isNaN(d.getTime())) return false
  const next = new Date(d)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.getUTCDate() === 1
}

function monthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
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

  // Defensive select: food_orders/food_menu_clicks were added in 070 but
  // are optional. Try with them; if the column doesn't exist (migration
  // not run), fall back to the bare select.
  type MetricRow = {
    date: string
    impressions_total: number | null
    impressions_search_mobile: number | null
    impressions_search_desktop: number | null
    impressions_maps_mobile: number | null
    impressions_maps_desktop: number | null
    website_clicks: number | null
    calls: number | null
    directions: number | null
    photo_views: number | null
    post_views: number | null
    food_orders?: number | null
    food_menu_clicks?: number | null
    top_queries: unknown
    source: string | null
  }
  let rows: MetricRow[] | null = null
  let error: { message: string } | null = null
  const tryFood = await admin
    .from('gbp_metrics')
    .select('date, impressions_total, impressions_search_mobile, impressions_search_desktop, impressions_maps_mobile, impressions_maps_desktop, website_clicks, calls, directions, photo_views, post_views, food_orders, food_menu_clicks, top_queries, source')
    .eq('client_id', clientId)
    .gte('date', cutoffIso)
    .order('date', { ascending: true })
  if (tryFood.error) {
    const fallback = await admin
      .from('gbp_metrics')
      .select('date, impressions_total, impressions_search_mobile, impressions_search_desktop, impressions_maps_mobile, impressions_maps_desktop, website_clicks, calls, directions, photo_views, post_views, top_queries, source')
      .eq('client_id', clientId)
      .gte('date', cutoffIso)
      .order('date', { ascending: true })
    rows = (fallback.data ?? []) as unknown as MetricRow[]
    if (fallback.error) error = { message: fallback.error.message }
  } else {
    rows = (tryFood.data ?? []) as unknown as MetricRow[]
  }

  if (error) return { success: false, error: error.message }

  // Aggregate by date -- multiple locations on the same day collapse to a
  // single chartable point. Without this, a 7-location client gets 7 spikes
  // per day and the trend chart is unreadable.
  const byDate = new Map<string, LocalSeoDailyRow>()
  for (const r of rows ?? []) {
    const date = r.date as string
    const existing = byDate.get(date) ?? {
      date,
      impressions_total: 0, impressions_search: 0, impressions_maps: 0,
      website_clicks: 0, calls: 0, directions: 0, photo_views: 0, post_views: 0,
      food_orders: 0, food_menu_clicks: 0,
    }
    existing.impressions_total += (r.impressions_total as number) ?? 0
    existing.impressions_search += ((r.impressions_search_mobile as number) ?? 0) + ((r.impressions_search_desktop as number) ?? 0)
    existing.impressions_maps += ((r.impressions_maps_mobile as number) ?? 0) + ((r.impressions_maps_desktop as number) ?? 0)
    existing.website_clicks += (r.website_clicks as number) ?? 0
    existing.calls += (r.calls as number) ?? 0
    existing.directions += (r.directions as number) ?? 0
    existing.photo_views += (r.photo_views as number) ?? 0
    existing.post_views += (r.post_views as number) ?? 0
    existing.food_orders += (r.food_orders as number) ?? 0
    existing.food_menu_clicks += (r.food_menu_clicks as number) ?? 0
    byDate.set(date, existing)
  }
  const daily: LocalSeoDailyRow[] = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))

  // Granularity detection: if every distinct date in the window is a
  // month-end date, it's a monthly aggregate (GMB Insights). Otherwise
  // assume daily (Looker / API).
  const granularity: 'daily' | 'monthly' = daily.length > 0 && daily.every(d => isMonthEnd(d.date))
    ? 'monthly'
    : 'daily'

  // Window totals: depends on granularity.
  // - daily: rolling last 30d vs prior 30d
  // - monthly: most recent month-end vs the one before
  const today = new Date()
  const emptyTotals: PeriodTotals = {
    impressions: 0, impressionsSearch: 0, impressionsMaps: 0,
    actions: 0, calls: 0, directions: 0, website: 0,
    photoViews: 0, postViews: 0, foodOrders: 0, foodMenuClicks: 0,
  }
  let totals30d: PeriodTotals = { ...emptyTotals }
  let totalsPrev30d: PeriodTotals = { ...emptyTotals }
  let currentPeriodLabel = 'Last 30d'
  let priorPeriodLabel = 'Prior 30d'

  if (granularity === 'monthly' && daily.length > 0) {
    const fromRow = (r: LocalSeoDailyRow | undefined): PeriodTotals => r ? {
      impressions: r.impressions_total,
      impressionsSearch: r.impressions_search,
      impressionsMaps: r.impressions_maps,
      actions: r.calls + r.directions + r.website_clicks,
      calls: r.calls, directions: r.directions, website: r.website_clicks,
      photoViews: r.photo_views, postViews: r.post_views,
      foodOrders: r.food_orders, foodMenuClicks: r.food_menu_clicks,
    } : { ...emptyTotals }
    const last = daily[daily.length - 1]
    const prev = daily[daily.length - 2]
    totals30d = fromRow(last)
    totalsPrev30d = fromRow(prev)
    currentPeriodLabel = monthLabel(last.date)
    priorPeriodLabel = prev ? monthLabel(prev.date) : 'No prior month'
  } else {
    const d30 = new Date(today); d30.setDate(d30.getDate() - 30)
    const d60 = new Date(today); d60.setDate(d60.getDate() - 60)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const sumWindow = (fromIso: string, toIso: string): PeriodTotals => {
      const win = daily.filter(r => r.date >= fromIso && r.date < toIso)
      const sum = (k: keyof LocalSeoDailyRow) => win.reduce((a, r) => a + (r[k] as number), 0)
      const calls = sum('calls'), dirs = sum('directions'), web = sum('website_clicks')
      return {
        impressions: sum('impressions_total'),
        impressionsSearch: sum('impressions_search'),
        impressionsMaps: sum('impressions_maps'),
        actions: calls + dirs + web,
        calls, directions: dirs, website: web,
        photoViews: sum('photo_views'),
        postViews: sum('post_views'),
        foodOrders: sum('food_orders'),
        foodMenuClicks: sum('food_menu_clicks'),
      }
    }
    totals30d = sumWindow(iso(d30), iso(new Date(today.getTime() + 86400000)))
    totalsPrev30d = sumWindow(iso(d60), iso(d30))
  }

  // Last source -- look at the most recent row to know if data came from
  // CSV upload vs API. Drives the banner copy.
  const sortedBySource = (rows ?? []).slice().sort((a, b) =>
    (b.date as string).localeCompare(a.date as string)
  )
  const lastSource = (sortedBySource[0]?.source as string | null) ?? null

  // Anomaly detection -- find the per-location metrics with the biggest
  // (signed) percent change from prior period. Surface the top 3 most
  // dramatic, mixing positive and negative so admins see both wins and
  // problems rather than only doom-and-gloom.
  const anomalies: AnomalyCallout[] = []
  if (granularity === 'monthly' && daily.length >= 2) {
    // Need per-location detail to call out specific stores. Re-query.
    const lastDate = daily[daily.length - 1].date
    const prevDate = daily[daily.length - 2].date
    const { data: locMetrics } = await admin
      .from('gbp_metrics')
      .select('gbp_location_id, date, impressions_total, calls, directions, website_clicks, photo_views')
      .eq('client_id', clientId)
      .in('date', [lastDate, prevDate])
    const { data: locInfo } = await admin
      .from('gbp_locations')
      .select('id, location_name')
      .eq('client_id', clientId)
    const nameById = new Map<string, string>(
      (locInfo ?? []).map(l => [l.id as string, l.location_name as string])
    )

    type Pair = { curr: number; prev: number }
    const perLoc = new Map<string, {
      impressions: Pair; calls: Pair; directions: Pair; website: Pair; photoViews: Pair
    }>()
    for (const m of locMetrics ?? []) {
      const id = m.gbp_location_id as string | null
      if (!id) continue
      const isCurrent = (m.date as string) === lastDate
      const bucket = perLoc.get(id) ?? {
        impressions: { curr: 0, prev: 0 }, calls: { curr: 0, prev: 0 },
        directions: { curr: 0, prev: 0 }, website: { curr: 0, prev: 0 },
        photoViews: { curr: 0, prev: 0 },
      }
      const k = isCurrent ? 'curr' : 'prev'
      bucket.impressions[k] += (m.impressions_total as number) ?? 0
      bucket.calls[k]       += (m.calls as number) ?? 0
      bucket.directions[k]  += (m.directions as number) ?? 0
      bucket.website[k]     += (m.website_clicks as number) ?? 0
      bucket.photoViews[k]  += (m.photo_views as number) ?? 0
      perLoc.set(id, bucket)
    }

    // Score every (location, metric) combo by absolute percent change,
    // weighted by absolute volume so a 100% jump on 1 call doesn't
    // outrank a 30% jump on 100 calls. severity = |pct| * sqrt(maxVolume).
    const candidates: Array<AnomalyCallout & { _key: string }> = []
    const metricLabels: Record<string, { name: string; unit: string }> = {
      impressions: { name: 'Impressions', unit: 'impressions' },
      calls: { name: 'Calls', unit: 'calls' },
      directions: { name: 'Directions', unit: 'directions' },
      website: { name: 'Website clicks', unit: 'website clicks' },
      photoViews: { name: 'Photo views', unit: 'photo views' },
    }
    const metricKey: Record<string, AnomalyCallout['metric']> = {
      impressions: 'impressions', calls: 'calls', directions: 'directions',
      website: 'website', photoViews: 'photo_views',
    }
    for (const [id, b] of perLoc) {
      const name = nameById.get(id) ?? 'Unknown location'
      for (const key of ['impressions', 'calls', 'directions', 'website', 'photoViews'] as const) {
        const { curr, prev } = b[key]
        if (prev === 0 && curr === 0) continue
        // Skip tiny absolute volumes: don't call out 1 -> 0
        if (Math.max(curr, prev) < 5) continue
        const pct = prev === 0 ? 100 : ((curr - prev) / prev) * 100
        if (Math.abs(pct) < 25) continue   // ignore movements under 25%
        const tone: 'good' | 'bad' = pct >= 0 ? 'good' : 'bad'
        const severity = Math.abs(pct) * Math.sqrt(Math.max(curr, prev))
        const verb = tone === 'good' ? 'jumped' : 'dropped'
        candidates.push({
          _key: `${id}:${key}`,
          metric: metricKey[key],
          headline: `${metricLabels[key].name} ${verb} ${Math.abs(pct).toFixed(0)}% at ${name}`,
          body: `${prev.toLocaleString()} ${metricLabels[key].unit} in ${priorPeriodLabel} → ${curr.toLocaleString()} in ${currentPeriodLabel}.`,
          tone,
          severity,
        })
      }
    }
    // Top 3 by severity, but try to mix at least one positive if available
    candidates.sort((a, b) => b.severity - a.severity)
    const picked: AnomalyCallout[] = []
    let goodIncluded = false
    for (const c of candidates) {
      if (picked.length >= 3) break
      if (c.tone === 'good') goodIncluded = true
      picked.push({ metric: c.metric, headline: c.headline, body: c.body, tone: c.tone, severity: c.severity })
    }
    if (!goodIncluded && candidates.some(c => c.tone === 'good')) {
      const goodOne = candidates.find(c => c.tone === 'good')!
      if (picked.length >= 3) picked[2] = { metric: goodOne.metric, headline: goodOne.headline, body: goodOne.body, tone: goodOne.tone, severity: goodOne.severity }
      else picked.push({ metric: goodOne.metric, headline: goodOne.headline, body: goodOne.body, tone: goodOne.tone, severity: goodOne.severity })
    }
    anomalies.push(...picked)
  }

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
      granularity,
      lastSource,
      totals30d,
      totalsPrev30d,
      currentPeriodLabel,
      priorPeriodLabel,
      topQueries,
      daily,
      anomalies,
    },
  }
}

// ---------------------------------------------------------------------------
// Per-location breakdown -- powers the "By location" view in the Local SEO
// tab so a multi-location client (IJ Sushi has 7, Vinason 5) can see which
// of their locations is under/over-performing rather than just the aggregate.
// ---------------------------------------------------------------------------

export interface LocalSeoLocationRow {
  locationId: string
  locationName: string
  storeCode: string
  address: string | null
  // Current-period totals
  impressions: number
  calls: number
  directions: number
  websiteClicks: number
  // Prior-period for delta
  impressionsPrev: number
  callsPrev: number
  directionsPrev: number
  websiteClicksPrev: number
  daysWithData: number
  /** Monthly impressions for inline sparkline (oldest -> newest) */
  trend: number[]
}

export async function getLocalSeoLocations(
  clientId: string,
): Promise<{ success: true; data: LocalSeoLocationRow[] } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()

  // 1. All locations for this client (status='assigned')
  const { data: locs, error: locErr } = await admin
    .from('gbp_locations')
    .select('id, store_code, location_name, address')
    .eq('client_id', clientId)
    .eq('status', 'assigned')
  if (locErr) return { success: false, error: locErr.message }
  if (!locs || locs.length === 0) return { success: true, data: [] }

  // 2. 60d of metrics for those locations
  const today = new Date()
  const d60 = new Date(today); d60.setDate(d60.getDate() - 60)
  const cutoffIso = d60.toISOString().slice(0, 10)
  const d30 = new Date(today); d30.setDate(d30.getDate() - 30)
  const d30Iso = d30.toISOString().slice(0, 10)

  // Pull a full year of impressions for the inline sparkline trend.
  const yearAgo = new Date(today); yearAgo.setDate(yearAgo.getDate() - 365)
  const yearAgoIso = yearAgo.toISOString().slice(0, 10)
  const { data: metrics, error: metricsErr } = await admin
    .from('gbp_metrics')
    .select('gbp_location_id, date, impressions_total, calls, directions, website_clicks')
    .in('gbp_location_id', locs.map(l => l.id))
    .gte('date', yearAgoIso < cutoffIso ? yearAgoIso : cutoffIso)
    .order('date', { ascending: true })
  if (metricsErr) return { success: false, error: metricsErr.message }

  // 3. Roll up per-location, splitting current-30d vs prior-30d.
  // Also keep a date->impressions map per location for the sparkline.
  const byLocation = new Map<string, {
    imp: number; calls: number; dirs: number; web: number
    impPrev: number; callsPrev: number; dirsPrev: number; webPrev: number
    days: Set<string>
    trend: Map<string, number>   // date -> impressions
  }>()
  for (const l of locs) {
    byLocation.set(l.id as string, {
      imp: 0, calls: 0, dirs: 0, web: 0,
      impPrev: 0, callsPrev: 0, dirsPrev: 0, webPrev: 0,
      days: new Set(),
      trend: new Map(),
    })
  }
  for (const m of metrics ?? []) {
    const id = m.gbp_location_id as string
    const bucket = byLocation.get(id)
    if (!bucket) continue
    const date = m.date as string
    const imp = (m.impressions_total as number) ?? 0
    bucket.trend.set(date, (bucket.trend.get(date) ?? 0) + imp)
    // Only count rolling-30d window for the period totals
    if (date >= cutoffIso) {
      const calls = (m.calls as number) ?? 0
      const dirs = (m.directions as number) ?? 0
      const web = (m.website_clicks as number) ?? 0
      const isCurrent = date >= d30Iso
      if (isCurrent) {
        bucket.imp += imp; bucket.calls += calls; bucket.dirs += dirs; bucket.web += web
      } else {
        bucket.impPrev += imp; bucket.callsPrev += calls; bucket.dirsPrev += dirs; bucket.webPrev += web
      }
      bucket.days.add(date)
    }
  }

  const rows: LocalSeoLocationRow[] = locs.map(l => {
    const b = byLocation.get(l.id as string)!
    const trend = [...b.trend.entries()]
      .sort(([a], [c]) => a.localeCompare(c))
      .map(([, v]) => v)
    return {
      locationId: l.id as string,
      locationName: l.location_name as string,
      storeCode: l.store_code as string,
      address: (l.address as string | null) ?? null,
      impressions: b.imp,
      calls: b.calls,
      directions: b.dirs,
      websiteClicks: b.web,
      impressionsPrev: b.impPrev,
      callsPrev: b.callsPrev,
      directionsPrev: b.dirsPrev,
      websiteClicksPrev: b.webPrev,
      daysWithData: b.days.size,
      trend,
    }
  })

  // Sort by current-period impressions, descending -- biggest movers up top
  rows.sort((a, b) => b.impressions - a.impressions)
  return { success: true, data: rows }
}
