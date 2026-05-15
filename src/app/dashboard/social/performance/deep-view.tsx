'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, Heart, UserPlus, Send, TrendingUp, TrendingDown,
  ChevronLeft, ChevronRight, Star, FileText, Download, MapPin,
  Clock, BarChart3, Film, Image as ImageIcon, ThumbsUp, MessageCircle,
  Share2, Bookmark, Eye,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'
import { useRealtimeRefresh } from '@/lib/realtime'
import { Sparkline } from '@/components/charts/Sparkline'
import { HorizontalBar, StackedBar } from '@/components/charts/HorizontalBar'
import type { SocialMetricsRow, SocialDemographics, ClientMonthlyReport, OptimalSendTime } from '@/types/database'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
  linkedin: 'LinkedIn', google_business: 'Google', youtube: 'YouTube',
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C', facebook: '#1877F2', tiktok: '#000000',
  linkedin: '#0A66C2', google_business: '#4285F4', youtube: '#FF0000',
}

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 1000).toFixed(0)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

function pctChange(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0) return { text: 'No prior data', direction: 'flat' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct > 0) return { text: `Up ${pct}% from last month`, direction: 'up' }
  if (pct < 0) return { text: `Down ${Math.abs(pct)}% from last month`, direction: 'down' }
  return { text: 'Same as last month', direction: 'flat' }
}

export function DeepView() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [allMetrics, setAllMetrics] = useState<SocialMetricsRow[]>([])
  const [reports, setReports] = useState<ClientMonthlyReport[]>([])
  const [sendTimes, setSendTimes] = useState<OptimalSendTime[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [viewYear, setViewYear] = useState(now.getFullYear())

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [metricsRes, reportsRes, timesRes] = await Promise.all([
      supabase
        .from('social_metrics')
        .select('*')
        .eq('client_id', client.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(200),
      supabase
        .from('monthly_reports')
        .select('*')
        .eq('client_id', client.id)
        .eq('status', 'published')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(24),
      supabase
        .from('optimal_send_times')
        .select('*')
        .eq('client_id', client.id)
        .order('confidence', { ascending: false })
        .limit(20),
    ])

    setAllMetrics((metricsRes.data ?? []) as SocialMetricsRow[])
    setReports((reportsRes.data ?? []) as ClientMonthlyReport[])
    setSendTimes((timesRes.data ?? []) as OptimalSendTime[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { if (!clientLoading) load() }, [load, clientLoading])
  useRealtimeRefresh(['social_metrics'] as never[], load)

  // Current + previous month metrics
  const currentMonth = allMetrics.filter(m => m.month === viewMonth && m.year === viewYear)
  const prevMonth = allMetrics.filter(m =>
    viewMonth === 1 ? (m.month === 12 && m.year === viewYear - 1) : (m.month === viewMonth - 1 && m.year === viewYear)
  )

  // Aggregates
  const reach = currentMonth.reduce((s, m) => s + m.total_reach, 0)
  const engagement = currentMonth.reduce((s, m) => s + m.total_engagement, 0)
  // Followers summed across platforms = combined audience size. An individual
  // could follow on multiple platforms so this isn't truly "unique people",
  // but Meta doesn't expose cross-platform dedup anyway. Label it clearly.
  const followers = currentMonth.reduce((s, m) => s + m.followers_count, 0)
  const followersChange = currentMonth.reduce((s, m) => s + m.followers_change, 0)
  const posts = currentMonth.reduce((s, m) => s + m.posts_published, 0)
  const planned = currentMonth.reduce((s, m) => s + m.posts_planned, 0)
  const likes = currentMonth.reduce((s, m) => s + m.likes, 0)
  const comments = currentMonth.reduce((s, m) => s + m.comments, 0)
  const shares = currentMonth.reduce((s, m) => s + m.shares, 0)
  const saves = currentMonth.reduce((s, m) => s + m.saves, 0)

  const prevReach = prevMonth.reduce((s, m) => s + m.total_reach, 0)
  const prevEngagement = prevMonth.reduce((s, m) => s + m.total_engagement, 0)

  // Engagement rate
  const engagementRate = reach > 0 ? ((engagement / reach) * 100).toFixed(1) : null

  // Sparkline data (last 6 months, oldest to newest).
  // For SUM-style metrics (reach, engagement, etc.) this is just a per-month
  // total summed across platforms -- standard and correct.
  function getSparklineData(field: keyof SocialMetricsRow): number[] {
    const months: number[] = []
    for (let i = 5; i >= 0; i--) {
      let m = viewMonth - i
      let y = viewYear
      while (m < 1) { m += 12; y-- }
      const rows = allMetrics.filter(r => r.month === m && r.year === y)
      const val = rows.reduce((s, r) => s + (typeof r[field] === 'number' ? (r[field] as number) : 0), 0)
      months.push(val)
    }
    return months
  }

  // Followers need a different treatment -- they're a SNAPSHOT per platform,
  // not a monthly-sum metric. If platform A has data for month 1 but not 2,
  // a naive sum creates a false dip in month 2. Carry-forward each platform's
  // last-known count across missing months so the curve reflects real growth
  // rather than sync coverage artifacts.
  function getFollowerSparkline(): number[] {
    const allPlatforms = Array.from(new Set(allMetrics.map(r => r.platform)))
    // Build a { platform -> { 'YYYY-MM' -> count } } map
    const byPlatform = new Map<string, Map<string, number>>()
    for (const p of allPlatforms) byPlatform.set(p, new Map())
    for (const r of allMetrics) {
      const key = `${r.year}-${String(r.month).padStart(2, '0')}`
      byPlatform.get(r.platform)?.set(key, r.followers_count)
    }

    const months: number[] = []
    for (let i = 5; i >= 0; i--) {
      let m = viewMonth - i
      let y = viewYear
      while (m < 1) { m += 12; y-- }
      const key = `${y}-${String(m).padStart(2, '0')}`
      // For each platform, find its value for this month or the nearest
      // earlier month (carry-forward). If no earlier month exists, use 0.
      let total = 0
      for (const [, series] of byPlatform) {
        const direct = series.get(key)
        if (direct !== undefined) {
          total += direct
          continue
        }
        // Walk backward month-by-month up to 24 months to find last known
        let walkM = m, walkY = y
        let found = 0
        for (let steps = 0; steps < 24; steps++) {
          walkM -= 1
          if (walkM < 1) { walkM = 12; walkY -= 1 }
          const walkKey = `${walkY}-${String(walkM).padStart(2, '0')}`
          const v = series.get(walkKey)
          if (v !== undefined) { found = v; break }
        }
        total += found
      }
      months.push(total)
    }
    return months
  }

  // Top posts (across all platforms this month, sorted by engagement)
  const topPosts = currentMonth
    .filter(m => m.top_post_engagement && m.top_post_engagement > 0)
    .sort((a, b) => (b.top_post_engagement ?? 0) - (a.top_post_engagement ?? 0))
    .slice(0, 3)

  // Demographics (from the first row that has it)
  const demographics: SocialDemographics | null = currentMonth.find(m => m.demographics)?.demographics ?? null

  // Platforms active this month
  const platforms = Array.from(new Set(currentMonth.map(m => m.platform)))

  // Health: green if reach is up or stable, amber if down <20%, red if down >20%
  const reachChange = pctChange(reach, prevReach)
  const health: 'green' | 'amber' | 'red' =
    reachChange.direction === 'up' || reachChange.direction === 'flat' ? 'green' :
    Math.abs(((reach - prevReach) / (prevReach || 1)) * 100) > 20 ? 'red' : 'amber'

  const healthColor = health === 'green' ? 'bg-emerald-500' : health === 'amber' ? 'bg-amber-500' : 'bg-red-500'

  function navMonth(dir: -1 | 1) {
    let m = viewMonth + dir
    let y = viewYear
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setViewMonth(m)
    setViewYear(y)
  }

  const hasData = currentMonth.length > 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Month nav — title comes from the parent container */}
      <div className="flex items-center justify-end gap-4">
        <div className="flex items-center gap-2 flex-shrink-0 bg-white rounded-xl border border-ink-6 px-3 py-2">
          <button onClick={() => navMonth(-1)} className="text-ink-4 hover:text-ink transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-ink min-w-[100px] text-center">
            {MONTH_FULL[viewMonth - 1]} {viewYear}
          </span>
          <button onClick={() => navMonth(1)} className="text-ink-4 hover:text-ink transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading || clientLoading ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-ink-6 h-28 animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-ink-6 h-32 animate-pulse" />
            ))}
          </div>
        </div>
      ) : !hasData ? (
        <div className="bg-white rounded-2xl border border-ink-6 p-12 text-center">
          <BarChart3 className="w-8 h-8 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No results for {MONTH_FULL[viewMonth - 1]} {viewYear}</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            We&apos;re still gathering your data. Try a different month or check back soon.
          </p>
        </div>
      ) : (
        <>
          {/* ── Section 1: Monthly headline ── */}
          <div className="bg-white rounded-2xl border border-ink-6 p-6">
            <div className="flex items-start gap-4">
              <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${healthColor}`} />
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg text-ink leading-relaxed">
                  {reach > 0
                    ? `Your content reached ${fmtNum(reach)} people this month.`
                    : `You published ${posts} ${posts === 1 ? 'post' : 'posts'} this month.`}
                  {engagement > 0 && ` ${fmtNum(engagement)} people liked, commented, or shared.`}
                  {followersChange > 0 && ` You gained ${fmtNum(followersChange)} new followers.`}
                </p>
                <p className="text-xs text-ink-4 mt-2">
                  {MONTH_FULL[viewMonth - 1]} {viewYear} · {platforms.map(p => PLATFORM_LABELS[p] || p).join(', ')}
                </p>
              </div>
            </div>
          </div>

          {/* ── Section 2: The Big 4 ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BigStat
              icon={Eye}
              value={fmtNum(reach)}
              label="people saw your content"
              change={pctChange(reach, prevReach)}
              sparkData={getSparklineData('total_reach')}
            />
            <BigStat
              icon={Heart}
              value={fmtNum(engagement)}
              label="people interacted"
              change={pctChange(engagement, prevEngagement)}
              sparkData={getSparklineData('total_engagement')}
              pills={[
                likes > 0 ? `${fmtNum(likes)} likes` : null,
                comments > 0 ? `${fmtNum(comments)} comments` : null,
              ].filter(Boolean) as string[]}
            />
            <BigStat
              icon={UserPlus}
              value={fmtNum(followers)}
              label={platforms.length > 1 ? `followers across ${platforms.length} platforms` : 'followers'}
              sub={followersChange !== 0 ? `${followersChange > 0 ? '+' : ''}${fmtNum(followersChange)} this month` : undefined}
              sparkData={getFollowerSparkline()}
              sparkColor={followersChange >= 0 ? '#4abd98' : '#ef4444'}
            />
            <BigStat
              icon={Send}
              value={`${posts}`}
              label={planned > 0 ? `published out of ${planned} planned` : 'posts published'}
              sparkData={getSparklineData('posts_published')}
              sparkColor="#8b5cf6"
            />
          </div>

          {/* ── Section 3: Engagement breakdown ── */}
          {(likes > 0 || comments > 0 || shares > 0 || saves > 0) && (
            <div className="bg-white rounded-2xl border border-ink-6 p-6">
              <h2 className="text-sm font-semibold text-ink mb-1">How people engaged</h2>
              <p className="text-xs text-ink-4 mb-4">
                {likes > 0 && likes >= comments + shares + saves
                  ? `Most of your engagement came from likes (${Math.round((likes / engagement) * 100)}%).`
                  : 'Here is how people interacted with your content.'}
              </p>
              <StackedBar
                segments={[
                  { label: 'Likes', value: likes, color: '#10b981' },
                  { label: 'Comments', value: comments, color: '#3b82f6' },
                  { label: 'Shares', value: shares, color: '#8b5cf6' },
                  { label: 'Saves', value: saves, color: '#f59e0b' },
                ]}
                height={14}
              />
            </div>
          )}

          {/* ── Section 4: Best content ── */}
          {topPosts.length > 0 && (
            <div className="bg-white rounded-2xl border border-ink-6 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-ink">
                  {topPosts.length === 1 ? 'Your best post this month' : 'Your best content this month'}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {topPosts.map((post, i) => (
                  <div
                    key={post.id}
                    className={`rounded-xl border overflow-hidden ${i === 0 ? 'border-amber-200 ring-1 ring-amber-100' : 'border-ink-6'}`}
                  >
                    {post.top_post_image_url ? (
                      <div className="aspect-square bg-bg-2 overflow-hidden">
                        <img src={post.top_post_image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-square bg-bg-2 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-ink-5" />
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        {i === 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Best</span>
                        )}
                        <span className="text-[10px] text-ink-4 capitalize">{PLATFORM_LABELS[post.platform] || post.platform}</span>
                      </div>
                      {post.top_post_caption && (
                        <p className="text-xs text-ink-2 line-clamp-2 mb-2">{post.top_post_caption}</p>
                      )}
                      <p className="text-xs font-semibold text-brand">
                        {fmtNum(post.top_post_engagement ?? 0)} interactions
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 5: Demographics ── */}
          {demographics && (
            <div className="bg-white rounded-2xl border border-ink-6 p-6">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-ink-4" />
                <h2 className="text-sm font-semibold text-ink">Who follows you</h2>
              </div>
              {demographics.cities && demographics.cities.length > 0 && demographics.ages && demographics.ages.length > 0 && (
                <p className="text-xs text-ink-4 mb-5">
                  Most of your followers are in {demographics.cities[0].name} and are {demographics.ages[0].range} years old.
                </p>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Cities */}
                {demographics.cities && demographics.cities.length > 0 && (
                  <div>
                    <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Top cities</h3>
                    <HorizontalBar
                      items={demographics.cities.map(c => ({ label: c.name, value: c.count, color: '#4abd98' }))}
                      maxItems={5}
                    />
                  </div>
                )}
                {/* Ages */}
                {demographics.ages && demographics.ages.length > 0 && (
                  <div>
                    <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Age groups</h3>
                    <HorizontalBar
                      items={demographics.ages.map(a => ({ label: a.range, value: a.count, color: '#3b82f6' }))}
                      maxItems={5}
                    />
                  </div>
                )}
                {/* Gender */}
                {demographics.gender && demographics.gender.length > 0 && (
                  <div>
                    <h3 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Gender</h3>
                    <HorizontalBar
                      items={demographics.gender.map(g => ({
                        label: g.type === 'M' ? 'Male' : g.type === 'F' ? 'Female' : 'Other',
                        value: g.count,
                        color: g.type === 'M' ? '#3b82f6' : g.type === 'F' ? '#ec4899' : '#9ca3af',
                      }))}
                      showPercentage
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Section 6: Platform breakdown ── */}
          {platforms.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink mb-3">By platform</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {platforms.map(platform => {
                  const m = currentMonth.find(x => x.platform === platform)
                  if (!m) return null
                  const color = PLATFORM_COLORS[platform] || '#4abd98'
                  return (
                    <div key={platform} className="bg-white rounded-xl border border-ink-6 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '15' }}>
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-ink">{PLATFORM_LABELS[platform] || platform}</p>
                          <p className="text-[10px] text-ink-4">{fmtNum(m.followers_count)} followers</p>
                        </div>
                        {m.followers_change !== 0 && (
                          <span className={`ml-auto text-[10px] font-medium ${m.followers_change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {m.followers_change > 0 ? '+' : ''}{m.followers_change}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-bg-2 rounded-lg p-2">
                          <p className="text-sm font-semibold text-ink">{fmtNum(m.total_reach)}</p>
                          <p className="text-[9px] text-ink-4">Reach</p>
                        </div>
                        <div className="bg-bg-2 rounded-lg p-2">
                          <p className="text-sm font-semibold text-ink">{fmtNum(m.total_engagement)}</p>
                          <p className="text-[9px] text-ink-4">Engaged</p>
                        </div>
                        <div className="bg-bg-2 rounded-lg p-2">
                          <p className="text-sm font-semibold text-ink">{m.posts_published}</p>
                          <p className="text-[9px] text-ink-4">Posts</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Section 7: Engagement rate ── */}
          {engagementRate && parseFloat(engagementRate) > 0 && (
            <div className="bg-gradient-to-r from-brand-tint to-white rounded-2xl border border-brand/20 p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white border border-brand/20 flex items-center justify-center flex-shrink-0">
                  <span className="font-[family-name:var(--font-display)] text-xl text-brand-dark">{engagementRate}%</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {engagementRate}% of people who saw your posts engaged with them
                  </p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    {parseFloat(engagementRate) > 3
                      ? 'Great engagement rate. Your content is resonating.'
                      : parseFloat(engagementRate) > 1
                      ? 'Solid engagement. Room to grow with more interactive content.'
                      : 'Building momentum. Engagement grows as your audience gets to know you.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Section 8: Best time to post ── */}
          {sendTimes.length > 0 && (
            <div className="bg-white rounded-2xl border border-ink-6 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-ink-4" />
                <h2 className="text-sm font-semibold text-ink">Best time to post</h2>
              </div>
              {(() => {
                const top = sendTimes[0]
                const hour = top.hour_of_day
                const ampm = hour >= 12 ? 'pm' : 'am'
                const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                return (
                  <p className="text-sm text-ink-2">
                    Your audience is most active on <span className="font-medium">{DAY_NAMES[top.day_of_week]}s</span> around{' '}
                    <span className="font-medium">{h}{ampm}</span>.
                    {' '}That&apos;s when we schedule your posts for maximum reach.
                  </p>
                )
              })()}
            </div>
          )}
        </>
      )}

      {/* ── Section 9: Monthly reports (always shown) ── */}
      {reports.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-ink-4" /> Monthly reports
          </h2>
          <div className="space-y-2">
            {reports.map(report => (
              <div key={report.id} className="bg-white rounded-xl border border-ink-6 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-ink-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {MONTH_FULL[report.month - 1]} {report.year}
                  </p>
                  {report.summary && (
                    <p className="text-xs text-ink-3 truncate mt-0.5">{report.summary}</p>
                  )}
                </div>
                {report.pdf_url && (
                  <a
                    href={report.pdf_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-ink-3 hover:text-brand flex items-center gap-1 transition-colors flex-shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" /> PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Big stat card ────────────────────────────────────────── */

function BigStat({
  icon: Icon, value, label, change, sub, sparkData, sparkColor, pills,
}: {
  icon: typeof Eye
  value: string
  label: string
  change?: { text: string; direction: 'up' | 'down' | 'flat' }
  sub?: string
  sparkData?: number[]
  sparkColor?: string
  pills?: string[]
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4 flex flex-col">
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center">
          <Icon className="w-4 h-4 text-ink-3" />
        </div>
        {sparkData && sparkData.some(v => v > 0) && (
          <Sparkline
            data={sparkData}
            width={64}
            height={24}
            color={sparkColor || (change?.direction === 'down' ? '#ef4444' : '#4abd98')}
          />
        )}
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink mt-auto">{value}</div>
      <p className="text-[11px] text-ink-3 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-ink-4 mt-0.5">{sub}</p>}
      {change && (
        <p className={`text-[10px] font-medium mt-1 flex items-center gap-0.5 ${
          change.direction === 'up' ? 'text-emerald-600' :
          change.direction === 'down' ? 'text-red-600' :
          'text-ink-4'
        }`}>
          {change.direction === 'up' && <TrendingUp className="w-3 h-3" />}
          {change.direction === 'down' && <TrendingDown className="w-3 h-3" />}
          {change.text}
        </p>
      )}
      {pills && pills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {pills.map(p => (
            <span key={p} className="text-[9px] text-ink-4 bg-bg-2 px-1.5 py-0.5 rounded">
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
