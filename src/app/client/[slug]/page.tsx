'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import {
  Plus, Eye, Clock, CheckCircle, ListTodo, ChevronRight, Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import type { ContentQueueItem, QueueStatus, Client } from '@/types/database'

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

export default function ClientDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const supabase = createClient()

  const [client, setClient] = useState<Client | null>(null)
  const [requests, setRequests] = useState<ContentQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!clientData) {
      setLoading(false)
      return
    }

    setClient(clientData as Client)

    const { data: requestsData } = await supabase
      .from('content_queue')
      .select('*')
      .eq('client_id', (clientData as Client).id)
      .order('updated_at', { ascending: false })
      .limit(50)

    setRequests((requestsData ?? []) as ContentQueueItem[])
    setLoading(false)
  }, [slug, supabase])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(['content_queue', 'client_feedback'], load)

  const needsReview = requests.filter(r => r.status === 'in_review').length
  const inProduction = requests.filter(r => r.status === 'drafting' || r.status === 'new').length
  const thisMonth = requests.filter(r => {
    const d = new Date(r.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const recentActivity = requests.slice(0, 5)

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
          Welcome back{client?.name ? `, ${client.name}` : ''}
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          Request content, review drafts, and track everything in one place.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Ready for Review"
          value={needsReview}
          icon={Eye}
          color="amber"
          href={`/client/${slug}/requests?status=in_review`}
          urgent={needsReview > 0}
        />
        <StatCard
          label="In Production"
          value={inProduction}
          icon={Clock}
          color="purple"
          href={`/client/${slug}/requests?status=drafting`}
        />
        <StatCard
          label="This Month"
          value={thisMonth}
          icon={CheckCircle}
          color="emerald"
          href={`/client/${slug}/requests`}
        />
      </div>

      {/* Main CTA */}
      <div className="bg-white rounded-xl border border-ink-6 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Need something new?</h2>
          <p className="text-sm text-ink-3 mt-1">Tell us what you want and we'll create it.</p>
        </div>
        <Link
          href={`/client/${slug}/requests/new`}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Request
        </Link>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
          <Link href={`/client/${slug}/requests`} className="text-xs text-brand hover:text-brand-dark">
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
                href={`/client/${slug}/requests/${req.id}`}
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
  label,
  value,
  icon: Icon,
  color,
  href,
  urgent,
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

function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="space-y-2 animate-pulse">
        <div className="h-7 w-48 bg-ink-6 rounded" />
        <div className="h-4 w-64 bg-ink-6 rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 h-28" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-ink-6 h-24 animate-pulse" />
    </div>
  )
}
