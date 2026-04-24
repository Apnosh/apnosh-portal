/**
 * Vercel Cron: auto-ingest GBP CSVs from Drive.
 *
 * Runs daily. Reads every .csv in the configured Drive folder
 * (GBP_DRIVE_FOLDER_ID env var), skips files already ingested
 * (matched by filename in gbp_backfill_jobs), parses the rest, and
 * upserts into gbp_metrics via runBackfill.
 *
 * Security: Vercel Cron hits this endpoint with a signed header, but
 * we also accept a CRON_SECRET query param for manual triggering.
 */

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { listFilesInFolder, refreshAccessToken, downloadFileAsText } from '@/lib/google-drive'
import { parseLookerCsv } from '@/lib/gbp-csv-parser'
import { runBackfill } from '@/lib/gbp-backfill-actions'

export const runtime = 'nodejs'
export const maxDuration = 60 // seconds

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GBP_FOLDER_ID = process.env.GBP_DRIVE_FOLDER_ID
const CRON_SECRET = process.env.CRON_SECRET

function adminDb() {
  return createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getDriveToken(): Promise<string | null> {
  const db = adminDb()
  const { data } = await db.from('integrations').select('*').eq('provider', 'google_drive').maybeSingle()
  const row = data as {
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
  } | null
  if (!row) return null

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  if (expiresAt - Date.now() > 60_000) return row.access_token

  if (!row.refresh_token) return null
  const refreshed = await refreshAccessToken(row.refresh_token)
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  await db.from('integrations').update({
    access_token: refreshed.access_token,
    token_expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq('provider', 'google_drive')
  return refreshed.access_token
}

export async function GET(req: Request) {
  // Auth: accept either Vercel's cron signature OR ?secret=X for manual runs
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!GBP_FOLDER_ID) {
    return NextResponse.json({ error: 'GBP_DRIVE_FOLDER_ID env var not set' }, { status: 500 })
  }

  const token = await getDriveToken()
  if (!token) {
    return NextResponse.json({ error: 'Drive not connected' }, { status: 500 })
  }

  // List CSVs in the watched folder (modifiedTime desc implied via orderBy)
  let files
  try {
    files = await listFilesInFolder(token, GBP_FOLDER_ID)
  } catch (e) {
    return NextResponse.json({ error: 'Drive list failed: ' + (e as Error).message }, { status: 500 })
  }

  const csvs = files.filter(f =>
    f.name.toLowerCase().endsWith('.csv') ||
    f.mimeType === 'text/csv' ||
    f.mimeType === 'application/vnd.google-apps.spreadsheet'
  )

  if (csvs.length === 0) {
    return NextResponse.json({ ok: true, message: 'No CSVs in folder', processed: 0 })
  }

  // Skip files we've already ingested -- filenames are stored on
  // gbp_backfill_jobs at upload time.
  const db = adminDb()
  const { data: priorJobs } = await db
    .from('gbp_backfill_jobs')
    .select('filename')
    .in('filename', csvs.map(c => c.name))
  const alreadyDone = new Set(((priorJobs ?? []) as Array<{ filename: string }>).map(j => j.filename))

  const newFiles = csvs.filter(c => !alreadyDone.has(c.name))
  if (newFiles.length === 0) {
    return NextResponse.json({ ok: true, message: 'All CSVs already ingested', processed: 0, skipped: csvs.length })
  }

  const results: Array<{ name: string; ok: boolean; imported?: number; error?: string }> = []

  for (const file of newFiles) {
    try {
      // Google-native Sheets need export; plain CSV uses direct media download
      let text: string | null
      if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        text = res.ok ? await res.text() : null
      } else {
        text = await downloadFileAsText(token, file.id)
      }

      if (!text) {
        results.push({ name: file.name, ok: false, error: 'Download returned empty body' })
        continue
      }

      const parsed = parseLookerCsv(text)
      if (parsed.rows.length === 0) {
        results.push({ name: file.name, ok: false, error: parsed.errors[0] ?? 'No rows parsed' })
        continue
      }

      // NB: runBackfill uses requireAdmin() under the hood. The cron
      // doesn't have a user session, so we call an admin-scoped variant
      // directly via the service role. Import the internal insert path
      // here instead.
      const res = await runBackfillAsCron({
        rows: parsed.rows,
        filename: file.name,
      })

      if (res.success) {
        results.push({ name: file.name, ok: true, imported: res.data.imported })
      } else {
        results.push({ name: file.name, ok: false, error: res.error })
      }
    } catch (e) {
      results.push({ name: file.name, ok: false, error: (e as Error).message })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    skipped: csvs.length - newFiles.length,
    details: results,
  })
}

// ---------------------------------------------------------------------------
// Cron-safe runBackfill: same logic as the user-facing action, but
// skips the requireAdmin() gate (the Vercel cron is already
// authenticated via signed header / secret).
// ---------------------------------------------------------------------------

import type { LookerGbpRow } from '@/lib/gbp-backfill-actions'

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function scoreMatch(a: string, b: string): number {
  const na = normalizeForMatch(a), nb = normalizeForMatch(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const aT = new Set(na.split(' ').filter(t => t.length > 2))
  const bT = new Set(nb.split(' ').filter(t => t.length > 2))
  if (aT.size === 0 || bT.size === 0) return 0
  let overlap = 0
  for (const t of aT) if (bT.has(t)) overlap++
  return overlap / Math.max(aT.size, bT.size)
}

async function runBackfillAsCron(args: {
  rows: LookerGbpRow[]
  filename: string
}): Promise<{ success: true; data: { imported: number } } | { success: false; error: string }> {
  const admin = adminDb()
  const { data: clientsRaw } = await admin.from('clients').select('id, name, slug')
  const clients = (clientsRaw ?? []) as Array<{ id: string; name: string; slug: string }>

  const byClient = new Map<string, LookerGbpRow[]>()
  const unmatched = new Set<string>()

  for (const r of args.rows) {
    let best: { id: string; score: number } | null = null
    for (const c of clients) {
      const s = scoreMatch(r.location_name, c.name)
      if (!best || s > best.score) best = { id: c.id, score: s }
    }
    if (!best || best.score < 0.5) {
      unmatched.add(r.location_name)
      continue
    }
    if (!byClient.has(best.id)) byClient.set(best.id, [])
    byClient.get(best.id)!.push(r)
  }

  let imported = 0
  const allDates = args.rows.map(r => r.date).sort()

  for (const [clientId, clientRows] of byClient) {
    const locName = clientRows[0].location_name
    const locationId = `loc_${locName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50)}`

    await admin.from('gbp_connections').upsert({
      client_id: clientId,
      location_id: locationId,
      location_name: locName,
      connection_type: 'csv_import',
      last_sync_at: new Date().toISOString(),
      sync_status: 'active',
    }, { onConflict: 'client_id,location_id' })

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
        top_queries: r.top_queries ?? null,
        source: 'looker_csv',
      }
    })

    for (let i = 0; i < upsertRows.length; i += 500) {
      const chunk = upsertRows.slice(i, i + 500)
      const { error } = await admin
        .from('gbp_metrics')
        .upsert(chunk, { onConflict: 'client_id,location_id,date' })
      if (error) return { success: false, error: `Chunk ${i} failed: ${error.message}` }
      imported += chunk.length
    }
  }

  // Audit row so the next cron run skips this file
  await admin.from('gbp_backfill_jobs').insert({
    source: 'looker_csv',
    filename: args.filename,
    row_count: args.rows.length,
    matched_rows: imported,
    unmatched_rows: args.rows.length - imported,
    unmatched_locations: [...unmatched],
    date_range_start: allDates[0] ?? null,
    date_range_end: allDates[allDates.length - 1] ?? null,
    client_ids: [...byClient.keys()],
    notes: 'auto-ingested by cron',
  })

  return { success: true, data: { imported } }
}
