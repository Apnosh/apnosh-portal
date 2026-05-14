'use server'

/**
 * Website health score — 0-100 + prioritized fix list. Mirrors the
 * Local SEO listing-health pattern: surface a single number plus
 * 3 highest-leverage fixes the owner can act on right now.
 *
 * Inputs:
 *   - website_health (uptime, SSL, pagespeed, last content update)
 *   - clients.website_url (whether one is set at all)
 *   - latest GA snapshot (whether analytics are connected)
 *   - latest web_page_drafts / content_drafts (recent admin activity)
 *
 * Each check is weighted by how badly it hurts a restaurant's site:
 * being offline > slow > stale content > missing analytics.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface WebsiteHealthCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  weight: number
  message: string
  fixLink: string
}

export interface WebsiteHealthResult {
  score: number
  status: 'great' | 'good' | 'needs_work'
  checks: WebsiteHealthCheck[]
  topFixes: WebsiteHealthCheck[]
}

export async function getWebsiteHealth(clientId: string): Promise<WebsiteHealthResult | null> {
  const admin = createAdminClient()

  const [healthRow, clientRow, gaRow] = await Promise.all([
    admin.from('website_health').select('*').eq('client_id', clientId).maybeSingle(),
    admin.from('clients').select('website_url').eq('id', clientId).maybeSingle(),
    admin.from('channel_connections')
      .select('id, status, last_sync_at')
      .eq('client_id', clientId)
      .in('channel', ['google_analytics', 'google_search_console'])
      .eq('status', 'active')
      .limit(1),
  ])

  const health = healthRow.data as { uptime_status?: string; uptime_pct_30d?: number; pagespeed_mobile?: number; pagespeed_desktop?: number; ssl_valid?: boolean; last_content_update_at?: string } | null
  const websiteUrl = clientRow.data?.website_url as string | null | undefined
  const analyticsConnected = (gaRow.data ?? []).length > 0

  const checks: WebsiteHealthCheck[] = []

  /* 1. Website URL set at all. */
  checks.push({
    id: 'website_url',
    label: 'Website URL',
    weight: 12,
    status: websiteUrl ? 'pass' : 'fail',
    message: websiteUrl ? `Set to ${websiteUrl}.` : 'No website URL on file. Add it so we can monitor health.',
    fixLink: '/dashboard/website/manage',
  })

  /* 2. Uptime — the most damaging thing to be wrong. */
  const uptime = health?.uptime_status ?? 'unknown'
  checks.push({
    id: 'uptime',
    label: 'Site uptime',
    weight: 22,
    status: uptime === 'up' ? 'pass' : uptime === 'degraded' ? 'warn' : uptime === 'down' ? 'fail' : 'warn',
    message: uptime === 'up'
      ? `Online. ${(health?.uptime_pct_30d ?? 100).toFixed(1)}% uptime last 30 days.`
      : uptime === 'degraded' ? 'Site is responding slowly or with errors.'
      : uptime === 'down' ? 'Site is offline. Customers can\'t reach you right now.'
      : 'Uptime monitoring not configured yet.',
    fixLink: '/dashboard/website/health',
  })

  /* 3. SSL valid — a broken padlock kills credibility instantly. */
  const ssl = health?.ssl_valid
  checks.push({
    id: 'ssl',
    label: 'HTTPS / SSL certificate',
    weight: 10,
    status: ssl === true ? 'pass' : ssl === false ? 'fail' : 'warn',
    message: ssl === true ? 'Valid.'
      : ssl === false ? 'Certificate is invalid or expired. Customers see a "not secure" warning.'
      : 'Not checked yet.',
    fixLink: '/dashboard/website/health',
  })

  /* 4. Mobile pagespeed — most restaurant traffic is mobile. */
  const mobileSpeed = health?.pagespeed_mobile
  checks.push({
    id: 'pagespeed_mobile',
    label: 'Mobile speed',
    weight: 15,
    status: mobileSpeed == null ? 'warn'
      : mobileSpeed >= 80 ? 'pass'
      : mobileSpeed >= 50 ? 'warn'
      : 'fail',
    message: mobileSpeed == null
      ? 'Not measured yet.'
      : mobileSpeed >= 80 ? `Fast (${mobileSpeed}/100).`
      : mobileSpeed >= 50 ? `Moderate (${mobileSpeed}/100). Compress images and lazy-load below-the-fold content.`
      : `Slow (${mobileSpeed}/100). Big images or render-blocking scripts. Send a request for us to optimize.`,
    fixLink: '/dashboard/website/health',
  })

  /* 5. Desktop pagespeed. */
  const desktopSpeed = health?.pagespeed_desktop
  checks.push({
    id: 'pagespeed_desktop',
    label: 'Desktop speed',
    weight: 8,
    status: desktopSpeed == null ? 'warn'
      : desktopSpeed >= 90 ? 'pass'
      : desktopSpeed >= 60 ? 'warn'
      : 'fail',
    message: desktopSpeed == null
      ? 'Not measured yet.'
      : desktopSpeed >= 90 ? `Fast (${desktopSpeed}/100).`
      : `${desktopSpeed}/100.`,
    fixLink: '/dashboard/website/health',
  })

  /* 6. Content freshness — restaurants need fresh content. */
  const lastEdit = health?.last_content_update_at ? new Date(health.last_content_update_at) : null
  const daysSinceEdit = lastEdit ? Math.floor((Date.now() - lastEdit.getTime()) / (24 * 60 * 60 * 1000)) : null
  checks.push({
    id: 'content_freshness',
    label: 'Content freshness',
    weight: 8,
    status: daysSinceEdit == null ? 'warn'
      : daysSinceEdit < 60 ? 'pass'
      : daysSinceEdit < 120 ? 'warn'
      : 'fail',
    message: daysSinceEdit == null
      ? 'No tracked edits yet.'
      : daysSinceEdit < 60
        ? `Updated ${daysSinceEdit} day${daysSinceEdit === 1 ? '' : 's'} ago.`
        : `Last update ${daysSinceEdit} days ago. Fresh content helps SEO; request a refresh.`,
    fixLink: '/dashboard/website/requests/new',
  })

  /* 7. Google Analytics connected — without it, owners can't see traffic. */
  checks.push({
    id: 'analytics',
    label: 'Analytics connected',
    weight: 10,
    status: analyticsConnected ? 'pass' : 'fail',
    message: analyticsConnected
      ? 'Google Analytics is sending traffic data.'
      : 'Analytics isn\'t connected. Connect it to see who\'s visiting your site.',
    fixLink: '/dashboard/connected-accounts',
  })

  /* Score. */
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
  const earned = checks.reduce((s, c) => {
    const m = c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0
    return s + c.weight * m
  }, 0)
  const score = Math.round((earned / totalWeight) * 100)
  const status: WebsiteHealthResult['status'] = score >= 85 ? 'great' : score >= 60 ? 'good' : 'needs_work'

  const topFixes = checks
    .filter(c => c.status !== 'pass')
    .sort((a, b) => {
      const am = a.status === 'warn' ? 0.5 : 0
      const bm = b.status === 'warn' ? 0.5 : 0
      return (b.weight * (1 - bm)) - (a.weight * (1 - am))
    })
    .slice(0, 3)

  return { score, status, checks, topFixes }
}
