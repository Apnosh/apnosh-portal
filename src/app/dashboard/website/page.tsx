/**
 * Owner Website hub — apnosh-mvp surface. Reached from More -> Your channels.
 *
 * A focused glance: is the site live + tracking, new form leads waiting (the one
 * time-sensitive owner action), visitors this month, and what needs the owner
 * (health fixes). The heavy tools (request builder, full analytics, setup
 * wizard, heatmaps, forms inbox) stay as link-outs. Content editing (menu,
 * photos, hours) lives in Business info, so it is never rebuilt here.
 */

import { redirect } from 'next/navigation'
import {
  Globe, BarChart3, Inbox, ClipboardList, MousePointerClick, Eye, TrendingUp,
  Wrench, ExternalLink,
} from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWebsiteView } from '@/lib/dashboard/get-website-view'
import { getWebsiteHealth } from '@/lib/website-health-score'
import { listFormSubmissions, type FormSubmission } from '@/lib/form-submissions'
import MvpShell from '@/components/mvp/mvp-shell'
import {
  MvpDetailHeader, MvpGroup, MvpRow, MvpPill, MvpStat, MvpStatGrid, MvpSectionLabel, MvpEmpty, StatusPill, C,
} from '@/components/mvp/mvp-detail'

export const dynamic = 'force-dynamic'

const METRIC_ICON: Record<string, typeof Eye> = {
  'Website visitors': Eye,
  'Website visits': MousePointerClick,
  'Shown on Google': TrendingUp,
  'Actions taken': BarChart3,
}

function hostOf(url: string): string {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '') } catch { return url }
}
function ensureHttp(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`
}
function rel(iso: string | null): string {
  if (!iso) return ''
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function WebsitePage() {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  let view: Awaited<ReturnType<typeof getWebsiteView>> = null
  let health: Awaited<ReturnType<typeof getWebsiteHealth>> = null
  let leads: FormSubmission[] = []
  let websiteUrl: string | null = null

  if (clientId) {
    const admin = createAdminClient()
    const [v, h, l, c] = await Promise.all([
      getWebsiteView(clientId),
      getWebsiteHealth(clientId),
      listFormSubmissions(),
      admin.from('clients').select('website_url').eq('id', clientId).maybeSingle(),
    ])
    view = v; health = h; leads = l
    websiteUrl = (c.data?.website_url as string | null) ?? null
  }

  const analyticsOn = health?.checks.find((c) => c.id === 'analytics')?.status === 'pass'
  const siteOn = !!websiteUrl
  const unread = leads.filter((l) => l.status === 'new')
  const recent = unread.slice(0, 3)
  const topFixes = (health?.topFixes ?? []).slice(0, 2)
  // getWebsiteView never returns null on success, so the real "connected"
  // signals are a website URL on file and/or analytics flowing.
  const notConnected = !siteOn && !analyticsOn

  const subtitle = notConnected ? 'Connect analytics to see traffic'
    : siteOn && analyticsOn ? 'Your site is live and tracking'
    : 'Your website at a glance'

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Website" subtitle={subtitle} />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {notConnected ? (
          <>
            <MvpEmpty icon={<Globe size={20} color={C.green} />} title="Connect your website" text="See traffic and leads once your analytics are on." />
            <MvpGroup>
              <MvpRow icon={<Globe size={18} />} label="Start setup" sub="Connect analytics and search" href="/dashboard/website/setup" />
            </MvpGroup>
          </>
        ) : (
          <>
            {/* Connection */}
            <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
              <StatusPill label="Website" on={siteOn} onText={websiteUrl ? hostOf(websiteUrl) : 'Live'} offText="No URL on file" />
              <StatusPill label="Analytics" on={!!analyticsOn} offText="Not connected" />
            </div>

            {/* Needs you: new leads */}
            {unread.length > 0 && (
              <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 14, marginBottom: 18 }}>
                <MvpPill tone="warn" label={`${unread.length} new lead${unread.length > 1 ? 's' : ''}`} />
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, margin: '9px 0 4px' }}>Someone reached out</div>
                {recent.map((l) => (
                  <a key={l.id} href="/dashboard/website/forms" className="mvp-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.display_name || 'New lead'}</span>
                    <span style={{ fontSize: 12, color: C.faint, flexShrink: 0 }}>{l.kind} · {rel(l.submitted_at)}</span>
                  </a>
                ))}
                <a href="/dashboard/website/forms" className="mvp-row" style={{ display: 'block', textAlign: 'center', marginTop: 10, height: 42, lineHeight: '42px', borderRadius: 12, background: C.green, color: '#fff', fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}>See all leads</a>
              </div>
            )}

            {/* Needs you: health fixes */}
            {topFixes.length > 0 && (
              <MvpGroup title="Needs your attention">
                {topFixes.map((f) => <MvpRow key={f.id} icon={<Wrench size={18} />} label={f.label} sub={f.message} href={f.fixLink} />)}
              </MvpGroup>
            )}

            {/* Snapshot */}
            {view?.metrics && view.metrics.length > 0 && (
              <>
                <MvpSectionLabel>This month</MvpSectionLabel>
                <div style={{ marginBottom: 18 }}>
                  <MvpStatGrid>
                    {view.metrics.slice(0, 4).map((m, i) => {
                      const Icon = METRIC_ICON[m.label] ?? BarChart3
                      return <MvpStat key={i} icon={<Icon size={14} />} value={m.value} label={m.label} />
                    })}
                  </MvpStatGrid>
                </div>
              </>
            )}

            {/* Take action */}
            <MvpGroup title="Take action">
              <MvpRow icon={<Wrench size={18} />} label="Request a change" sub="We make the edit for you" href="/dashboard/website/requests/new" />
              {websiteUrl && <MvpRow icon={<ExternalLink size={18} />} label="Open your site" sub={hostOf(websiteUrl)} href={ensureHttp(websiteUrl)} external />}
            </MvpGroup>

            {/* Dig deeper */}
            <MvpGroup title="Dig deeper">
              <MvpRow icon={<BarChart3 size={18} />} label="Full traffic report" sub="Sources, pages, search" href="/dashboard/website/traffic" />
              <MvpRow icon={<Inbox size={18} />} label="All leads" sub={`${leads.length} total`} href="/dashboard/website/forms" />
              <MvpRow icon={<ClipboardList size={18} />} label="Change requests" sub="History and status" href="/dashboard/website/requests" />
              <MvpRow icon={<MousePointerClick size={18} />} label="Heatmaps" sub="See where visitors click" href="/dashboard/website/heatmaps" />
            </MvpGroup>
          </>
        )}
      </div>
    </MvpShell>
  )
}
