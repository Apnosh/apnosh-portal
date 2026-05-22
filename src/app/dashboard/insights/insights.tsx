'use client'

import { TrendingUp, TrendingDown, ArrowRight, Brain, BarChart3, Clock, Layers, Hash, Users, MousePointerClick, Globe as GlobeIcon, DollarSign, Mail, Video, Star, Send } from 'lucide-react'

// ── Mini SVG Sparkline ───────────────────────────────────────────────

function Sparkline({ data, color = '#2e9a78', height = 32, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)

  const points = data.map((v, i) => ({
    x: i * step,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      ))}
    </svg>
  )
}

// ── Mini Bar Chart ───────────────────────────────────────────────────

function MiniBarChart({ data, highlightIndex }: { data: { label: string; value: number }[]; highlightIndex: number }) {
  const max = Math.max(...data.map(d => d.value))
  return (
    <div className="flex items-end gap-1 h-10">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
          <div
            className={`w-full rounded-sm transition-all ${i === highlightIndex ? 'bg-brand-dark' : 'bg-ink-6'}`}
            style={{ height: `${(d.value / max) * 100}%`, minHeight: 3 }}
          />
          <span className="text-[9px] text-ink-4 leading-none">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Ranked List ──────────────────────────────────────────────────────

function RankedList({ items }: { items: { label: string; value: number }[] }) {
  const max = items[0]?.value ?? 1
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] text-ink-4 w-4 text-right">{i + 1}.</span>
          <div className="flex-1 h-5 bg-bg-2 rounded-full overflow-hidden relative">
            <div
              className="h-full rounded-full bg-brand/20"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-ink-2">
              {item.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Data ─────────────────────────────────────────────────────────────

const dayEngagement = [
  { label: 'Mon', value: 62 },
  { label: 'Tue', value: 94 },
  { label: 'Wed', value: 71 },
  { label: 'Thu', value: 68 },
  { label: 'Fri', value: 55 },
  { label: 'Sat', value: 45 },
  { label: 'Sun', value: 40 },
]

const hourReach = [
  { label: '8am', value: 420 },
  { label: '10am', value: 890 },
  { label: '12pm', value: 670 },
  { label: '2pm', value: 540 },
  { label: '4pm', value: 480 },
  { label: '6pm', value: 620 },
]

const contentTypeRank = [
  { label: 'Carousels', value: 92 },
  { label: 'Reels', value: 78 },
  { label: 'Feed Posts', value: 55 },
  { label: 'Stories', value: 40 },
]

const topicPerformance = [
  { label: 'Behind the scenes', rate: '8.2%' },
  { label: 'Food photography', rate: '6.4%' },
  { label: 'Customer spotlights', rate: '5.8%' },
  { label: 'Promotions', rate: '3.1%' },
]

const topHashtags = [
  { tag: '#AustinFood', reach: '4.2K' },
  { tag: '#FoodTok', reach: '3.8K' },
  { tag: '#ApnoshKitchen', reach: '2.9K' },
  { tag: '#ATXEats', reach: '2.4K' },
  { tag: '#FoodieFinds', reach: '1.9K' },
]

const monthlyTrends = [
  {
    label: 'Followers',
    value: '12,400',
    change: '+342 this month',
    percent: '+2.8%',
    up: true,
    icon: Users,
    sparkData: [11200, 11450, 11700, 11900, 12100, 12400],
  },
  {
    label: 'Engagement Rate',
    value: '5.2%',
    change: 'up from 4.4%',
    percent: '+18.2%',
    up: true,
    icon: MousePointerClick,
    sparkData: [3.8, 4.0, 4.2, 4.4, 4.8, 5.2],
  },
  {
    label: 'Website Clicks',
    value: '1,247',
    change: 'down from 1,285',
    percent: '-3.0%',
    up: false,
    icon: GlobeIcon,
    sparkData: [1100, 1190, 1310, 1285, 1260, 1247],
  },
  {
    label: 'Revenue Impact',
    value: '$4,150',
    change: 'up from $3,400',
    percent: '+22.1%',
    up: true,
    icon: DollarSign,
    sparkData: [2800, 3100, 3200, 3400, 3800, 4150],
  },
]

const recommendations = [
  {
    icon: BarChart3,
    color: 'bg-blue-50 text-blue-600',
    text: 'Your Tuesday posts consistently outperform. Consider shifting your best content to Tuesdays.',
    action: 'Apply',
  },
  {
    icon: Video,
    color: 'bg-purple-50 text-purple-600',
    text: 'Video content gets 3x more reach. We recommend increasing from 1 to 2 videos per week.',
    action: 'Learn more',
  },
  {
    icon: Star,
    color: 'bg-amber-50 text-amber-600',
    text: "You're 23 reviews away from your goal of 150. Activate the review request flow to accelerate.",
    action: 'Apply',
  },
  {
    icon: Send,
    color: 'bg-brand-tint text-brand-dark',
    text: 'Email open rates are 2x the industry average. This is a strong channel — consider adding a second weekly send.',
    action: 'Learn more',
  },
]

// ── Main Component ───────────────────────────────────────────────────

export default function AnalyticsInsights() {
  return (
    <div className="space-y-6">
      {/* ── Content Performance Insights ──────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Content Intelligence</h2>
            <p className="text-[11px] text-ink-4">AI-generated insights from your performance data</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Best Day */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-brand-dark" />
              <h3 className="text-sm font-medium text-ink">Best Day to Post</h3>
            </div>
            <p className="font-[family-name:var(--font-display)] text-xl text-ink">Tuesday</p>
            <p className="text-xs text-ink-4 mt-0.5 mb-3">35% higher engagement than average</p>
            <MiniBarChart data={dayEngagement} highlightIndex={1} />
          </div>

          {/* Best Time */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-brand-dark" />
              <h3 className="text-sm font-medium text-ink">Best Time to Post</h3>
            </div>
            <p className="font-[family-name:var(--font-display)] text-xl text-ink">10:00 AM</p>
            <p className="text-xs text-ink-4 mt-0.5 mb-3">Highest reach window</p>
            <MiniBarChart data={hourReach} highlightIndex={1} />
          </div>

          {/* Best Content Type */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-brand-dark" />
              <h3 className="text-sm font-medium text-ink">Best Content Type</h3>
            </div>
            <p className="font-[family-name:var(--font-display)] text-xl text-ink">Carousels</p>
            <p className="text-xs text-ink-4 mt-0.5 mb-3">2.3x more saves than single images</p>
            <RankedList items={contentTypeRank} />
          </div>

          {/* Best Topics */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-brand-dark" />
              <h3 className="text-sm font-medium text-ink">Best Topics</h3>
            </div>
            <div className="space-y-2.5">
              {topicPerformance.map((t, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-ink-2">{t.label}</span>
                  <span className="text-xs font-medium text-ink tabular-nums">{t.rate}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hashtag Performance */}
          <div className="bg-white rounded-xl border border-ink-6 p-5 sm:col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-4 h-4 text-brand-dark" />
              <h3 className="text-sm font-medium text-ink">Hashtag Performance</h3>
            </div>
            <p className="text-xs text-ink-4 mb-3">Top 5 hashtags by reach</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {topHashtags.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-ink-6 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-ink-4 w-4 text-right">{i + 1}.</span>
                    <span className="text-xs font-medium text-brand-dark">{h.tag}</span>
                  </div>
                  <span className="text-xs text-ink-3 tabular-nums">{h.reach} avg reach</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly Trends ────────────────────────────────────── */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Monthly Trends</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {monthlyTrends.map((t) => (
            <div key={t.label} className="bg-white rounded-xl border border-ink-6 p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <t.icon className="w-4 h-4 text-ink-4" />
                  <span className="text-xs text-ink-4">{t.label}</span>
                </div>
                <p className="font-[family-name:var(--font-display)] text-2xl text-ink">{t.value}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {t.up ? (
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-xs font-medium ${t.up ? 'text-emerald-600' : 'text-red-500'}`}>
                    {t.percent}
                  </span>
                  <span className="text-[11px] text-ink-4">{t.change}</span>
                </div>
              </div>
              <Sparkline
                data={t.sparkData}
                color={t.up ? '#2e9a78' : '#ef4444'}
                width={100}
                height={36}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Recommendations ───────────────────────────────────── */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Recommendations</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {recommendations.map((r, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 flex gap-4">
              <div className={`w-10 h-10 rounded-lg ${r.color} flex items-center justify-center flex-shrink-0`}>
                <r.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink-2 leading-relaxed">{r.text}</p>
                <button className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-brand-dark hover:underline">
                  {r.action} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
