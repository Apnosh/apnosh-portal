'use server'

/**
 * Weekly site audit. Pulls the client's website URL, crawls a
 * shallow page set, and runs four checks:
 *
 *   1. broken_links   — any internal link returning 4xx / 5xx.
 *   2. page_speed     — PageSpeed Insights (when PAGESPEED_API_KEY
 *                       is configured).
 *   3. schema_markup  — JSON-LD presence + Restaurant schema check.
 *   4. stale_content  — pages whose <body> hasn't changed in our
 *                       weekly snapshots in 90+ days (heuristic).
 *
 * Results are upserted into the site_audits table — one row per
 * (client_id, audit_type) gets replaced each run.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const MAX_PAGES_PER_AUDIT = 15
const TIMEOUT_MS = 10_000

export interface AuditFinding {
  url: string
  message: string
  severity?: 'info' | 'warn' | 'fail'
}

export async function runSiteAudit(clientId: string): Promise<{
  ok: boolean
  audits: Array<{ type: string; status: string; summary: string }>
  error?: string
}> {
  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id, website')
    .eq('id', clientId)
    .maybeSingle()
  if (!client?.website) return { ok: false, audits: [], error: 'No website URL on file' }
  const websiteUrl = normalizeUrl(client.website)

  /* Discover URLs to audit. Sitemap first, then fall back to
     crawling the homepage for internal links. */
  const pages = await discoverPages(websiteUrl)
  if (pages.length === 0) return { ok: false, audits: [], error: 'No pages discovered' }

  /* Run all audits in parallel — they're independent. */
  const [brokenLinks, schemaResult] = await Promise.all([
    auditBrokenLinks(websiteUrl, pages),
    auditSchemaMarkup(pages),
  ])

  const audits: Array<{ type: string; status: string; summary: string }> = []

  await upsertAudit(clientId, 'broken_links', brokenLinks.status, brokenLinks.summary, brokenLinks.findings, null)
  audits.push({ type: 'broken_links', status: brokenLinks.status, summary: brokenLinks.summary })

  await upsertAudit(clientId, 'schema_markup', schemaResult.status, schemaResult.summary, schemaResult.findings, null)
  audits.push({ type: 'schema_markup', status: schemaResult.status, summary: schemaResult.summary })

  /* Page speed only when an API key is configured. Done last so a
     missing key doesn't block the other audits. */
  const psiKey = process.env.PAGESPEED_API_KEY
  if (psiKey) {
    const ps = await auditPageSpeed(pages.slice(0, 5), psiKey)
    await upsertAudit(clientId, 'page_speed', ps.status, ps.summary, ps.findings, ps.score)
    audits.push({ type: 'page_speed', status: ps.status, summary: ps.summary })
  }

  /* Stale-content audit is a snapshot job — needs prior runs to
     compare. For first runs, just record the current snapshot. */
  const stale = await auditStaleContent(clientId, pages)
  await upsertAudit(clientId, 'stale_content', stale.status, stale.summary, stale.findings, null)
  audits.push({ type: 'stale_content', status: stale.status, summary: stale.summary })

  return { ok: true, audits }
}

async function discoverPages(baseUrl: string): Promise<string[]> {
  /* Try sitemap.xml first. */
  try {
    const sitemap = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/sitemap.xml`, 5000)
    if (sitemap.ok) {
      const text = await sitemap.text()
      const urls = Array.from(text.matchAll(/<loc>([^<]+)<\/loc>/g))
        .map(m => m[1].trim())
        .filter(u => sameDomain(u, baseUrl))
        .slice(0, MAX_PAGES_PER_AUDIT)
      if (urls.length > 0) return urls
    }
  } catch { /* sitemap missing, fall through */ }

  /* Fallback: fetch homepage, extract internal links. */
  try {
    const home = await fetchWithTimeout(baseUrl, 5000)
    if (!home.ok) return [baseUrl]
    const html = await home.text()
    const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g)).map(m => m[1])
    const internal = new Set<string>([baseUrl])
    for (const h of hrefs) {
      if (h.startsWith('http')) {
        if (sameDomain(h, baseUrl)) internal.add(h)
      } else if (h.startsWith('/') && !h.startsWith('//')) {
        internal.add(baseUrl.replace(/\/$/, '') + h)
      }
      if (internal.size >= MAX_PAGES_PER_AUDIT) break
    }
    return Array.from(internal)
  } catch {
    return [baseUrl]
  }
}

/* Broken-link audit: HEAD each discovered URL. */
async function auditBrokenLinks(baseUrl: string, pages: string[]) {
  const findings: AuditFinding[] = []
  for (const url of pages) {
    try {
      const res = await fetchWithTimeout(url, 5000, { method: 'HEAD' })
      if (res.status >= 400) {
        findings.push({ url, message: `Returns HTTP ${res.status}`, severity: 'fail' })
      }
    } catch (err) {
      findings.push({ url, message: `Unreachable: ${(err as Error).message}`, severity: 'fail' })
    }
  }
  /* Also scan the homepage for outgoing links and check a few. */
  try {
    const home = await fetchWithTimeout(baseUrl, 5000)
    if (home.ok) {
      const html = await home.text()
      const externalHrefs = Array.from(html.matchAll(/href="(https?:\/\/[^"]+)"/g))
        .map(m => m[1])
        .filter(u => !sameDomain(u, baseUrl))
        .slice(0, 10)
      for (const url of externalHrefs) {
        try {
          const res = await fetchWithTimeout(url, 5000, { method: 'HEAD' })
          if (res.status >= 400) {
            findings.push({ url, message: `Outbound link ${res.status}`, severity: 'warn' })
          }
        } catch {
          findings.push({ url, message: 'Outbound link unreachable', severity: 'warn' })
        }
      }
    }
  } catch { /* swallow */ }

  const failures = findings.filter(f => f.severity === 'fail').length
  const status = failures === 0 ? 'pass' : 'fail'
  const summary = failures === 0
    ? `${pages.length} pages checked, no broken links`
    : `${failures} broken link${failures === 1 ? '' : 's'} found`
  return { status, summary, findings }
}

/* PageSpeed Insights audit. */
async function auditPageSpeed(pages: string[], apiKey: string) {
  const findings: AuditFinding[] = []
  let scoreSum = 0
  let scoreCount = 0
  for (const url of pages) {
    try {
      const psi = await fetchWithTimeout(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=mobile&category=performance`,
        20_000,
      )
      const body = await psi.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } } } }
      const score = body.lighthouseResult?.categories?.performance?.score
      if (score != null) {
        const pct = Math.round(score * 100)
        scoreSum += pct
        scoreCount++
        const severity: 'fail' | 'warn' | 'info' = pct < 50 ? 'fail' : pct < 80 ? 'warn' : 'info'
        findings.push({ url, message: `Mobile score: ${pct}/100`, severity })
      }
    } catch (err) {
      findings.push({ url, message: `Speed check failed: ${(err as Error).message}`, severity: 'warn' })
    }
  }
  const avg = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0
  const status = avg >= 80 ? 'pass' : avg >= 50 ? 'warn' : avg > 0 ? 'fail' : 'error'
  const summary = scoreCount === 0
    ? 'Speed check could not run'
    : `Avg mobile score: ${avg}/100 across ${scoreCount} page${scoreCount === 1 ? '' : 's'}`
  return { status, summary, findings, score: avg }
}

/* Schema markup audit: look for JSON-LD on each page. Restaurants
   should have LocalBusiness / Restaurant schema. */
async function auditSchemaMarkup(pages: string[]) {
  const findings: AuditFinding[] = []
  let pagesWithSchema = 0
  let pagesWithRestaurant = 0
  /* Limit to 5 pages to keep this fast. */
  for (const url of pages.slice(0, 5)) {
    try {
      const res = await fetchWithTimeout(url, 5000)
      if (!res.ok) continue
      const html = await res.text()
      const jsonLdBlocks = Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi))
        .map(m => m[1].trim())
      if (jsonLdBlocks.length === 0) {
        findings.push({ url, message: 'No JSON-LD schema markup', severity: 'warn' })
        continue
      }
      pagesWithSchema++
      let hasRestaurant = false
      for (const block of jsonLdBlocks) {
        if (/"@type"\s*:\s*"(Restaurant|FoodEstablishment|LocalBusiness)"/i.test(block)) {
          hasRestaurant = true
          break
        }
      }
      if (hasRestaurant) {
        pagesWithRestaurant++
      } else {
        findings.push({ url, message: 'Has schema but no Restaurant/LocalBusiness type', severity: 'warn' })
      }
    } catch { /* skip */ }
  }
  const checked = Math.min(5, pages.length)
  const status = pagesWithRestaurant > 0 ? 'pass' : pagesWithSchema > 0 ? 'warn' : 'fail'
  const summary = pagesWithRestaurant > 0
    ? `Restaurant schema found on ${pagesWithRestaurant} of ${checked} pages`
    : pagesWithSchema > 0
      ? `${pagesWithSchema} of ${checked} pages have schema, but no Restaurant type detected`
      : `No JSON-LD schema markup on any of the ${checked} pages checked`
  return { status, summary, findings }
}

/* Stale-content audit: compares this run's body hashes to whatever
   we stashed in findings on the prior run. First run just records
   the snapshot. */
async function auditStaleContent(clientId: string, pages: string[]) {
  const admin = createAdminClient()
  /* Load prior run for this client. */
  const { data: prior } = await admin
    .from('site_audits')
    .select('findings, ran_at')
    .eq('client_id', clientId)
    .eq('audit_type', 'stale_content')
    .maybeSingle()
  const priorSnapshots: Array<{ url: string; hash: string; first_seen: string }> =
    (prior?.findings as Array<{ url: string; hash: string; first_seen: string }> | null) ?? []
  const priorByUrl = new Map(priorSnapshots.map(p => [p.url, p]))

  const now = new Date().toISOString()
  const newSnapshots: Array<{ url: string; hash: string; first_seen: string; message?: string; severity?: 'info' | 'warn' | 'fail' }> = []
  const staleThresholdMs = 90 * 24 * 60 * 60 * 1000

  for (const url of pages.slice(0, 10)) {
    try {
      const res = await fetchWithTimeout(url, 5000)
      if (!res.ok) continue
      const html = await res.text()
      /* Strip whitespace, scripts, styles for stable hashing. */
      const stable = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50_000)
      const hash = await sha256(stable)
      const prevForUrl = priorByUrl.get(url)
      const first_seen = prevForUrl && prevForUrl.hash === hash ? prevForUrl.first_seen : now
      const ageMs = Date.now() - new Date(first_seen).getTime()
      const isStale = ageMs >= staleThresholdMs
      newSnapshots.push({
        url, hash, first_seen,
        message: isStale ? `Unchanged for ${Math.round(ageMs / (24 * 60 * 60 * 1000))} days` : undefined,
        severity: isStale ? 'warn' : undefined,
      })
    } catch { /* skip page */ }
  }

  const staleCount = newSnapshots.filter(s => s.severity === 'warn').length
  const status = staleCount === 0 ? 'pass' : staleCount > 2 ? 'warn' : 'pass'
  const summary = priorSnapshots.length === 0
    ? `Recorded snapshot of ${newSnapshots.length} pages (baseline for next run)`
    : staleCount === 0
      ? `${newSnapshots.length} pages tracked, none stale`
      : `${staleCount} page${staleCount === 1 ? '' : 's'} not updated in 90+ days`
  return { status, summary, findings: newSnapshots }
}

/* ── Helpers ───────────────────────────────────────────────────────── */

async function upsertAudit(
  clientId: string,
  auditType: string,
  status: string,
  summary: string,
  findings: AuditFinding[] | Array<{ url: string; hash: string; first_seen: string }>,
  score: number | null,
): Promise<void> {
  const admin = createAdminClient()
  /* Delete existing row then insert (we have a unique constraint). */
  await admin.from('site_audits')
    .delete()
    .eq('client_id', clientId)
    .eq('audit_type', auditType)
  await admin.from('site_audits').insert({
    client_id: clientId,
    audit_type: auditType,
    status,
    summary,
    findings,
    score,
  })
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': 'Apnosh-SiteAudit/1.0', ...(init?.headers ?? {}) },
    })
  } finally {
    clearTimeout(id)
  }
}

function normalizeUrl(u: string): string {
  if (!u) return u
  if (!u.startsWith('http')) u = `https://${u}`
  try { return new URL(u).origin } catch { return u }
}

function sameDomain(a: string, b: string): boolean {
  try { return new URL(a).hostname === new URL(b).hostname } catch { return false }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/* Reads + types for the UI. */
export interface SiteAuditRow {
  audit_type: 'broken_links' | 'page_speed' | 'schema_markup' | 'stale_content'
  status: 'pass' | 'warn' | 'fail' | 'error'
  summary: string
  findings: AuditFinding[] | Array<{ url: string; hash: string; first_seen: string; message?: string; severity?: string }>
  score: number | null
  ran_at: string
}

export async function getSiteAudits(clientId: string): Promise<SiteAuditRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_audits')
    .select('audit_type, status, summary, findings, score, ran_at')
    .eq('client_id', clientId)
    .order('audit_type')
  return (data ?? []) as SiteAuditRow[]
}

/* Suppress unused-import warning for the TIMEOUT_MS constant. */
void TIMEOUT_MS
