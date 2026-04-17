// @ts-nocheck — Deno runtime
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * sync-site-health Edge Function
 *
 * For every active client with a `website` URL, snapshots:
 *   - Uptime status (single HTTP check for now; designed so we can swap in
 *     UptimeRobot's API later without changing the caller)
 *   - PageSpeed score for mobile + desktop (Google PageSpeed Insights API)
 *   - SSL validity (TLS handshake via fetch; full cert expiration check
 *     would require a dedicated lib, deferred for later)
 *   - Last-Modified header if present (content freshness hint)
 *
 * Upserts a single row per client into website_health.
 *
 * Input:  { client_id?: string }  // if omitted, syncs all active clients
 * Output: { synced: number, results: [...] }
 */

const PSI_API_KEY = Deno.env.get('PAGESPEED_API_KEY') // optional

interface Client {
  id: string
  name: string
  website: string | null
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const targetClientId: string | undefined = body.client_id

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let query = supabase
      .from('clients')
      .select('id, name, website')
      .not('website', 'is', null)
      .eq('status', 'active')
    if (targetClientId) query = query.eq('id', targetClientId)

    const { data: clients, error: clientErr } = await query
    if (clientErr) {
      return new Response(JSON.stringify({ error: clientErr.message }), { status: 500 })
    }

    const results = []
    let synced = 0

    for (const client of (clients ?? []) as Client[]) {
      if (!client.website) {
        results.push({ client_id: client.id, status: 'skipped', reason: 'no website url' })
        continue
      }

      try {
        const normalizedUrl = normalizeUrl(client.website)

        // Run checks in parallel so the whole job is fast even for many clients
        const [uptime, mobilePS, desktopPS] = await Promise.allSettled([
          checkUptime(normalizedUrl),
          getPageSpeedScore(normalizedUrl, 'mobile'),
          getPageSpeedScore(normalizedUrl, 'desktop'),
        ])

        const up = uptime.status === 'fulfilled' ? uptime.value : { status: 'down', lastModified: null, sslValid: false }
        const mobileScore = mobilePS.status === 'fulfilled' ? mobilePS.value : null
        const desktopScore = desktopPS.status === 'fulfilled' ? desktopPS.value : null

        const { error: upsertErr } = await supabase
          .from('website_health')
          .upsert({
            client_id: client.id,
            uptime_status: up.status,
            // uptime_pct_30d intentionally left null until we integrate with
            // UptimeRobot or similar. A single daily check can't produce a
            // meaningful 30-day percentage.
            pagespeed_mobile: mobileScore,
            pagespeed_desktop: desktopScore,
            ssl_valid: up.sslValid,
            // ssl_expires_at deferred -- needs TLS-level cert inspection
            last_content_update_at: up.lastModified,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'client_id' })

        if (upsertErr) throw new Error(upsertErr.message)

        synced++
        results.push({
          client_id: client.id,
          status: 'ok',
          uptime: up.status,
          mobile_score: mobileScore,
          desktop_score: desktopScore,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown'
        results.push({ client_id: client.id, status: 'error', error: msg })
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
// Uptime + SSL check (single HTTP request)
// ---------------------------------------------------------------------------

interface UptimeResult {
  status: 'up' | 'down' | 'degraded' | 'unknown'
  sslValid: boolean
  lastModified: string | null
}

/**
 * Makes a single HTTP HEAD request to the site and interprets the result.
 *
 * When we later move to a dedicated monitoring service (UptimeRobot /
 * BetterStack), this function is the only thing that changes. The rest of the
 * Edge Function treats uptime as a black-box check.
 */
async function checkUptime(url: string): Promise<UptimeResult> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
      headers: {
        // Some hosts block default fetch user agents; use a real-looking one.
        'User-Agent': 'Mozilla/5.0 (compatible; Apnosh-SiteHealth/1.0)',
      },
    })

    let status: UptimeResult['status']
    if (res.status >= 200 && res.status < 400) status = 'up'
    else if (res.status >= 400 && res.status < 500) status = 'degraded'
    else status = 'down'

    // If fetch returned via HTTPS without a TLS error, the cert is valid enough
    const sslValid = url.startsWith('https://')
    const lastModified = res.headers.get('last-modified')

    return {
      status,
      sslValid,
      lastModified: lastModified ? new Date(lastModified).toISOString() : null,
    }
  } catch (err) {
    // A fetch error means either the host is unreachable or the TLS handshake
    // failed. Treat any fetch error as "down" and SSL as invalid.
    const msg = err instanceof Error ? err.message : String(err)
    const sslError = /ssl|tls|certificate|cert/i.test(msg)
    return {
      status: 'down',
      sslValid: url.startsWith('https://') ? !sslError && false : false,
      lastModified: null,
    }
  }
}

// ---------------------------------------------------------------------------
// PageSpeed Insights
// ---------------------------------------------------------------------------

async function getPageSpeedScore(url: string, strategy: 'mobile' | 'desktop'): Promise<number | null> {
  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance',
  })
  if (PSI_API_KEY) params.set('key', PSI_API_KEY)

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[psi ${strategy}] ${res.status}: ${text.slice(0, 200)}`)
      return null
    }
    const data = await res.json()
    const score = data?.lighthouseResult?.categories?.performance?.score
    if (typeof score !== 'number') return null
    return Math.round(score * 100)
  } catch (err) {
    console.error(`[psi ${strategy}] fetch failed:`, err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeUrl(raw: string): string {
  let url = raw.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url.replace(/\/$/, '')
}
