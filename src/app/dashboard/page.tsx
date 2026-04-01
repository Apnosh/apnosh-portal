'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, Eye, Users, MousePointerClick, Heart,
  CheckCircle, Clock, AlertCircle, ArrowUpRight, Calendar, Star,
  Mail, Zap, ChevronRight, Camera, Globe, Video, Sparkles,
  DollarSign, Target, ShoppingBag, Gift, Flame, ArrowRight,
  CircleDot, Loader2, Package, FileCheck, MessageSquare,
  Lightbulb, BarChart3, MapPin, Phone, ExternalLink
} from 'lucide-react'

/* ================================================================== */
/*  MORNING BRIEFING DATA                                              */
/* ================================================================== */

const today = new Date()
const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })
const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const hour = today.getHours()
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

/* ── AI Morning Briefing ─────────────────────────────────────────── */
const aiBriefing = {
  summary: "Strong week overall. Your Instagram engagement is 42% above your industry average, and the spring collection posts are outperforming your usual content by 2.3x. Your Google Maps ranking improved to #2 — close to the top spot. One area to watch: website click-through from social dropped slightly. I'd recommend adding stronger CTAs to this week's posts.",
  topInsight: "Your Tuesday posts consistently get 35% more engagement than other days. We've shifted more high-value content to Tuesdays.",
  weeklyGrade: 'A-',
}

/* ── Revenue Impact (what they REALLY care about) ────────────────── */
const revenueImpact = {
  estimatedCustomers: { value: 23, change: '+8', up: true, label: 'Customers from Marketing', period: 'this month' },
  estimatedRevenue: { value: '$4,150', change: '+22%', up: true, label: 'Estimated Revenue Impact', period: 'this month' },
  costPerCustomer: { value: '$28', change: '-$4', up: true, label: 'Cost per Customer', period: 'vs last month' },
  roi: { value: '6.4x', change: '+0.8x', up: true, label: 'Marketing ROI', period: 'this month' },
}

/* ── Performance Pulse ───────────────────────────────────────────── */
const pulse = [
  { label: 'People Reached', value: '48.2K', change: '+18%', up: true, icon: Eye, benchmark: 'Industry avg: 32K', aboveBenchmark: true },
  { label: 'New Followers', value: '+342', change: '+24%', up: true, icon: Users, benchmark: '+89 this week', aboveBenchmark: true },
  { label: 'Engagement Rate', value: '5.2%', change: '+0.8%', up: true, icon: Heart, benchmark: 'Industry avg: 3.1%', aboveBenchmark: true },
  { label: 'Website Clicks', value: '1,247', change: '-3%', up: false, icon: MousePointerClick, benchmark: 'Goal: 1,500/mo', aboveBenchmark: false },
  { label: 'Google Maps Views', value: '2,840', change: '+31%', up: true, icon: MapPin, benchmark: 'Rank: #2', aboveBenchmark: true },
  { label: 'Email Open Rate', value: '42%', change: '+5%', up: true, icon: Mail, benchmark: 'Industry avg: 21%', aboveBenchmark: true },
]

/* ── Production Pipeline Status ──────────────────────────────────── */
const pipeline = {
  inProgress: [
    { title: '4x Instagram Feed Posts (Week 13)', assignee: 'Sarah K.', dueIn: '2 days', type: 'Social Media' },
    { title: 'Email Newsletter #13', assignee: 'Mike R.', dueIn: '3 days', type: 'Email' },
    { title: 'TikTok Recipe Reel', assignee: 'Jordan L.', dueIn: '4 days', type: 'Video' },
  ],
  needsApproval: [
    { title: 'Instagram Carousel — Spring Menu', platform: 'Instagram', submitted: '2 hours ago', deadline: 'Approve by noon today' },
    { title: 'Facebook Event Banner', platform: 'Facebook', submitted: '5 hours ago', deadline: 'Approve by tomorrow' },
    { title: 'Weekly Story Templates (5)', platform: 'Instagram', submitted: 'Yesterday', deadline: 'Approve by Wednesday' },
  ],
  recentlyCompleted: [
    { title: 'March Content Calendar', completedAt: 'Today', result: 'Scheduled 24 posts across 3 platforms' },
    { title: 'Google Business Profile Update', completedAt: 'Yesterday', result: 'Added spring hours + 12 new photos' },
  ],
}

/* ── Upcoming Opportunities ──────────────────────────────────────── */
const opportunities = [
  { date: 'Mar 28', event: 'National Mom & Pop Business Day', suggestion: 'Share your origin story — behind-the-scenes content performs 3x better', daysAway: 4, icon: '🏪' },
  { date: 'Apr 1', event: 'April Fools\' Day', suggestion: 'Fun prank post or "fake menu item" reveal — great for engagement', daysAway: 8, icon: '🤡' },
  { date: 'Apr 7', event: 'National Beer Day', suggestion: 'Perfect tie-in with your cocktail program — feature your craft beer selection', daysAway: 14, icon: '🍺' },
  { date: 'Apr 22', event: 'Earth Day', suggestion: 'Highlight sustainability practices — sourcing, composting, local ingredients', daysAway: 29, icon: '🌍' },
]

/* ── Top Performing Content ──────────────────────────────────────── */
const topContent = [
  { rank: 1, title: 'Spring Collection Launch Carousel', platform: 'Instagram', icon: Camera, color: 'text-pink-500', reach: '4,200', engagement: '7.4%', saves: 89, insight: 'Carousels with 5+ slides get 2x more saves' },
  { rank: 2, title: 'Behind the Scenes Kitchen Reel', platform: 'TikTok', icon: Video, color: 'text-ink', reach: '3,800', engagement: '8.2%', saves: 124, insight: 'BTS content is your highest-performing category' },
  { rank: 3, title: 'St. Patrick\'s Day Promo', platform: 'Facebook', icon: Globe, color: 'text-blue-500', reach: '2,800', engagement: '5.1%', saves: 42, insight: 'Holiday tie-ins drive 35% more clicks' },
]

/* ── Google Reviews ──────────────────────────────────────────────── */
const reviews = {
  total: 127, average: 4.8, newThisWeek: 3, needsResponse: 1, goal: 150,
  latest: { stars: 5, text: '"The best Indian food in Austin. The tasting menu was incredible and the service was outstanding..."', author: 'Michael T.', daysAgo: 1 },
}

/* ── Quick Wins (AI-suggested micro-actions) ─────────────────────── */
const quickWins = [
  { id: 1, icon: '⭐', action: 'Reply to Michael T.\'s 5-star review', detail: 'A quick thank-you reply boosts your review visibility by 12%', effort: '2 min', impact: 'high', link: '#' },
  { id: 2, icon: '📱', action: 'Share today\'s Instagram post to your personal page', detail: 'Personal shares get 3x more reach than business-only posts', effort: '30 sec', impact: 'medium', link: '#' },
  { id: 3, icon: '📸', action: 'Take 3 behind-the-scenes photos today', detail: 'BTS is your highest-performing content category — feed the pipeline', effort: '5 min', impact: 'high', link: '#' },
  { id: 4, icon: '🕐', action: 'Update Google Business hours for spring', detail: 'Extended hours not reflected online — you may be losing walk-ins', effort: '3 min', impact: 'high', link: '#' },
]

/* ── Customer Activity (marketing → real customers) ──────────────── */
const customerActivity = {
  thisWeek: {
    calls: 18,
    callsChange: '+4',
    directions: 42,
    directionsChange: '+11',
    websiteForms: 7,
    formsChange: '+2',
    bookings: 12,
    bookingsChange: '+3',
  },
  recentLeads: [
    { name: 'Sarah M.', source: 'Instagram DM', time: '2h ago', action: 'Asked about catering' },
    { name: 'James R.', source: 'Google Search', time: '5h ago', action: 'Booked table for 6' },
    { name: 'Priya K.', source: 'Email click', time: 'Yesterday', action: 'Viewed spring menu' },
  ]
}

/* ── Monthly Delivery Tracker ────────────────────────────────────── */
const deliveryTracker = {
  posts: { delivered: 14, total: 20, label: 'Social Posts' },
  stories: { delivered: 18, total: 24, label: 'Stories' },
  emails: { delivered: 3, total: 4, label: 'Email Campaigns' },
  seoUpdates: { delivered: 2, total: 3, label: 'SEO Updates' },
}

/* ── Today's Schedule ────────────────────────────────────────────── */
const todaySchedule = [
  { time: '10:00 AM', platform: 'Instagram', icon: Camera, color: 'bg-pink-50 text-pink-500', title: 'Customer Spotlight Post', status: 'scheduled' },
  { time: '12:30 PM', platform: 'Facebook', icon: Globe, color: 'bg-blue-50 text-blue-500', title: 'Lunch Special Promo', status: 'scheduled' },
  { time: '3:00 PM', platform: 'TikTok', icon: Video, color: 'bg-bg-2 text-ink', title: 'Recipe Tutorial Reel', status: 'pending_approval' },
  { time: '5:00 PM', platform: 'Email', icon: Mail, color: 'bg-purple-50 text-purple-500', title: 'Weekly Newsletter Send', status: 'scheduled' },
]

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function DashboardPage() {
  const [briefingExpanded, setBriefingExpanded] = useState(false)
  const [showAllOpportunities, setShowAllOpportunities] = useState(false)

  const displayedOpportunities = showAllOpportunities ? opportunities : opportunities.slice(0, 2)

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* ── GREETING + WEEKLY GRADE ──────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
            {greeting}, Matt
          </h1>
          <p className="text-ink-4 text-sm mt-0.5">{dayName}, {dateStr}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white border border-ink-6 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <div>
              <div className="text-[10px] text-ink-4 uppercase tracking-wider font-medium">This Week</div>
              <div className="font-[family-name:var(--font-display)] text-2xl text-brand-dark leading-none">{aiBriefing.weeklyGrade}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI MORNING BRIEFING ──────────────────────────────────── */}
      <div className="bg-gradient-to-br from-ink to-ink-2 rounded-xl p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-brand/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-brand" />
            </div>
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">AI Marketing Briefing</span>
          </div>
          <p className={`text-sm text-white/80 leading-relaxed ${briefingExpanded ? '' : 'line-clamp-2'}`}>
            {aiBriefing.summary}
          </p>
          <button onClick={() => setBriefingExpanded(!briefingExpanded)} className="text-xs text-brand font-medium mt-2 hover:text-brand/80 transition-colors">
            {briefingExpanded ? 'Show less' : 'Read full briefing →'}
          </button>
          {briefingExpanded && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-white/60"><span className="text-white/80 font-medium">Key Insight:</span> {aiBriefing.topInsight}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── REVENUE IMPACT (what actually matters) ───────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-green-600" />
          <h2 className="font-[family-name:var(--font-display)] text-base text-ink">Revenue Impact</h2>
          <span className="text-[10px] text-ink-4 bg-bg-2 px-2 py-0.5 rounded-full">This month</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.values(revenueImpact).map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-ink-4">{stat.label}</span>
                <span className={`text-[11px] font-medium flex items-center gap-0.5 ${stat.up ? 'text-green-600' : 'text-red-500'}`}>
                  {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {stat.change}
                </span>
              </div>
              <div className="font-[family-name:var(--font-display)] text-2xl text-ink leading-none">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── NEEDS YOUR ATTENTION ─────────────────────────────────── */}
      {pipeline.needsApproval.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-3 bg-amber-50/50 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <h2 className="font-[family-name:var(--font-display)] text-sm text-ink">Needs Your Approval</h2>
              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pipeline.needsApproval.length}</span>
            </div>
            <Link href="/dashboard/approvals" className="text-[11px] text-amber-700 font-medium hover:underline">Review all →</Link>
          </div>
          <div className="divide-y divide-ink-6">
            {pipeline.needsApproval.map((item, i) => (
              <Link key={i} href="/dashboard/approvals" className="flex items-center gap-4 px-5 py-3 hover:bg-amber-50/30 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <FileCheck className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <p className="text-[11px] text-ink-4">{item.platform} · Submitted {item.submitted}</p>
                </div>
                <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full flex-shrink-0">{item.deadline}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── PERFORMANCE + PRODUCTION (side by side) ──────────────── */}
      <div className="grid lg:grid-cols-5 gap-4">

        {/* Performance Pulse */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand-dark" />
              <h2 className="font-[family-name:var(--font-display)] text-base text-ink">Performance Pulse</h2>
            </div>
            <Link href="/dashboard/analytics" className="text-[11px] text-brand-dark font-medium hover:underline flex items-center gap-1">
              Full analytics <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {pulse.map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon className="w-3.5 h-3.5 text-ink-4" />
                  <span className={`text-[10px] font-medium flex items-center gap-0.5 ${stat.up ? 'text-green-600' : 'text-red-500'}`}>
                    {stat.up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {stat.change}
                  </span>
                </div>
                <div className="font-[family-name:var(--font-display)] text-xl text-ink leading-none">{stat.value}</div>
                <div className="text-[10px] text-ink-4 mt-1">{stat.label}</div>
                <div className={`text-[9px] mt-1.5 px-1.5 py-0.5 rounded-full inline-block ${stat.aboveBenchmark ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                  {stat.benchmark}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Production Pipeline */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-500" />
              <h2 className="font-[family-name:var(--font-display)] text-base text-ink">In Production</h2>
            </div>
            <span className="text-[11px] text-ink-4">{pipeline.inProgress.length} active</span>
          </div>

          {/* In Progress */}
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            {pipeline.inProgress.map((item, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-ink-6' : ''}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink truncate">{item.title}</p>
                  <p className="text-[10px] text-ink-4">{item.assignee} · Due in {item.dueIn}</p>
                </div>
                <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0">{item.type}</span>
              </div>
            ))}
          </div>

          {/* Recently Completed */}
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="px-4 py-2 border-b border-ink-6">
              <span className="text-[10px] text-green-600 font-medium uppercase tracking-wider flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Recently Completed
              </span>
            </div>
            {pipeline.recentlyCompleted.map((item, i) => (
              <div key={i} className={`px-4 py-2.5 ${i > 0 ? 'border-t border-ink-6' : ''}`}>
                <p className="text-xs font-medium text-ink">{item.title}</p>
                <p className="text-[10px] text-ink-4 mt-0.5">{item.completedAt} · {item.result}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TOP CONTENT + TODAY'S SCHEDULE ────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-4">

        {/* Top Content This Month */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <h2 className="font-[family-name:var(--font-display)] text-sm text-ink">Top Performing Content</h2>
            </div>
            <Link href="/dashboard/analytics" className="text-[11px] text-brand-dark font-medium hover:underline">See all →</Link>
          </div>
          {topContent.map((post, i) => (
            <div key={i} className={`flex items-center gap-3 px-5 py-3 ${i > 0 ? 'border-t border-ink-6' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-bg-2 flex items-center justify-center font-[family-name:var(--font-display)] text-xs text-ink-3 flex-shrink-0">
                #{post.rank}
              </div>
              <post.icon className={`w-4 h-4 ${post.color} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{post.title}</p>
                <p className="text-[10px] text-ink-4 mt-0.5">
                  <span className="text-ink-3 font-medium">{post.reach}</span> reached · <span className="text-ink-3 font-medium">{post.engagement}</span> eng · <span className="text-ink-3 font-medium">{post.saves}</span> saves
                </p>
              </div>
              <div className="hidden sm:block max-w-[180px]">
                <p className="text-[10px] text-brand-dark bg-brand-tint px-2 py-1 rounded-md leading-tight">💡 {post.insight}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-3">

          {/* Today's Schedule */}
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-ink-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <h2 className="font-[family-name:var(--font-display)] text-sm text-ink">Today</h2>
              </div>
              <span className="text-[10px] text-ink-4">{todaySchedule.length} posts</span>
            </div>
            {todaySchedule.map((post, i) => (
              <div key={i} className={`flex items-center gap-2.5 px-4 py-2 ${i > 0 ? 'border-t border-ink-6' : ''}`}>
                <span className="text-[10px] text-ink-4 w-14 flex-shrink-0 font-mono">{post.time}</span>
                <div className={`w-5 h-5 rounded ${post.color} flex items-center justify-center flex-shrink-0`}>
                  <post.icon className="w-3 h-3" />
                </div>
                <p className="text-xs text-ink truncate flex-1">{post.title}</p>
                {post.status === 'pending_approval' && (
                  <span className="text-[8px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0">APPROVE</span>
                )}
              </div>
            ))}
            <Link href="/dashboard/calendar" className="block px-4 py-2 text-[10px] text-brand-dark font-medium hover:bg-bg-2/50 transition-colors border-t border-ink-6 text-center">
              Full calendar →
            </Link>
          </div>

          {/* Google Reviews */}
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <h2 className="font-[family-name:var(--font-display)] text-sm text-ink">Google Reviews</h2>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-[family-name:var(--font-display)] text-base text-ink">{reviews.average}</span>
                <div className="flex">{[1,2,3,4,5].map(s => <Star key={s} className={`w-2.5 h-2.5 ${s <= Math.round(reviews.average) ? 'text-amber-400 fill-amber-400' : 'text-ink-5'}`} />)}</div>
              </div>
            </div>
            {/* Progress to goal */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] text-ink-4 mb-1">
                <span>{reviews.total} reviews</span>
                <span>Goal: {reviews.goal}</span>
              </div>
              <div className="w-full h-1.5 bg-ink-6 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(reviews.total / reviews.goal) * 100}%` }} />
              </div>
            </div>
            {/* Latest review */}
            <div className="bg-bg-2 rounded-lg p-2.5 mb-2">
              <div className="flex items-center gap-1 mb-1">
                {[1,2,3,4,5].map(s => <Star key={s} className={`w-2.5 h-2.5 ${s <= reviews.latest.stars ? 'text-amber-400 fill-amber-400' : 'text-ink-5'}`} />)}
                <span className="text-[10px] text-ink-4 ml-1">{reviews.latest.daysAgo}d ago</span>
              </div>
              <p className="text-[11px] text-ink-3 line-clamp-2 italic">{reviews.latest.text}</p>
              <p className="text-[10px] text-ink-4 mt-1">— {reviews.latest.author}</p>
            </div>
            {reviews.needsResponse > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2">
                <MessageSquare className="w-3 h-3 text-amber-600" />
                <span className="text-[11px] text-amber-700 font-medium">{reviews.needsResponse} review needs your response</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CUSTOMER ACTIVITY (marketing → real customers) ─────────── */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-green-600" />
              <h2 className="font-[family-name:var(--font-display)] text-sm text-ink">Customer Activity</h2>
              <span className="text-[10px] text-ink-4 bg-bg-2 px-1.5 py-0.5 rounded-full">This week</span>
            </div>
          </div>
          {/* Activity metrics */}
          <div className="grid grid-cols-4 border-b border-ink-6">
            {[
              { label: 'Phone Calls', value: customerActivity.thisWeek.calls, change: customerActivity.thisWeek.callsChange, icon: Phone },
              { label: 'Directions', value: customerActivity.thisWeek.directions, change: customerActivity.thisWeek.directionsChange, icon: MapPin },
              { label: 'Form Fills', value: customerActivity.thisWeek.websiteForms, change: customerActivity.thisWeek.formsChange, icon: FileCheck },
              { label: 'Bookings', value: customerActivity.thisWeek.bookings, change: customerActivity.thisWeek.bookingsChange, icon: Calendar },
            ].map((m, i) => (
              <div key={i} className={`p-3 text-center ${i > 0 ? 'border-l border-ink-6' : ''}`}>
                <m.icon className="w-3.5 h-3.5 text-ink-4 mx-auto mb-1" />
                <div className="font-[family-name:var(--font-display)] text-lg text-ink leading-none">{m.value}</div>
                <div className="text-[10px] text-green-600 font-medium">{m.change}</div>
                <div className="text-[9px] text-ink-4 mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
          {/* Recent leads */}
          <div className="px-5 py-2 border-b border-ink-6">
            <span className="text-[10px] text-ink-4 uppercase tracking-wider font-medium">Recent Leads</span>
          </div>
          {customerActivity.recentLeads.map((lead, i) => (
            <div key={i} className={`flex items-center gap-3 px-5 py-2.5 ${i > 0 ? 'border-t border-ink-6' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-brand-tint flex items-center justify-center text-[10px] font-bold text-brand-dark flex-shrink-0">
                {lead.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink">{lead.name} <span className="font-normal text-ink-4">· {lead.action}</span></p>
                <p className="text-[10px] text-ink-4">via {lead.source} · {lead.time}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Monthly Delivery Tracker + Quick Wins */}
        <div className="lg:col-span-2 space-y-3">

          {/* What you're getting this month */}
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-dark" />
                <h2 className="font-[family-name:var(--font-display)] text-sm text-ink">March Delivery</h2>
              </div>
              <span className="text-[10px] text-ink-4">What&apos;s included in your plan</span>
            </div>
            <div className="space-y-2.5">
              {Object.values(deliveryTracker).map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-ink-2">{item.label}</span>
                    <span className="text-[11px] font-medium text-ink">{item.delivered}/{item.total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-ink-6 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${item.delivered / item.total >= 1 ? 'bg-green-500' : item.delivered / item.total >= 0.5 ? 'bg-brand' : 'bg-amber-400'}`}
                      style={{ width: `${(item.delivered / item.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Wins */}
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-ink-6 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h2 className="font-[family-name:var(--font-display)] text-sm text-ink">Quick Wins</h2>
              <span className="text-[9px] text-ink-4 bg-bg-2 px-1.5 py-0.5 rounded-full">AI suggested</span>
            </div>
            {quickWins.slice(0, 3).map((win, i) => (
              <div key={win.id} className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-bg-2/50 transition-colors ${i > 0 ? 'border-t border-ink-6' : ''}`}>
                <span className="text-sm flex-shrink-0">{win.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink">{win.action}</p>
                  <p className="text-[10px] text-ink-4 mt-0.5 leading-relaxed">{win.detail}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-ink-4 bg-bg-2 px-1.5 py-0.5 rounded-full">{win.effort}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${win.impact === 'high' ? 'text-green-600 bg-green-50' : 'text-blue-600 bg-blue-50'}`}>{win.impact} impact</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── UPCOMING OPPORTUNITIES ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-purple-500" />
            <h2 className="font-[family-name:var(--font-display)] text-sm text-ink">Upcoming Opportunities</h2>
            <span className="text-[10px] text-ink-4">Holidays & content moments</span>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink-6">
          {displayedOpportunities.map((opp, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3">
              <div className="text-xl flex-shrink-0 mt-0.5">{opp.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-ink">{opp.event}</p>
                  <span className="text-[9px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">in {opp.daysAway} days</span>
                </div>
                <p className="text-xs text-ink-3 mt-1 leading-relaxed">💡 {opp.suggestion}</p>
              </div>
            </div>
          ))}
        </div>
        {opportunities.length > 2 && (
          <button onClick={() => setShowAllOpportunities(!showAllOpportunities)} className="w-full px-5 py-2.5 text-xs text-purple-600 font-medium hover:bg-purple-50/30 transition-colors border-t border-ink-6">
            {showAllOpportunities ? 'Show less' : `Show ${opportunities.length - 2} more opportunities`}
          </button>
        )}
      </div>

      {/* ── QUICK LINKS ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Order Content', icon: ShoppingBag, href: '/dashboard/orders', color: 'text-brand-dark' },
          { label: 'AI Tools', icon: Sparkles, href: '/dashboard/tools', color: 'text-purple-600' },
          { label: 'Message Team', icon: Mail, href: '/dashboard/messages', color: 'text-pink-600' },
          { label: 'Update Profile', icon: Target, href: '/dashboard/profile', color: 'text-blue-600' },
        ].map((link) => (
          <Link key={link.label} href={link.href}
            className="flex items-center gap-2.5 bg-white rounded-xl border border-ink-6 px-4 py-3 hover:shadow-sm hover:border-brand/20 transition-all group">
            <link.icon className={`w-4 h-4 ${link.color}`} />
            <span className="text-xs font-medium text-ink-2 group-hover:text-ink transition-colors">{link.label}</span>
            <ChevronRight className="w-3 h-3 text-ink-5 ml-auto group-hover:text-brand-dark transition-colors" />
          </Link>
        ))}
      </div>

    </div>
  )
}
