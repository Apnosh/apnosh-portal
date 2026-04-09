'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Eye, Clock, CheckCircle, ListTodo, ChevronRight, Calendar as CalendarIcon,
  Share2, TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { getAllotmentUsage } from '@/lib/client-portal-actions'
import type { ContentQueueItem, QueueStatus, ClientAllotments } from '@/types/database'

const STATUS_LABEL: Record<QueueStatus, string> = {
  new: 'Submitted',
  drafting: 'In Production',
  in_review: 'Ready for Review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Posted',
}

const STATUS_COLOR: Record<QueueStatus, string> = {
  new: 'bg-blue-50 text-blue-700',
  drafting: 'bg-purple-50 text-purple-700',
  in_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-indigo-50 text-indigo-700',
  posted: 'bg-green-50 text-green-700',
}

export default function SocialHubPage() {
  const supabase = createClient()

  const [requests, setRequests] = useState<ContentQueueItem[]>([])
  const [allotments, setAllotments] = useState<ClientAllotments>({})
  const [usedThisMonth, setUsedThisMonth] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!business?.client_id) { setLoading(false); return }

    // Fetch social requests
    const { data } = await supabase
      .from('content_queue')
      .select('*')
      .eq('client_id', business.client_id)
      .eq('service_area', 'social')
      .order('updated_at', { ascending: false })
      .limit(50)

    setRequests((data ?? []) as ContentQueueItem[])

    // Fetch allotment usage
    const usageResult = await getAllotmentUsage()
    if (usageResult.success && usageResult.data) {
      setAllotments(usageResult.data.allotments)
      setUsedThisMonth(usageResult.data.usage.social)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['content_queue', 'client_feedback'], load)

  const needsReview = requests.filter(r => r.status === 'in_review').length
  const inProduction = requests.filter(r => r.status === 'drafting' || r.status === 'new').length
  const published = requests.filter(r => r.status === 'posted').length

  const allotment = allotments.social_posts_per_month ?? 0
  const remaining = Math.max(0, allotment - usedThisMonth)
  const percent = allotment > 0 ? Math.min(100, (usedThisMonth / allotment) * 100) : 0

  const recentActivity = requests.slice(0, 5)
  const needsReviewItems = requests.filter(r => r.status === 'in_review').slice(0, 3)

  if (loading) return <HubSkeleton />

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-tint flex items-center justify-center flex-shrink-0">
            <Share2 className="w-5 h-5 text-brand-dark" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Social Media</h1>
            <p className="text-ink-3 text-sm mt-0.5">Feed posts, reels, carousels, and stories.</p>
          </div>
        </div>
        <Link
          href="/dashboard/social/requests/new"
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Request
        </Link>
      </div>

      {/* Allotment usage bar */}
      {allotment > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Monthly Usage</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-[family-name:var(--font-display)] text-2xl text-ink">{usedThisMonth}</span>
                <span className="text-sm text-ink-3">of {allotment} posts used this month</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Remaining</div>
              <div className="font-[family-name:var(--font-display)] text-2xl text-brand-dark mt-0.5">{remaining}</div>
            </div>
          </div>
          <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-brand'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-[10px] text-ink-4 mt-2">Resets on the 1st of each month</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Ready for Review" value={needsReview} icon={Eye} color="amber" href="/dashboard/social/requests?status=in_review" urgent={needsReview > 0} />
        <StatCard label="In Production" value={inProduction} icon={Clock} color="purple" href="/dashboard/social/requests?status=drafting" />
        <StatCard label="Published" value={published} icon={CheckCircle} color="emerald" href="/dashboard/social/requests?status=posted" />
      </div>

      {/* Needs review panel */}
      {needsReviewItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-amber-700" />
            <h2 className="text-sm font-semibold text-amber-900">Waiting on Your Review</h2>
          </div>
          <div className="space-y-2">
            {needsReviewItems.map(item => (
              <Link
                key={item.id}
                href={`/dashboard/social/requests/${item.id}`}
                className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 hover:shadow-sm transition-shadow border border-amber-200/50"
              >
                <p className="flex-1 text-sm text-ink-2 truncate">{item.input_text || 'Untitled request'}</p>
                <span className="text-[10px] text-amber-700 font-medium">Review →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/dashboard/social/requests"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <ListTodo className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">All Requests</div>
              <div className="text-xs text-ink-4">{requests.length} total</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
        <Link
          href="/dashboard/social/calendar"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">Content Calendar</div>
              <div className="text-xs text-ink-4">Month view</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
        <Link
          href="/dashboard/social/performance"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">Performance</div>
              <div className="text-xs text-ink-4">Reach, engagement, growth</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
          <Link href="/dashboard/social/requests" className="text-xs text-brand hover:text-brand-dark">
            View all →
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
            <ListTodo className="w-6 h-6 text-ink-4 mx-auto mb-3" />
            <p className="text-sm font-medium text-ink-2">No requests yet</p>
            <p className="text-xs text-ink-4 mt-1">Click &ldquo;New Request&rdquo; above to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            {recentActivity.map((req, i) => (
              <Link
                key={req.id}
                href={`/dashboard/social/requests/${req.id}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-bg-2 transition-colors ${
                  i > 0 ? 'border-t border-ink-6' : ''
                }`}
              >
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[req.status]}`}>
                  {STATUS_LABEL[req.status]}
                </span>
                <span className="flex-1 text-sm text-ink-2 truncate">
                  {req.input_text || 'Untitled request'}
                </span>
                <span className="text-[10px] text-ink-4 flex-shrink-0">
                  {new Date(req.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label, value, icon: Icon, color, href, urgent,
}: {
  label: string
  value: number
  icon: typeof Eye
  color: string
  href: string
  urgent?: boolean
}) {
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }

  return (
    <Link
      href={href}
      className={`bg-white rounded-xl border p-5 block hover:shadow-sm transition-all ${
        urgent ? 'border-amber-300 ring-1 ring-amber-200' : 'border-ink-6'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg ${colorMap[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{value}</div>
      <div className="text-ink-3 text-sm mt-0.5">{label}</div>
    </Link>
  )
}

function HubSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 bg-ink-6 rounded-xl" />
        <div className="space-y-2">
          <div className="h-7 w-48 bg-ink-6 rounded" />
          <div className="h-4 w-64 bg-ink-6 rounded" />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-ink-6 p-5 h-28" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 h-28" />
        ))}
      </div>
    </div>
  )
}
