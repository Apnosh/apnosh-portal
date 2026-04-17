// @ts-nocheck — Deno runtime
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * sync-yelp-metrics Edge Function
 *
 * For every active client with a Yelp connection (channel_connections where
 * channel = 'yelp'), fetches the business details from Yelp Fusion API and
 * upserts a daily row into review_metrics.
 *
 * Yelp Fusion Base access tier gives us:
 *   - business rating
 *   - review count
 *   - name, alias, url, categories, is_closed, is_claimed
 *   - photos (up to 3)
 *
 * It does NOT include individual review text (requires paid partnership).
 * We track "new reviews" by delta of review_count vs the prior day.
 *
 * Input:  { client_id?: string }  // if omitted, syncs all active yelp conns
 * Output: { synced: number, results: [...] }
 */

const YELP_API_KEY = Deno.env.get('YELP_API_KEY')

interface YelpConnection {
  id: string
  client_id: string
  platform_account_id: string  // Yelp business alias (e.g. "starbucks-seattle-88")
  platform_account_name: string | null
}

Deno.serve(async (req) => {
  if (!YELP_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'YELP_API_KEY is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const targetClientId: string | undefined = body.client_id

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let query = supabase
      .from('channel_connections')
      .select('id, client_id, platform_account_id, platform_account_name')
      .eq('channel', 'yelp')
      .eq('status', 'active')
    if (targetClientId) query = query.eq('client_id', targetClientId)

    const { data: conns, error: connErr } = await query
    if (connErr) {
      return new Response(JSON.stringify({ error: connErr.message }), { status: 500 })
    }

    const results = []
    let synced = 0
    const today = new Date().toISOString().split('T')[0]

    for (const conn of (conns ?? []) as YelpConnection[]) {
      try {
        const details = await fetchBusinessDetails(conn.platform_account_id)

        // Compute new_reviews by comparing against yesterday's snapshot
        const { data: prior } = await supabase
          .from('review_metrics')
          .select('review_count')
          .eq('client_id', conn.client_id)
          .eq('platform', 'yelp')
          .lt('date', today)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()

        const priorCount = prior?.review_count ?? details.review_count
        const newReviews = Math.max(0, details.review_count - priorCount)

        const { error: upsertErr } = await supabase
          .from('review_metrics')
          .upsert({
            client_id: conn.client_id,
            platform: 'yelp',
            date: today,
            rating_avg: details.rating,
            review_count: details.review_count,
            new_reviews: newReviews,
            response_rate: null,  // Not exposed on base tier
            raw_data: details.raw,
          }, { onConflict: 'client_id,platform,date' })

        if (upsertErr) throw new Error(upsertErr.message)

        // Also refresh the cached platform_account_name + rating in channel_connections
        await supabase
          .from('channel_connections')
          .update({
            platform_account_name: details.name ?? conn.platform_account_name,
            last_sync_at: new Date().toISOString(),
            sync_error: null,
            metadata: {
              rating: details.rating,
              review_count: details.review_count,
              is_closed: details.is_closed,
              is_claimed: details.is_claimed,
              url: details.url,
              categories: details.categories,
            },
          })
          .eq('id', conn.id)

        synced++
        results.push({
          client_id: conn.client_id,
          status: 'ok',
          rating: details.rating,
          review_count: details.review_count,
          new_reviews: newReviews,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown'
        await supabase
          .from('channel_connections')
          .update({ sync_error: msg, status: 'error' })
          .eq('id', conn.id)
        results.push({ client_id: conn.client_id, status: 'error', error: msg })
      }
    }

    return new Response(JSON.stringify({ synced, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})

// ---------------------------------------------------------------------------
// Yelp Fusion API helpers
// ---------------------------------------------------------------------------

interface YelpBusinessDetails {
  id: string
  alias: string
  name: string
  rating: number
  review_count: number
  is_closed: boolean
  is_claimed: boolean
  url: string
  categories: string[]
  raw: unknown
}

async function fetchBusinessDetails(alias: string): Promise<YelpBusinessDetails> {
  const res = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(alias)}`, {
    headers: { Authorization: `Bearer ${YELP_API_KEY}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.description || `Yelp API ${res.status}`)
  }
  return {
    id: data.id,
    alias: data.alias,
    name: data.name,
    rating: Number(data.rating ?? 0),
    review_count: Number(data.review_count ?? 0),
    is_closed: Boolean(data.is_closed),
    is_claimed: Boolean(data.is_claimed),
    url: data.url,
    categories: (data.categories ?? []).map((c: { title: string }) => c.title),
    raw: data,
  }
}
