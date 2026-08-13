import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * PAGINATED TIME-SERIES READ. The one copy.
 *
 * PostgREST caps a single `.select()` at 1000 rows and returns the cap SILENTLY — no error, no
 * flag, just fewer rows. Every time-series read here orders by date ASCENDING, so the rows
 * dropped are the most RECENT ones: the dashboard shows a cliff and calls it data.
 *
 * One location rarely reaches the cap. Two do. The comment this was extracted from names the
 * case that bit us: "Do Si = 2 locations x ~530 days = 1060 rows ... the home dashboard then
 * looks like it has 'no data after mid-May'". Prod has two multi-location clients today
 * (verified 2026-08-13), and 800-day windows are already over the cap for them.
 *
 * The guard existed in three files and was absent from six others that read the same tables.
 * Three copies is how the sixth file never got one, so there is now exactly one.
 *
 * NOTE the ordering contract: ascending, because callers fold day-by-day series. If you need
 * newest-first, do NOT reach for `.limit(n)` on a multi-location table — n rows is not n days.
 * Take the full window and slice, or group by date first.
 */
export async function fetchAllRows(
  admin: SupabaseClient,
  opts: {
    table: string
    cols: string
    /** omit for a cross-client read (the admin status sweep); every other caller passes one */
    clientId?: string
    /** the date-ish column to bound and order by */
    dateCol: string
    /** inclusive lower bound */
    gte: string
    /** optional inclusive upper bound */
    lte?: string
    /** optional extra equality filter, e.g. { platform: 'instagram' } */
    eq?: Record<string, string>
    /** newest-first. Only for reads that genuinely want recency (the admin freshness sweep);
     *  a day-by-day fold must stay ascending. */
    descending?: boolean
    /** hard stop so a runaway table cannot spin forever (default 50 pages = 50k rows) */
    maxPages?: number
  },
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000
  const maxPages = opts.maxPages ?? 50
  const out: Record<string, unknown>[] = []

  for (let page = 0; page < maxPages; page++) {
    const from = page * PAGE
    let q = admin.from(opts.table).select(opts.cols).gte(opts.dateCol, opts.gte)
    if (opts.clientId) q = q.eq('client_id', opts.clientId)
    if (opts.lte) q = q.lte(opts.dateCol, opts.lte)
    for (const [k, v] of Object.entries(opts.eq ?? {})) q = q.eq(k, v)

    const res = await q
      .order(opts.dateCol, { ascending: opts.descending ? false : true })
      .range(from, from + PAGE - 1)
    /* A failed page must not masquerade as "end of data" — that is the silent-truncation bug
     * wearing a different hat. Stop and surface what we have; the caller's own error handling
     * decides what to show, but it will not be a confident partial series. */
    if (res.error) break
    const batch = (res.data ?? []) as unknown as Record<string, unknown>[]
    out.push(...batch)
    if (batch.length < PAGE) return out
  }
  return out
}
