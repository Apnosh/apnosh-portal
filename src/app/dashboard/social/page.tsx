/**
 * Owner Social hub — apnosh-mvp surface. Reached from More -> Your channels.
 *
 * Proof the team is working + what needs the owner. A focused glance: connected
 * platforms, what needs approval (a summary that deep-links to the Alerts
 * inbox, never a second approval queue), a 30-day reach/engagement/followers/
 * posts snapshot, the recent feed, what is coming up, and plan usage. The heavy
 * builders (graphic/video request) and engage/boost tools stay as link-outs;
 * "Run an ad" routes to the Create flow; connecting accounts lives on the
 * Connected accounts page.
 */

import { redirect } from 'next/navigation'
import {
  Share2, Plus, Megaphone, BarChart3, CalendarDays, MessageCircle, FolderOpen,
  Eye, Heart, Users, Film,
} from 'lucide-react'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getSocialHub } from '@/lib/dashboard/get-social-hub'
import { getSocialBreakdown } from '@/lib/dashboard/get-social-breakdown'
import MvpShell from '@/components/mvp/mvp-shell'
import {
  MvpDetailHeader, MvpGroup, MvpRow, MvpPill, MvpStat, MvpStatGrid, MvpSectionLabel, MvpEmpty, StatusPill, C,
} from '@/components/mvp/mvp-detail'

export const dynamic = 'force-dynamic'

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }

export default async function SocialPage() {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  let hub: Awaited<ReturnType<typeof getSocialHub>> | null = null
  let breakdown: Awaited<ReturnType<typeof getSocialBreakdown>> | null = null
  if (clientId) {
    const [h, b] = await Promise.all([getSocialHub(clientId), getSocialBreakdown(clientId)])
    hub = h; breakdown = b
  }

  const platforms = breakdown?.platforms ?? []
  const recent = hub?.recent ?? []
  const upcoming = hub?.upcoming ?? []
  const needsYou = (hub?.counts.needsYou ?? 0) + (hub?.pendingQuotes.length ?? 0)
  const isEmpty = platforms.length === 0 && recent.length === 0 && upcoming.length === 0

  // 30-day rollups from the daily breakdown (rows are date-ascending).
  const since = Date.now() - 30 * 86400000
  const rows30 = (breakdown?.rows ?? []).filter((r) => new Date(r.date).getTime() >= since)
  const sum = (key: 'reach' | 'engagement' | 'posts_published') => rows30.reduce((a, r) => a + (Number(r[key]) || 0), 0)
  const latestFollowers = new Map<string, number>()
  for (const r of breakdown?.rows ?? []) if (r.followers_total != null) latestFollowers.set(r.platform, Number(r.followers_total))
  const followers = [...latestFollowers.values()].reduce((a, b) => a + b, 0)
  const reach = hub?.reach30d ?? sum('reach')
  const engagement = sum('engagement')
  // Prefer the true 30-day published count from metrics; fall back to the
  // recent-feed count (capped) only when metrics carry no posts data.
  const posts30 = sum('posts_published') || (hub?.counts.live ?? 0)

  const plan = hub?.plan
  const planPct = plan?.percentUsed ?? null

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Social media" subtitle={hub?.narrative || 'Your posts and reach'} />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {isEmpty ? (
          <>
            <MvpEmpty icon={<Share2 size={20} color={C.green} />} title="Connect your accounts" text="Posts and reach show up here once your platforms are linked. Metrics flow in about 24 hours." />
            <MvpGroup>
              <MvpRow icon={<Share2 size={18} />} label="Connect accounts" sub="Instagram, TikTok, Facebook" href="/dashboard/connected-accounts" />
            </MvpGroup>
          </>
        ) : (
          <>
            {/* Connected platforms */}
            {platforms.length > 0 && (
              <div style={{ display: 'flex', gap: 9, marginBottom: 18, flexWrap: 'wrap' }}>
                {platforms.slice(0, 3).map((p) => <StatusPill key={p} label={cap(p)} on onText="Linked" />)}
              </div>
            )}

            {/* Needs you */}
            {needsYou > 0 && (
              <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 14, marginBottom: 18 }}>
                <MvpPill tone="warn" label={`${needsYou} need${needsYou > 1 ? '' : 's'} your OK`} />
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, marginTop: 9 }}>Posts waiting on you</div>
                <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>Review and approve in Alerts.</div>
                <a href="/dashboard/inbox?tab=approvals" className="mvp-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12, height: 44, borderRadius: 12, background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>Review in Alerts</a>
              </div>
            )}

            {/* Snapshot */}
            <MvpSectionLabel>Last 30 days</MvpSectionLabel>
            <div style={{ marginBottom: 18 }}>
              <MvpStatGrid>
                <MvpStat icon={<Eye size={14} />} value={fmtNum(reach)} label="Reach" />
                <MvpStat icon={<Heart size={14} />} value={fmtNum(engagement)} label="Engagement" />
                <MvpStat icon={<Users size={14} />} value={fmtNum(followers)} label="Followers" />
                <MvpStat icon={<Share2 size={14} />} value={String(posts30)} label="Posts" />
              </MvpStatGrid>
            </div>

            {/* Recent feed */}
            {recent.length > 0 && (
              <>
                <MvpSectionLabel>Recent posts</MvpSectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 18 }}>
                  {recent.slice(0, 8).map((p) => (
                    <a key={p.id} href="/dashboard/social/calendar" style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: '#ececef', display: 'block' }}>
                      {p.mediaUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: C.faint, padding: 4, textAlign: 'center', lineHeight: 1.3 }}>{(p.text || '').slice(0, 28)}</span>}
                      {p.mediaType === 'video' && <span style={{ position: 'absolute', top: 4, right: 4, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }}><Film size={12} /></span>}
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* Coming up */}
            {upcoming.length > 0 && (
              <>
                <MvpSectionLabel>Coming up</MvpSectionLabel>
                <MvpGroup>
                  {upcoming.slice(0, 4).map((p) => (
                    <MvpRow key={p.id} icon={<CalendarDays size={18} />}
                      label={(p.text || 'Scheduled post').slice(0, 40)}
                      sub={[fmtDate(p.scheduledFor), p.platforms.map(cap).join(', ')].filter(Boolean).join(' · ') || undefined} />
                  ))}
                </MvpGroup>
              </>
            )}

            {/* Plan usage */}
            {plan && plan.socialMonthlyAllotment != null && (
              <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 14, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Posts this month</span>
                  <span style={{ fontSize: 13, color: C.mute }}>{plan.usedThisMonth} of {plan.socialMonthlyAllotment}</span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: '#eef0ef', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, planPct ?? 0)}%`, background: C.green, borderRadius: 99 }} />
                </div>
              </div>
            )}

            {/* Take action */}
            <MvpGroup title="Take action">
              <MvpRow icon={<Plus size={18} />} label="Request content" sub="Graphic, video, or post" href="/dashboard/social/request" />
              <MvpRow icon={<Megaphone size={18} />} label="Run an ad" sub="Boost a post or start a campaign" href="/dashboard/campaigns/discover" />
            </MvpGroup>

            {/* Dig deeper */}
            <MvpGroup title="Dig deeper">
              <MvpRow icon={<BarChart3 size={18} />} label="Full performance" sub="By platform, month by month" href="/dashboard/social/performance" />
              <MvpRow icon={<CalendarDays size={18} />} label="Calendar and plan" sub="What is scheduled" href="/dashboard/social/calendar" />
              <MvpRow icon={<MessageCircle size={18} />} label="Comments and DMs" sub="Reply to your audience" href="/dashboard/social/engage" />
              <MvpRow icon={<FolderOpen size={18} />} label="Library" sub="Drafts and media" href="/dashboard/social/library" />
            </MvpGroup>
          </>
        )}
      </div>
    </MvpShell>
  )
}
