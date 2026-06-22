/**
 * Owner Local SEO hub — apnosh-mvp surface. Reached from More -> Your channels.
 *
 * How the restaurant shows up on Google. A focused glance: is the listing
 * connected + verified, listing-health score with the top fixes (which deep-link
 * into the Business info editors, NOT the legacy GBP editor), a 30-day Google
 * visibility snapshot, and the one unique action (Post to Google). Listing
 * FIELDS (hours, address, category, menu, contact) live in Business info, and
 * reviews live in the Alerts inbox, so neither is rebuilt here.
 */

import { redirect } from 'next/navigation'
import {
  MapPin, BarChart3, Megaphone, ListChecks, Star, Eye, Navigation, Phone,
  MousePointerClick, Wrench, RefreshCw,
} from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getListingHealth } from '@/lib/dashboard/get-listing-health'
import { getImpactSummary } from '@/lib/dashboard/get-impact-summary'
import MvpShell from '@/components/mvp/mvp-shell'
import {
  MvpDetailHeader, MvpGroup, MvpRow, MvpPill, MvpStat, MvpStatGrid, MvpSectionLabel, MvpEmpty, StatusPill,
  C, AMBER_DK, AMBER_SOFT,
} from '@/components/mvp/mvp-detail'

export const dynamic = 'force-dynamic'

const METRIC_ICON: Record<string, typeof Eye> = {
  Impressions: Eye, Directions: Navigation, Calls: Phone, 'Website clicks': MousePointerClick,
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

export default async function LocalSeoPage() {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  let connected = false, v4Enabled = false, verified = false, tokenRevoked = false
  let health: Awaited<ReturnType<typeof getListingHealth>> | null = null
  let impact: Awaited<ReturnType<typeof getImpactSummary>> | null = null

  if (clientId) {
    const admin = createAdminClient()
    const [rowRes, h, im] = await Promise.all([
      admin.from('channel_connections')
        .select('status, sync_error, last_sync_at')
        .eq('client_id', clientId).eq('channel', 'google_business_profile')
        .neq('platform_account_id', 'pending')
        .order('connected_at', { ascending: false }).limit(1).maybeSingle(),
      getListingHealth(clientId),
      getImpactSummary(clientId),
    ])
    health = h; impact = im
    const row = rowRes.data as { status?: string; sync_error?: string | null; last_sync_at?: string | null } | null
    connected = !!row && row.status === 'active'
    const syncErr = (row?.sync_error ?? '').toLowerCase()
    v4Enabled = connected && !/api has not been used|mybusiness\.googleapis\.com.*disabled/.test(syncErr) && !!row?.last_sync_at
    verified = connected && !/metrics .*?: requested entity was not found/i.test(syncErr)
    tokenRevoked = connected && /invalid_grant|unauthorized|401|token (?:has been )?(?:expired|revoked)/i.test(syncErr)
  }

  // getListingHealth also computes its own `connected`; trust the channel row.
  const fixes = (health?.checks ?? []).filter((c) => c.status === 'fail' && c.fixHref).slice(0, 3)
  const metrics = (impact?.metrics ?? []).slice(0, 4)

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Local SEO" subtitle="How you show up on Google" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {!connected ? (
          <>
            <MvpEmpty icon={<MapPin size={20} color={C.green} />} title={tokenRevoked ? 'Reconnect Google' : 'Connect Google Business Profile'} text={tokenRevoked ? 'Your Google connection expired. Reconnect to keep your listing in sync.' : 'See how customers find you on Google once your listing is connected.'} />
            <MvpGroup>
              <MvpRow icon={<RefreshCw size={18} />} label={tokenRevoked ? 'Reconnect' : 'Connect'} sub="Google Business Profile" href="/dashboard/connected-accounts" />
            </MvpGroup>
          </>
        ) : (
          <>
            {/* Connection */}
            <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
              <StatusPill label="Google listing" on={connected} onText={verified ? 'Connected' : 'Connected'} />
            </div>
            {!verified && (
              <div style={{ fontSize: 12.5, color: AMBER_DK, background: AMBER_SOFT, borderRadius: 12, padding: '9px 12px', marginBottom: 16 }}>Your listing is not verified yet, so some Google metrics are limited.</div>
            )}

            {/* Listing health */}
            {health && (
              <>
                <MvpSectionLabel>Your listing</MvpSectionLabel>
                <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 14, marginBottom: fixes.length ? 10 : 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, color: C.mute, fontWeight: 600 }}>Listing health</div>
                      <div style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{health.passed} of {health.total} checks passing</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 26, fontWeight: 600, color: health.grade === 'needs-work' ? C.coral : C.greenDk, fontFamily: "'Cal Sans','Inter',sans-serif" }}>{health.score}</span>
                      <span style={{ fontSize: 13, color: C.faint }}> / 100</span>
                    </div>
                  </div>
                </div>
                {fixes.length > 0 && (
                  <MvpGroup title="Top fixes">
                    {fixes.map((f) => <MvpRow key={f.key} icon={<Wrench size={18} />} label={f.label} sub={f.fixLabel || f.detail} href={f.fixHref} />)}
                  </MvpGroup>
                )}
              </>
            )}

            {/* Snapshot */}
            {metrics.length > 0 && (
              <>
                <MvpSectionLabel>Last 30 days on Google</MvpSectionLabel>
                <div style={{ marginBottom: 6 }}>
                  <MvpStatGrid>
                    {metrics.map((m) => {
                      const Icon = METRIC_ICON[m.label] ?? BarChart3
                      const delta = m.deltaPct == null ? undefined
                        : { dir: m.deltaPct > 0 ? 'up' as const : m.deltaPct < 0 ? 'down' as const : 'flat' as const, text: `${m.deltaPct > 0 ? '+' : ''}${m.deltaPct}%` }
                      return <MvpStat key={m.key} icon={<Icon size={14} />} value={fmtNum(m.value)} label={m.label} delta={delta} />
                    })}
                  </MvpStatGrid>
                </div>
                {impact?.throughLabel && <div style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginBottom: 18 }}>{impact.throughLabel}. Google data lags about 3 days.</div>}
              </>
            )}

            {/* Reviews recap (count + rating only; replies live in Alerts) */}
            {impact && (impact.rating != null || impact.reviewsThisMonth > 0) && (
              <MvpGroup title="Reviews">
                <MvpRow icon={<Star size={18} />}
                  label={impact.rating != null ? `${impact.rating.toFixed(1)} stars` : 'New reviews'}
                  sub={[impact.ratingCount != null ? `${impact.ratingCount} total` : '', impact.reviewsThisMonth > 0 ? `${impact.reviewsThisMonth} this month` : ''].filter(Boolean).join(' · ') || 'Reply from Alerts'}
                  href="/dashboard/inbox?tab=reviews" />
              </MvpGroup>
            )}

            {/* Post to Google (unique action) */}
            <MvpGroup title="Stay active">
              {v4Enabled ? (
                <MvpRow icon={<Megaphone size={18} />} label="Post to Google" sub="Share an offer, event, or update" href="/dashboard/local-seo/posts" />
              ) : (
                <MvpRow icon={<Megaphone size={18} />} label="Post to Google" sub="Available once your listing finishes setup" />
              )}
            </MvpGroup>

            {/* Dig deeper */}
            <MvpGroup title="Dig deeper">
              <MvpRow icon={<BarChart3 size={18} />} label="Full Google analytics" sub="Searches, views, actions" href="/dashboard/local-seo/analytics" />
              <MvpRow icon={<ListChecks size={18} />} label="Listing health detail" sub="Every check and fix" href="/dashboard/local-seo/health" />
            </MvpGroup>
          </>
        )}
      </div>
    </MvpShell>
  )
}
