'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle, ChevronRight, ArrowUpRight, ArrowDownRight,
  Clock, Star, Sparkles, TrendingUp, Eye,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser, useBusiness } from '@/lib/supabase/hooks'
import { LoadingSkeleton } from '@/components/ui/loading'

/* ================================================================== */
/*  TYPES                                                              */
/* ================================================================== */

interface ApprovalItem {
  id: string
  title: string
  platform: string
  platformIcon: string
  submittedAgo: string
  deadlineLabel: string
  deadlineUrgency: 'today' | 'tomorrow' | 'later'
}

interface QuickWin {
  emoji: string
  title: string
  description: string
  time: string
  impact: 'high' | 'medium'
  href: string
}

interface RevenueCard {
  label: string
  value: string
  trend: string
  trendUp: boolean
}

interface ActivityStat {
  emoji: string
  label: string
  value: number
  change: number
}

interface RecentActivity {
  id: string
  initials: string
  color: string
  description: string
  actionType: string
  timeAgo: string
}

interface ScheduleItem {
  id: string
  time: string
  emoji: string
  title: string
  needsApproval?: boolean
}

interface DeliveryItem {
  label: string
  delivered: number
  total: number
}

interface ReviewData {
  rating: number
  count: number
  goal: number
  needsResponse: number
  latest: { stars: number; text: string; author: string; timeAgo: string } | null
}

interface Opportunity {
  emoji: string
  name: string
  daysAway: number
  suggestion: string
}

interface BriefingData {
  text: string
  hasData: boolean
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ================================================================== */
/*  HELPERS                                                            */
/* ================================================================== */

function timeOfDayGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const mins = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100)
}

function platformEmoji(platform: string): string {
  const map: Record<string, string> = {
    instagram: '\uD83D\uDCF8',
    facebook: '\uD83C\uDF10',
    tiktok: '\uD83C\uDFAC',
    linkedin: '\uD83D\uDCBC',
    twitter: '\uD83D\uDCAC',
    youtube: '\u25B6\uFE0F',
    google_business: '\uD83D\uDCCD',
    website: '\uD83C\uDF10',
    email: '\uD83D\uDCE7',
  }
  return map[platform] || '\uD83D\uDCCB'
}

function deadlineFromCreatedAt(createdAt: string): { label: string; urgency: 'today' | 'tomorrow' | 'later' } {
  const created = new Date(createdAt)
  const deadline = new Date(created.getTime() + 48 * 60 * 60 * 1000) // 48h window
  const now = new Date()
  const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursLeft <= 0) return { label: 'Overdue', urgency: 'today' }
  if (hoursLeft <= 12) return { label: 'Approve by tonight', urgency: 'today' }
  if (hoursLeft <= 24) return { label: 'Approve by tomorrow', urgency: 'tomorrow' }
  const day = deadline.toLocaleDateString('en-US', { weekday: 'long' })
  return { label: `Approve by ${day}`, urgency: 'later' }
}

/* ================================================================== */
/*  UPCOMING OPPORTUNITIES — static holidays + dynamic date math       */
/* ================================================================== */

const RESTAURANT_HOLIDAYS: { month: number; day: number; name: string; emoji: string; suggestion: string }[] = [
  { month: 1, day: 1, name: "New Year's Day", emoji: '\uD83C\uDF89', suggestion: 'New year, new menu teaser or resolution-themed content' },
  { month: 1, day: 24, name: 'National Compliment Day', emoji: '\uD83D\uDCAC', suggestion: 'Share your best customer compliments and reviews' },
  { month: 2, day: 9, name: 'National Pizza Day', emoji: '\uD83C\uDF55', suggestion: 'Feature your best pizza or a special pizza deal' },
  { month: 2, day: 14, name: "Valentine's Day", emoji: '\u2764\uFE0F', suggestion: "Promote your Valentine's dinner special or couples deal" },
  { month: 2, day: 17, name: "Presidents' Day", emoji: '\uD83C\uDDFA\uD83C\uDDF8', suggestion: 'Holiday weekend brunch or family meal special' },
  { month: 3, day: 1, name: 'National Peanut Butter Day', emoji: '\uD83E\uDD5C', suggestion: 'Feature a creative peanut butter dish or dessert' },
  { month: 3, day: 17, name: "St. Patrick's Day", emoji: '\u2618\uFE0F', suggestion: 'Green-themed specials or festive drinks' },
  { month: 3, day: 20, name: 'First Day of Spring', emoji: '\uD83C\uDF38', suggestion: 'Launch your spring menu with fresh, seasonal ingredients' },
  { month: 4, day: 1, name: "April Fools' Day", emoji: '\uD83E\uDD21', suggestion: 'Fun prank post or "fake menu item" reveal for engagement' },
  { month: 4, day: 7, name: 'National Beer Day', emoji: '\uD83C\uDF7A', suggestion: 'Highlight your beer selection or craft pairings' },
  { month: 4, day: 22, name: 'Earth Day', emoji: '\uD83C\uDF0D', suggestion: 'Share your sustainability practices or farm-to-table story' },
  { month: 5, day: 4, name: 'National Small Business Week', emoji: '\uD83D\uDED2', suggestion: 'Share your origin story \u2014 behind-the-scenes content performs 3x better' },
  { month: 5, day: 5, name: 'Cinco de Mayo', emoji: '\uD83C\uDF2E', suggestion: 'Special menu teaser or themed cocktail post' },
  { month: 5, day: 11, name: "Mother's Day", emoji: '\uD83D\uDC90', suggestion: "Promote Mother's Day brunch or gift cards" },
  { month: 5, day: 26, name: 'Memorial Day', emoji: '\uD83C\uDDFA\uD83C\uDDF8', suggestion: 'BBQ specials or outdoor dining promotion' },
  { month: 6, day: 15, name: "Father's Day", emoji: '\uD83D\uDC54', suggestion: "Father's Day dinner specials or meal combos" },
  { month: 6, day: 20, name: 'First Day of Summer', emoji: '\u2600\uFE0F', suggestion: 'Summer menu launch, patio dining, refreshing drink features' },
  { month: 7, day: 4, name: 'Independence Day', emoji: '\uD83C\uDF86', suggestion: 'July 4th specials, patriotic decor, or catering packages' },
  { month: 7, day: 30, name: 'National Cheesecake Day', emoji: '\uD83C\uDF70', suggestion: 'Feature your best dessert or a cheesecake special' },
  { month: 8, day: 13, name: 'National Filet Mignon Day', emoji: '\uD83E\uDD69', suggestion: "Highlight your steaks or chef's special cut" },
  { month: 9, day: 1, name: 'Labor Day', emoji: '\uD83C\uDFD6\uFE0F', suggestion: 'End-of-summer celebration menu or family meal deal' },
  { month: 9, day: 22, name: 'First Day of Fall', emoji: '\uD83C\uDF42', suggestion: 'Fall menu launch with seasonal ingredients and warm flavors' },
  { month: 10, day: 1, name: 'National Taco Day', emoji: '\uD83C\uDF2E', suggestion: 'Taco specials, build-your-own-taco content, or taco trivia' },
  { month: 10, day: 31, name: 'Halloween', emoji: '\uD83C\uDF83', suggestion: 'Spooky-themed menu, costume contest, or themed cocktails' },
  { month: 11, day: 11, name: "Veterans Day", emoji: '\uD83C\uDDFA\uD83C\uDDF8', suggestion: 'Veterans meal deal or thank-you post for service members' },
  { month: 11, day: 27, name: 'Thanksgiving', emoji: '\uD83E\uDD83', suggestion: 'Thanksgiving catering packages or gratitude post for customers' },
  { month: 11, day: 28, name: 'Black Friday', emoji: '\uD83D\uDED2', suggestion: 'Gift card promotions or special dining deals' },
  { month: 12, day: 1, name: 'Small Business Saturday', emoji: '\uD83C\uDFEA', suggestion: 'Shop local messaging, tell your small business story' },
  { month: 12, day: 21, name: 'First Day of Winter', emoji: '\u2744\uFE0F', suggestion: 'Winter comfort food specials, warm drinks, cozy atmosphere' },
  { month: 12, day: 25, name: 'Christmas Day', emoji: '\uD83C\uDF84', suggestion: 'Holiday catering, gift card push, or festive menu' },
  { month: 12, day: 31, name: "New Year's Eve", emoji: '\uD83C\uDF7E', suggestion: "NYE dinner reservations, party packages, or chef's tasting menu" },
]

function getUpcomingOpportunities(): Opportunity[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const results: (Opportunity & { date: Date })[] = []

  for (const h of RESTAURANT_HOLIDAYS) {
    // Check this year and next year
    for (const year of [currentYear, currentYear + 1]) {
      const date = new Date(year, h.month - 1, h.day)
      const diffMs = date.getTime() - now.getTime()
      const daysAway = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (daysAway > 0 && daysAway <= 45) {
        results.push({
          emoji: h.emoji,
          name: h.name,
          daysAway,
          suggestion: h.suggestion,
          date,
        })
      }
    }
  }

  results.sort((a, b) => a.date.getTime() - b.date.getTime())
  return results.slice(0, 6)
}

/* ================================================================== */
/*  COMPUTATION: AI Briefing from analytics_snapshots                  */
/* ================================================================== */

interface AnalyticsRow {
  platform: string
  date: string
  metrics: Record<string, any>
}

function computeBriefing(snapshots: AnalyticsRow[]): BriefingData {
  if (!snapshots || snapshots.length === 0) {
    return { text: '', hasData: false }
  }

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const thisWeek = snapshots.filter((s) => new Date(s.date) >= sevenDaysAgo)
  const lastWeek = snapshots.filter(
    (s) => new Date(s.date) >= fourteenDaysAgo && new Date(s.date) < sevenDaysAgo
  )

  if (thisWeek.length === 0) {
    return { text: '', hasData: false }
  }

  // Aggregate metrics by summing
  function sumMetric(rows: AnalyticsRow[], key: string): number {
    return rows.reduce((sum, r) => sum + (Number(r.metrics?.[key]) || 0), 0)
  }

  const metrics = ['reach', 'impressions', 'engagement_rate', 'website_clicks', 'followers_change']
  const metricLabels: Record<string, string> = {
    reach: 'reach',
    impressions: 'impressions',
    engagement_rate: 'engagement',
    website_clicks: 'website clicks',
    followers_change: 'new followers',
  }

  // Find biggest positive change and biggest dip
  let bestMetric = ''
  let bestChange = 0
  let worstMetric = ''
  let worstChange = Infinity

  for (const m of metrics) {
    const thisVal = sumMetric(thisWeek, m)
    const lastVal = sumMetric(lastWeek, m)
    if (lastVal === 0) continue
    const pctChange = Math.round(((thisVal - lastVal) / lastVal) * 100)
    if (pctChange > bestChange) {
      bestChange = pctChange
      bestMetric = m
    }
    if (pctChange < worstChange) {
      worstChange = pctChange
      worstMetric = m
    }
  }

  // Find top platform
  const platformReach: Record<string, number> = {}
  for (const s of thisWeek) {
    platformReach[s.platform] = (platformReach[s.platform] || 0) + (Number(s.metrics?.reach) || 0)
  }
  const topPlatform = Object.entries(platformReach).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const platformLabel = topPlatform.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  let text = ''
  if (bestMetric && bestChange > 0) {
    text = `Strong week \u2014 ${metricLabels[bestMetric]} up ${bestChange}% above last week`
    if (topPlatform) text += `, led by ${platformLabel}`
    text += '.'
  } else {
    text = 'Steady week across your marketing channels.'
  }

  if (worstMetric && worstChange < -5) {
    text += ` Area to watch: ${metricLabels[worstMetric]} dipped ${Math.abs(worstChange)}%.`
  }

  return { text, hasData: true }
}

/* ================================================================== */
/*  COMPUTATION: Quick Wins rules engine                               */
/* ================================================================== */

function computeQuickWins(
  reviewsUnresponded: number,
  todaySchedule: ScheduleItem[],
  approvedDeliverables: number,
): QuickWin[] {
  const wins: QuickWin[] = []

  if (reviewsUnresponded > 0) {
    wins.push({
      emoji: '\u2B50',
      title: `Reply to ${reviewsUnresponded} unresponded review${reviewsUnresponded > 1 ? 's' : ''}`,
      description: 'A quick thank-you reply boosts your review visibility by 12%',
      time: '2 min',
      impact: 'high',
      href: '/dashboard/tools',
    })
  }

  if (todaySchedule.length > 0) {
    wins.push({
      emoji: '\uD83D\uDCF1',
      title: "Share today\u2019s post to your personal page",
      description: 'Personal shares get 3x more reach than business-only posts',
      time: '30 sec',
      impact: 'medium',
      href: '/dashboard/tools',
    })
  }

  if (approvedDeliverables > 0) {
    wins.push({
      emoji: '\uD83D\uDCF8',
      title: 'Take 3 behind-the-scenes photos today',
      description: 'BTS content is your highest-performing content category',
      time: '5 min',
      impact: 'high',
      href: '/dashboard/tools',
    })
  }

  // Always offer a general tip if we have fewer than 3 wins
  if (wins.length < 3) {
    wins.push({
      emoji: '\uD83D\uDCA1',
      title: 'Update your Google Business Profile hours',
      description: 'Accurate hours improve your local search ranking',
      time: '3 min',
      impact: 'medium',
      href: '/dashboard/tools',
    })
  }

  return wins.slice(0, 3)
}

/* ================================================================== */
/*  COMPUTATION: Revenue Impact from orders                            */
/* ================================================================== */

function computeRevenue(
  thisMonthOrders: { total_price: number }[],
  lastMonthOrders: { total_price: number }[],
  monthlyCost: number,
): RevenueCard[] | null {
  if (thisMonthOrders.length === 0 && lastMonthOrders.length === 0) return null

  const thisCount = thisMonthOrders.length
  const lastCount = lastMonthOrders.length
  const thisRevenue = thisMonthOrders.reduce((s, o) => s + (o.total_price || 0), 0)
  const lastRevenue = lastMonthOrders.reduce((s, o) => s + (o.total_price || 0), 0)
  const costPerCustomer = thisCount > 0 ? Math.round(monthlyCost / thisCount) : 0
  const lastCostPerCustomer = lastCount > 0 ? Math.round(monthlyCost / lastCount) : 0
  const roi = monthlyCost > 0 ? (thisRevenue / monthlyCost) : 0
  const lastRoi = monthlyCost > 0 ? (lastRevenue / monthlyCost) : 0

  function trend(curr: number, prev: number, prefix = '', suffix = ''): { str: string; up: boolean } {
    const diff = curr - prev
    if (prev === 0) return { str: 'new', up: true }
    const pct = Math.round((diff / prev) * 100)
    return {
      str: `${diff >= 0 ? '+' : ''}${prefix}${suffix === '%' ? pct : diff}${suffix}`,
      up: diff >= 0,
    }
  }

  const countTrend = trend(thisCount, lastCount)
  const revTrend = trend(thisRevenue, lastRevenue, '', '%')
  const cpcTrend = trend(costPerCustomer, lastCostPerCustomer, '$')
  const roiTrend = trend(roi, lastRoi, '', 'x')

  return [
    { label: 'Customers from Marketing', value: String(thisCount), trend: countTrend.str, trendUp: countTrend.up },
    { label: 'Est. Revenue Impact', value: formatCurrency(thisRevenue), trend: revTrend.str, trendUp: revTrend.up },
    { label: 'Cost per Customer', value: thisCount > 0 ? `$${costPerCustomer}` : '$0', trend: cpcTrend.str, trendUp: !cpcTrend.up /* lower is better */ },
    { label: 'Marketing ROI', value: roi > 0 ? `${roi.toFixed(1)}x` : '0x', trend: roiTrend.str, trendUp: roiTrend.up },
  ]
}

/* ================================================================== */
/*  COMPUTATION: Customer Activity from analytics                      */
/* ================================================================== */

function computeActivity(
  thisWeekSnapshots: AnalyticsRow[],
  lastWeekSnapshots: AnalyticsRow[],
): ActivityStat[] | null {
  const gbpThis = thisWeekSnapshots.filter((s) => s.platform === 'google_business')
  const gbpLast = lastWeekSnapshots.filter((s) => s.platform === 'google_business')

  if (gbpThis.length === 0 && gbpLast.length === 0) return null

  function sum(rows: AnalyticsRow[], key: string): number {
    return rows.reduce((s, r) => s + (Number(r.metrics?.[key]) || 0), 0)
  }

  const stats: ActivityStat[] = [
    { emoji: '\uD83D\uDCDE', label: 'Phone Calls', value: sum(gbpThis, 'phone_calls'), change: sum(gbpThis, 'phone_calls') - sum(gbpLast, 'phone_calls') },
    { emoji: '\uD83D\uDCCD', label: 'Directions', value: sum(gbpThis, 'direction_requests'), change: sum(gbpThis, 'direction_requests') - sum(gbpLast, 'direction_requests') },
    { emoji: '\uD83D\uDCC4', label: 'Website Clicks', value: sum(gbpThis, 'website_clicks'), change: sum(gbpThis, 'website_clicks') - sum(gbpLast, 'website_clicks') },
    { emoji: '\uD83D\uDCC5', label: 'Bookings', value: sum(gbpThis, 'bookings'), change: sum(gbpThis, 'bookings') - sum(gbpLast, 'bookings') },
  ]

  // Only show if any stat has a non-zero value
  if (stats.every((s) => s.value === 0)) return null
  return stats
}

/* ================================================================== */
/*  COMPUTATION: Delivery Progress from deliverables                   */
/* ================================================================== */

const DELIVERABLE_TYPE_LABELS: Record<string, string> = {
  graphic: 'Social Posts',
  video: 'Reels & Videos',
  caption: 'Captions',
  email: 'Email Campaigns',
  seo: 'SEO Updates',
  website_page: 'Website Pages',
  branding: 'Branding Assets',
  photography: 'Photography',
}

// Plan allocations based on actual service tiers from services-data.json
// Maps plan_id (from subscriptions table) to expected monthly deliverables by type
const PLAN_ALLOCATIONS: Record<string, Record<string, number>> = {
  // Social Media Management tiers
  'social-essentials': { graphic: 12, email: 0, seo: 0, video: 0 },
  'social-starter': { graphic: 16, email: 0, seo: 0, video: 0 },
  'social-growth': { graphic: 20, video: 4, email: 0, seo: 0 },
  'social-enterprise': { graphic: 30, video: 8, email: 0, seo: 0 },
  // Local SEO tiers
  'seo-essentials': { seo: 2, graphic: 0, email: 0, video: 0 },
  'seo-growth': { seo: 4, graphic: 0, email: 0, video: 0 },
  'seo-domination': { seo: 6, graphic: 0, email: 0, video: 0 },
  // Email & SMS tiers
  'email-starter': { email: 2, graphic: 0, seo: 0, video: 0 },
  'email-growth': { email: 4, graphic: 0, seo: 0, video: 0 },
  'email-enterprise': { email: 8, graphic: 0, seo: 0, video: 0 },
}

// Fallback for plans not in the map
const DEFAULT_ALLOCATIONS: Record<string, number> = {
  graphic: 12,
  video: 2,
  email: 2,
  seo: 2,
}

function computeDeliveryProgress(
  deliverables: { type: string }[],
  subscriptions: { plan_id: string | null }[],
): DeliveryItem[] | null {
  if (subscriptions.length === 0) return null

  // Merge allocations from all active subscriptions
  const mergedAllocations: Record<string, number> = {}

  let hasKnownPlan = false
  for (const sub of subscriptions) {
    const planAlloc = sub.plan_id ? PLAN_ALLOCATIONS[sub.plan_id] : null
    if (planAlloc) {
      hasKnownPlan = true
      for (const [type, count] of Object.entries(planAlloc)) {
        mergedAllocations[type] = (mergedAllocations[type] || 0) + count
      }
    }
  }

  // Fall back to defaults if no known plans
  const allocations = hasKnownPlan ? mergedAllocations : DEFAULT_ALLOCATIONS

  const countByType: Record<string, number> = {}
  for (const d of deliverables) {
    countByType[d.type] = (countByType[d.type] || 0) + 1
  }

  const items: DeliveryItem[] = []
  for (const [type, total] of Object.entries(allocations)) {
    if (total === 0) continue // Skip types not included in the plan
    const delivered = countByType[type] || 0
    items.push({
      label: DELIVERABLE_TYPE_LABELS[type] || type,
      delivered,
      total,
    })
  }

  return items.length > 0 ? items : null
}

/* ================================================================== */
/*  COMPUTATION: Google Reviews from analytics                         */
/* ================================================================== */

function computeReviews(snapshots: AnalyticsRow[]): ReviewData | null {
  const gbp = snapshots
    .filter((s) => s.platform === 'google_business')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (gbp.length === 0) return null

  const latest = gbp[0]
  const rating = Number(latest.metrics?.review_rating) || 0
  const count = Number(latest.metrics?.review_count) || 0
  const needsResponse = Number(latest.metrics?.reviews_unresponded) || 0

  if (rating === 0 && count === 0) return null

  // Latest review text if available in metrics
  const latestReview = latest.metrics?.latest_review
    ? {
        stars: Number(latest.metrics.latest_review.stars) || 5,
        text: String(latest.metrics.latest_review.text || ''),
        author: String(latest.metrics.latest_review.author || 'Anonymous'),
        timeAgo: latest.metrics.latest_review.date ? timeAgo(latest.metrics.latest_review.date) : 'Recently',
      }
    : null

  return {
    rating,
    count,
    goal: 150,
    needsResponse,
    latest: latestReview,
  }
}

/* ================================================================== */
/*  DATA HOOK — all real queries                                       */
/* ================================================================== */

interface DashboardData {
  approvals: ApprovalItem[]
  briefing: BriefingData
  quickWins: QuickWin[]
  revenue: RevenueCard[] | null
  activity: ActivityStat[] | null
  recentActivity: RecentActivity[]
  schedule: ScheduleItem[]
  delivery: DeliveryItem[] | null
  reviews: ReviewData | null
  opportunities: Opportunity[]
  loading: boolean
}

function useDashboardData(businessId: string | undefined): DashboardData {
  const [data, setData] = useState<Omit<DashboardData, 'loading' | 'opportunities'>>({
    approvals: [],
    briefing: { text: '', hasData: false },
    quickWins: [],
    revenue: null,
    activity: null,
    recentActivity: [],
    schedule: [],
    delivery: null,
    reviews: null,
  })
  const [loading, setLoading] = useState(true)

  const opportunities = useMemo(() => getUpcomingOpportunities(), [])

  useEffect(() => {
    if (!businessId) {
      setLoading(false)
      return
    }
    let cancelled = false
    const supabase = createClient()

    async function fetchAll() {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [
        approvalsRes,
        analyticsRes,
        scheduleRes,
        monthDeliverablesRes,
        subscriptionsRes,
        thisMonthOrdersRes,
        lastMonthOrdersRes,
        activityLogRes,
        approvedCountRes,
      ] = await Promise.all([
        // 1. Approvals: deliverables needing client review
        supabase
          .from('deliverables')
          .select('id, title, type, created_at, content')
          .eq('business_id', businessId)
          .eq('status', 'client_review')
          .order('created_at', { ascending: false })
          .limit(5),

        // 2. Analytics snapshots: last 14 days, all platforms
        supabase
          .from('analytics_snapshots')
          .select('platform, date, metrics')
          .eq('business_id', businessId)
          .gte('date', fourteenDaysAgo)
          .order('date', { ascending: false }),

        // 3. Content calendar: today's scheduled items
        supabase
          .from('content_calendar')
          .select('id, platform, title, scheduled_at, status, deliverable_id')
          .eq('business_id', businessId)
          .gte('scheduled_at', todayStart)
          .lt('scheduled_at', todayEnd)
          .order('scheduled_at', { ascending: true }),

        // 4. Deliverables this month (for delivery progress)
        supabase
          .from('deliverables')
          .select('type, status')
          .eq('business_id', businessId)
          .in('status', ['approved', 'scheduled', 'published'])
          .gte('created_at', monthStart),

        // 5. Active subscriptions
        supabase
          .from('subscriptions')
          .select('id, plan_id, plan_name, plan_price, status')
          .eq('business_id', businessId)
          .eq('status', 'active'),

        // 6. This month's orders
        supabase
          .from('orders')
          .select('total_price, status')
          .eq('business_id', businessId)
          .in('status', ['completed', 'in_progress'])
          .gte('created_at', monthStart),

        // 7. Last month's orders (for trend comparison)
        supabase
          .from('orders')
          .select('total_price, status')
          .eq('business_id', businessId)
          .in('status', ['completed', 'in_progress'])
          .gte('created_at', lastMonthStart)
          .lt('created_at', monthStart),

        // 8. Recent activity log
        supabase
          .from('client_activity_log')
          .select('id, action_type, description, created_at')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(5),

        // 9. Count of recently approved deliverables (for quick wins)
        supabase
          .from('deliverables')
          .select('id')
          .eq('business_id', businessId)
          .eq('status', 'approved')
          .gte('created_at', sevenDaysAgo),
      ])

      if (cancelled) return

      // --- Process approvals ---
      const approvals: ApprovalItem[] = (approvalsRes.data || []).map((d) => {
        const platform = (d.content as any)?.platform
        const plat = platform
          ? platform.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          : d.type === 'email' ? 'Email'
          : d.type === 'video' ? 'TikTok'
          : 'Instagram'
        const { label, urgency } = deadlineFromCreatedAt(d.created_at)
        return {
          id: d.id,
          title: d.title,
          platform: plat,
          platformIcon: platformEmoji(platform || d.type || 'instagram'),
          submittedAgo: timeAgo(d.created_at),
          deadlineLabel: label,
          deadlineUrgency: urgency,
        }
      })

      // --- Process analytics ---
      const snapshots = (analyticsRes.data || []) as AnalyticsRow[]
      const briefing = computeBriefing(snapshots)

      const thisWeekSnapshots = snapshots.filter((s) => new Date(s.date) >= new Date(sevenDaysAgo))
      const lastWeekSnapshots = snapshots.filter(
        (s) => new Date(s.date) >= new Date(fourteenDaysAgo) && new Date(s.date) < new Date(sevenDaysAgo)
      )

      const activity = computeActivity(thisWeekSnapshots, lastWeekSnapshots)
      const reviews = computeReviews(snapshots)
      const reviewsUnresponded = reviews?.needsResponse || 0

      // --- Process schedule ---
      const schedule: ScheduleItem[] = (scheduleRes.data || []).map((c) => ({
        id: c.id,
        time: new Date(c.scheduled_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        emoji: platformEmoji(c.platform),
        title: c.title || 'Untitled post',
        needsApproval: c.status === 'draft',
      }))

      // --- Process delivery progress ---
      const activeSubs = (subscriptionsRes.data || []).map((s) => ({ plan_id: s.plan_id || null }))
      const delivery = computeDeliveryProgress(
        monthDeliverablesRes.data || [],
        activeSubs,
      )

      // --- Process revenue ---
      const monthlyCost = (subscriptionsRes.data || []).reduce(
        (s, sub) => s + (sub.plan_price || 0),
        0
      )
      const revenue = computeRevenue(
        thisMonthOrdersRes.data || [],
        lastMonthOrdersRes.data || [],
        monthlyCost,
      )

      // --- Process activity log as recent leads ---
      const AVATAR_COLORS = [
        'bg-pink-100 text-pink-700',
        'bg-blue-100 text-blue-700',
        'bg-amber-100 text-amber-700',
        'bg-green-100 text-green-700',
        'bg-purple-100 text-purple-700',
      ]
      const actionTypeLabel: Record<string, string> = {
        agreement_sent: 'Agreement sent',
        agreement_viewed: 'Agreement viewed',
        agreement_signed: 'Agreement signed',
        invoice_sent: 'Invoice sent',
        invoice_paid: 'Invoice paid',
        invoice_overdue: 'Invoice overdue',
        scope_change: 'Scope updated',
        note_added: 'Note added',
        status_change: 'Status changed',
        client_created: 'Account created',
        onboarding_completed: 'Onboarding complete',
      }
      const recentActivity: RecentActivity[] = (activityLogRes.data || []).map((entry, i) => {
        const desc = entry.description || actionTypeLabel[entry.action_type] || entry.action_type
        const words = desc.split(' ')
        const initials = words.length >= 2
          ? (words[0][0] + words[1][0]).toUpperCase()
          : desc.substring(0, 2).toUpperCase()
        return {
          id: entry.id,
          initials,
          color: AVATAR_COLORS[i % AVATAR_COLORS.length],
          description: desc,
          actionType: actionTypeLabel[entry.action_type] || entry.action_type.replace(/_/g, ' '),
          timeAgo: timeAgo(entry.created_at),
        }
      })

      // --- Quick Wins ---
      const quickWins = computeQuickWins(
        reviewsUnresponded,
        schedule,
        (approvedCountRes.data || []).length,
      )

      setData({
        approvals,
        briefing,
        quickWins,
        revenue,
        activity,
        recentActivity,
        schedule,
        delivery,
        reviews,
      })
      setLoading(false)
    }

    fetchAll()
    return () => { cancelled = true }
  }, [businessId])

  return { ...data, opportunities, loading }
}

/* ================================================================== */
/*  SKELETON LOADER                                                    */
/* ================================================================== */

function DashboardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 sm:px-6">
      <div className="pt-2">
        <LoadingSkeleton width="220px" height="32px" rounded="lg" />
        <div className="mt-2">
          <LoadingSkeleton width="160px" height="16px" rounded="md" />
        </div>
      </div>
      <LoadingSkeleton width="100%" height="100px" rounded="xl" />
      <LoadingSkeleton width="100%" height="140px" rounded="xl" />
      <LoadingSkeleton width="100%" height="200px" rounded="xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <LoadingSkeleton key={i} width="100%" height="100px" rounded="xl" />
        ))}
      </div>
    </div>
  )
}

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function DashboardPage() {
  const { data: user, loading: userLoading } = useUser()
  const { data: business, loading: bizLoading } = useBusiness()
  const {
    approvals, briefing, quickWins, revenue, activity,
    recentActivity, schedule, delivery, reviews, opportunities, loading: dataLoading,
  } = useDashboardData(business?.id)
  const [showMoreOpps, setShowMoreOpps] = useState(false)

  const loading = userLoading || bizLoading || dataLoading

  const firstName = useMemo(() => {
    if (!user?.full_name) return ''
    return user.full_name.split(' ')[0]
  }, [user?.full_name])

  const router = useRouter()

  // Redirect to onboarding if no business profile exists
  useEffect(() => {
    if (!loading && !business && user) {
      router.push('/onboarding')
    }
  }, [loading, business, user, router])

  if (loading || (!business && user)) return <DashboardSkeleton />

  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-4 sm:px-6 pb-24">

      {/* ── 1. GREETING ─────────────────────────────────────────── */}
      <div className="pt-1">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-3xl text-ink leading-tight">
          {timeOfDayGreeting()}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-ink-3 text-[15px] mt-1">{todayFormatted()}</p>
      </div>

      {/* ── 2. AI MARKETING BRIEFING ────────────────────────────── */}
      <div className="bg-[#1d1d1f] rounded-2xl p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand rounded-l-2xl" />
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-brand" />
          <span className="text-[11px] font-semibold tracking-widest text-brand uppercase">
            AI Marketing Briefing
          </span>
        </div>
        {briefing.hasData ? (
          <>
            <p className="text-white/90 text-[15px] leading-relaxed">{briefing.text}</p>
            <Link
              href="/dashboard/analytics"
              className="inline-flex items-center gap-1 text-brand text-sm mt-3 hover:text-brand-dark transition-colors"
            >
              Read full briefing
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </>
        ) : (
          <p className="text-white/60 text-[15px] leading-relaxed">
            We&rsquo;re gathering your marketing data. Your first briefing will appear here soon.
          </p>
        )}
      </div>

      {/* ── 3. NEEDS YOUR APPROVAL ──────────────────────────────── */}
      {approvals.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-base text-ink">
                Needs Your Approval
              </h2>
              <span className="bg-amber-100 text-amber-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                {approvals.length}
              </span>
            </div>
            <Link
              href="/dashboard/approvals"
              className="text-sm text-brand hover:text-brand-dark transition-colors"
            >
              Review all &rarr;
            </Link>
          </div>
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden divide-y divide-ink-6">
            {approvals.map((item) => (
              <Link
                key={item.id}
                href="/dashboard/approvals"
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-2/50 transition-colors group border-l-[3px] border-l-amber-400"
              >
                <span className="text-lg flex-shrink-0">{item.platformIcon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] text-ink font-medium truncate">{item.title}</p>
                  <p className="text-[12px] text-ink-3 mt-0.5">
                    {item.platform} &middot; {item.submittedAgo}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-medium px-2 py-1 rounded-full flex-shrink-0 ${
                    item.deadlineUrgency === 'today'
                      ? 'bg-red-50 text-red-600'
                      : item.deadlineUrgency === 'tomorrow'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-bg-2 text-ink-3'
                  }`}
                >
                  {item.deadlineLabel}
                </span>
                <ChevronRight className="w-4 h-4 text-ink-4 group-hover:text-ink-3 transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-base text-ink mb-3">
            Needs Your Approval
          </h2>
          <div className="bg-white rounded-xl border border-ink-6 px-4 py-6 text-center">
            <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <p className="text-[15px] text-ink font-medium">You&rsquo;re all caught up</p>
            <p className="text-[13px] text-ink-3 mt-0.5">
              Nothing needs your approval right now.
            </p>
          </div>
        </section>
      )}

      {/* ── 4. QUICK WINS ───────────────────────────────────────── */}
      {quickWins.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-[family-name:var(--font-display)] text-base text-ink">
              Quick Wins
            </h2>
            <span className="text-[11px] text-ink-4 bg-bg-2 px-2 py-0.5 rounded-full">
              AI suggested
            </span>
          </div>
          <div className="space-y-2.5">
            {quickWins.map((win) => (
              <Link
                key={win.title}
                href={win.href}
                className="flex items-start gap-3 bg-white rounded-xl border border-ink-6 px-4 py-3.5 hover:border-ink-5 transition-colors group"
              >
                <span className="text-xl mt-0.5 flex-shrink-0">{win.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] text-ink font-medium">{win.title}</p>
                  <p className="text-[13px] text-ink-3 mt-0.5 leading-snug">
                    {win.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-ink-4 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {win.time}
                    </span>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        win.impact === 'high'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {win.impact} impact
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-5 group-hover:text-ink-3 transition-colors mt-1 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 5. REVENUE IMPACT ───────────────────────────────────── */}
      {revenue ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[family-name:var(--font-display)] text-base text-ink">
              Revenue Impact
            </h2>
            <span className="text-[12px] text-ink-3">This month</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {revenue.map((card) => (
              <Link
                key={card.label}
                href="/dashboard/analytics"
                className="bg-white rounded-xl border border-ink-6 p-4 hover:border-ink-5 transition-colors group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[12px] font-medium flex items-center gap-1 ${
                      card.trendUp ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {card.trendUp ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {card.trend}
                  </span>
                </div>
                <div className="font-[family-name:var(--font-display)] text-2xl sm:text-[28px] text-ink leading-none mt-1">
                  {card.value}
                </div>
                <div className="text-[11px] text-ink-3 mt-1.5 leading-snug">{card.label}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-base text-ink mb-3">
            Revenue Impact
          </h2>
          <div className="bg-white rounded-xl border border-ink-6 px-4 py-6 text-center">
            <TrendingUp className="w-6 h-6 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] text-ink-3">
              Revenue tracking starts once your first order comes in.
            </p>
          </div>
        </section>
      )}

      {/* ── 6. CUSTOMER ACTIVITY + RECENT ACTIVITY ──────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-[family-name:var(--font-display)] text-base text-ink">
            Customer Activity
          </h2>
          <span className="text-[12px] text-ink-3">This week</span>
        </div>

        {activity ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            {activity.map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-ink-6 px-3.5 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{stat.emoji}</span>
                  <span className="font-[family-name:var(--font-display)] text-xl text-ink">
                    {stat.value}
                  </span>
                  {stat.change !== 0 && (
                    <span className={`text-[11px] font-medium ${stat.change > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {stat.change > 0 ? '+' : ''}{stat.change}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-3 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-ink-6 px-4 py-5 text-center mb-4">
            <p className="text-[13px] text-ink-3">
              Customer activity data appears here once your Google Business Profile is connected.
            </p>
          </div>
        )}

        {/* Recent activity */}
        {recentActivity.length > 0 && (
          <>
            <h3 className="text-[13px] font-semibold text-ink-2 uppercase tracking-wide mb-2">
              Recent Activity
            </h3>
            <div className="bg-white rounded-xl border border-ink-6 overflow-hidden divide-y divide-ink-6">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${entry.color}`}
                  >
                    {entry.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-ink">{entry.description}</p>
                    <p className="text-[11px] text-ink-4 mt-0.5">
                      {entry.actionType} &middot; {entry.timeAgo}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── 7. TODAY'S SCHEDULE ──────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-base text-ink">
              Today
            </h2>
            {schedule.length > 0 && (
              <span className="text-[11px] text-ink-4 bg-bg-2 px-2 py-0.5 rounded-full">
                {schedule.length} post{schedule.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <Link
            href="/dashboard/calendar"
            className="text-[12px] text-brand hover:text-brand-dark transition-colors"
          >
            Full calendar &rarr;
          </Link>
        </div>
        {schedule.length > 0 ? (
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden divide-y divide-ink-6">
            {schedule.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-[13px] text-ink-3 font-mono w-[76px] flex-shrink-0">
                  {item.time}
                </span>
                <span className="text-base flex-shrink-0">{item.emoji}</span>
                <p className="text-[14px] text-ink flex-1">{item.title}</p>
                {item.needsApproval && (
                  <Link
                    href="/dashboard/approvals"
                    className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors flex-shrink-0"
                  >
                    APPROVE
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-ink-6 px-4 py-5 text-center">
            <p className="text-[13px] text-ink-3">
              Nothing scheduled for today. Enjoy the break!
            </p>
          </div>
        )}
      </section>

      {/* ── 8. DELIVERY PROGRESS ────────────────────────────────── */}
      {delivery ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[family-name:var(--font-display)] text-base text-ink">
              {monthName} Delivery
            </h2>
            <span className="text-[12px] text-ink-3">What&rsquo;s included in your plan</span>
          </div>
          <div className="bg-white rounded-xl border border-ink-6 p-4 space-y-3.5">
            {delivery.map((item) => {
              const pct = item.total > 0 ? Math.round((item.delivered / item.total) * 100) : 0
              const dayOfMonth = new Date().getDate()
              const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
              const expectedPct = Math.round((dayOfMonth / daysInMonth) * 100)
              const behind = pct < expectedPct - 10

              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] text-ink">{item.label}</span>
                    <span className="text-[12px] text-ink-3 font-mono">
                      {item.delivered}/{item.total}
                    </span>
                  </div>
                  <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        behind ? 'bg-amber-400' : 'bg-brand'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* ── 9. GOOGLE REVIEWS ───────────────────────────────────── */}
      {reviews ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-base text-ink">
                Google Reviews
              </h2>
              <div className="flex items-center gap-1 text-amber-500">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className="w-3.5 h-3.5"
                    fill={s <= Math.round(reviews.rating) ? 'currentColor' : 'none'}
                  />
                ))}
              </div>
            </div>
            <Link
              href="/dashboard/tools"
              className="text-[12px] text-brand hover:text-brand-dark transition-colors"
            >
              See all reviews &rarr;
            </Link>
          </div>
          <div className="bg-white rounded-xl border border-ink-6 p-4">
            <div className="flex items-center gap-4 mb-3">
              <span className="font-[family-name:var(--font-display)] text-3xl text-ink">
                {reviews.rating.toFixed(1)}
              </span>
              <div>
                <p className="text-[13px] text-ink">{reviews.count} reviews</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="h-1.5 w-20 bg-bg-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full"
                      style={{ width: `${Math.min(Math.round((reviews.count / reviews.goal) * 100), 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-ink-4">Goal: {reviews.goal}</span>
                </div>
              </div>
            </div>

            {reviews.needsResponse > 0 && (
              <div className="bg-amber-50 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[12px] text-amber-700 font-medium">
                  {reviews.needsResponse} review{reviews.needsResponse > 1 ? 's' : ''} needs your response
                </span>
              </div>
            )}

            {reviews.latest && (
              <div className="border-t border-ink-6 pt-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex text-amber-500">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className="w-3 h-3"
                        fill={s <= reviews.latest!.stars ? 'currentColor' : 'none'}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-ink-4">
                    {reviews.latest.author} &middot; {reviews.latest.timeAgo}
                  </span>
                </div>
                <p className="text-[13px] text-ink-3 leading-snug line-clamp-2">
                  &ldquo;{reviews.latest.text}&rdquo;
                </p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-base text-ink mb-3">
            Google Reviews
          </h2>
          <div className="bg-white rounded-xl border border-ink-6 px-4 py-5 text-center">
            <Star className="w-6 h-6 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] text-ink-3">
              Connect your Google Business Profile to see your reviews here.
            </p>
          </div>
        </section>
      )}

      {/* ── 10. UPCOMING OPPORTUNITIES ──────────────────────────── */}
      {opportunities.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-[family-name:var(--font-display)] text-base text-ink">
              Upcoming Opportunities
            </h2>
            <span className="text-[11px] text-ink-4 bg-bg-2 px-2 py-0.5 rounded-full">
              Holidays &amp; content moments
            </span>
          </div>
          <div className="space-y-2.5">
            {opportunities.slice(0, showMoreOpps ? undefined : 2).map((opp) => (
              <div
                key={opp.name}
                className="bg-white rounded-xl border border-ink-6 px-4 py-3.5"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{opp.emoji}</span>
                    <span className="text-[15px] text-ink font-medium">{opp.name}</span>
                  </div>
                  <span className="text-[12px] text-ink-3 flex-shrink-0">
                    in {opp.daysAway} day{opp.daysAway !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-start gap-2 ml-8">
                  <TrendingUp className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
                  <p className="text-[13px] text-ink-3 leading-snug">{opp.suggestion}</p>
                </div>
              </div>
            ))}
          </div>
          {opportunities.length > 2 && !showMoreOpps && (
            <button
              onClick={() => setShowMoreOpps(true)}
              className="text-[13px] text-brand hover:text-brand-dark transition-colors mt-2"
            >
              Show {opportunities.length - 2} more opportunities
            </button>
          )}
        </section>
      )}
    </div>
  )
}
