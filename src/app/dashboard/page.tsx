'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Share2, Globe, MapPin, Mail, ChevronRight, Eye, Plus,
  CheckCircle, Clock, Loader2, MessageSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import { getAllotmentUsage } from '@/lib/client-portal-actions'
import type {
  ContentQueueItem, ServiceArea, ClientAllotments,
} from '@/types/database'

interface ServiceCardConfig {
  id: ServiceArea
  label: string
  description: string
  icon: typeof Share2
  href: string
  allotmentKey: keyof ClientAllotments
}

const SERVICES: ServiceCardConfig[] = [
  {
    id: 'social',
    label: 'Social Media',
    description: 'Posts, reels, carousels, stories',
    icon: Share2,
    href: '/dashboard/social',
    allotmentKey: 'social_posts_per_month',
  },
  {
    id: 'website',
    label: 'Website',
    description: 'Health, traffic, change requests',
    icon: Globe,
    href: '/dashboard/website',
    allotmentKey: 'website_changes_per_month',
  },
  {
    id: 'local_seo',
    label: 'Local SEO',
    description: 'GBP, reviews, rankings',
    icon: MapPin,
    href: '/dashboard/local-seo',
    allotmentKey: 'seo_updates_per_month',
  },
  {
    id: 'email_sms',
    label: 'Email & SMS',
    description: 'Campaigns, performance, audience',
    icon: Mail,
    href: '/dashboard/email-sms',
    allotmentKey: 'email_campaigns_per_month',
  },
]

const STATUS_LABEL: Record<string, string> = {
  new: 'Submitted',
  drafting: 'In production',
  in_review: 'Ready for review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Complete',
  cancelled: 'Cancelled',
}

export default function DashboardOverviewPage() {
  const supabase = createClient()
  const { client, enrolledServices, loading: clientLoading } = useClient()

  const [userName, setUserName] = useState<string>('')
  const [requests, setRequests] = useState<ContentQueueItem[]>([])
  const [allotments, setAllotments] = useState<ClientAllotments>({})
  const [usage, setUsage] = useState<Record<ServiceArea, number>>({
    social: 0, website: 0, local_seo: 0, email_sms: 0,
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    setUserName(profile?.full_name?.split(' ')[0] || 'there')

    if (!client?.id) { setLoading(false); return }

    // Allotment usage (server action handles both lookup paths)
    const usageResult = await getAllotmentUsage()
    if (usageResult.success && usageResult.data) {
      setAllotments(usageResult.data.allotments)
      setUsage(usageResult.data.usage)
    }

    // Recent requests across all service areas
    const { data } = await supabase
      .from('content_queue')
      .select('*')
      .eq('client_id', client.id)
      .order('updated_at', { ascending: false })
      .limit(8)

    setRequests((data ?? []) as ContentQueueItem[])
    setLoading(false)
  }, [supabase, client?.id])

  useEffect(() => { if (!clientLoading) load() }, [load, clientLoading])
  useRealtimeRefresh(['content_queue'], load)

  const needsReview = requests.filter(r => r.status === 'in_review').length
  const inProgress = requests.filter(r => ['new', 'drafting'].includes(r.status)).length
  const completedThisMonth = requests.filter(r => {
    if (r.status !== 'posted' && r.status !== 'approved') return false
    const updated = new Date(r.updated_at)
    const now = new Date()
    return updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear()
  }).length

  // Filter service cards by enrollment
  const visibleServices = SERVICES.filter(s => enrolledServices.has(s.id))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl lg:text-3xl text-ink">
          Welcome back{userName ? `, ${userName}` : ''}
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          Request content, track progress, and review what&apos;s ready.
        </p>
      </div>

      {/* Needs review alert */}
      {needsReview > 0 && (
        <Link
          href="/dashboard/social/requests?status=in_review"
          className="block bg-amber-50 border border-amber-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Eye className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                You have {needsReview} {needsReview === 1 ? 'request' : 'requests'} ready for review
              </p>
              <p className="text-xs text-amber-700 mt-0.5">Approve or request revisions.</p>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-600" />
          </div>
        </Link>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Eye} label="Needs Review" value={needsReview} accent="amber" />
        <StatCard icon={Loader2} label="In Progress" value={inProgress} accent="blue" />
        <StatCard icon={CheckCircle} label="Completed This Month" value={completedThisMonth} accent="emerald" />
        <StatCard icon={Clock} label="Total Open" value={requests.filter(r => r.status !== 'posted').length} accent="ink" />
      </div>

      {/* Service area cards (filtered by enrollment) */}
      {visibleServices.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Your Services</h2>
            <span className="text-[10px] text-ink-4">{visibleServices.length} active</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleServices.map(svc => {
              const allotment = (allotments[svc.allotmentKey] ?? 0) as number
              const used = usage[svc.id] ?? 0
              const remaining = Math.max(0, allotment - used)
              const percent = allotment > 0 ? Math.min(100, (used / allotment) * 100) : 0
              const Icon = svc.icon

              return (
                <Link
                  key={svc.id}
                  href={svc.href}
                  className="bg-white rounded-xl border border-ink-6 p-5 hover:shadow-sm hover:border-brand/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-brand-tint flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-brand-dark" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-[family-name:var(--font-display)] text-base text-ink">{svc.label}</h3>
                        <p className="text-xs text-ink-3 mt-0.5">{svc.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-2" />
                  </div>

                  {/* Allotment bar */}
                  {allotment > 0 ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[10px] text-ink-4 mb-1">
                        <span>{used} of {allotment} used this month</span>
                        <span>{remaining} remaining</span>
                      </div>
                      <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-brand'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-[10px] text-ink-4">
                      No monthly limit set
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* No services enrolled */}
      {!clientLoading && visibleServices.length === 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
            <Plus className="w-5 h-5 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">No services yet</p>
          <p className="text-xs text-ink-4 mt-1 mb-4 max-w-sm mx-auto">
            Your account isn&apos;t enrolled in any services yet. Reach out to your account manager to get started.
          </p>
          <Link
            href="/dashboard/messages"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Message Team
          </Link>
        </div>
      )}

      {/* Recent activity */}
      {!loading && requests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
            <Link href="/dashboard/social/requests" className="text-xs text-brand hover:text-brand-dark">
              View all →
            </Link>
          </div>
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            {requests.map((req, i) => (
              <Link
                key={req.id}
                href={`/dashboard/social/requests/${req.id}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-bg-2 transition-colors ${
                  i > 0 ? 'border-t border-ink-6' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-brand-tint flex items-center justify-center flex-shrink-0">
                  <Share2 className="w-4 h-4 text-brand-dark" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{req.input_text || 'Untitled request'}</p>
                  <p className="text-[10px] text-ink-4 mt-0.5 capitalize">
                    {STATUS_LABEL[req.status] || req.status} · {new Date(req.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for activity */}
      {!loading && visibleServices.length > 0 && requests.length === 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
            <Plus className="w-5 h-5 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">No activity yet</p>
          <p className="text-xs text-ink-4 mt-1 mb-4">Start by requesting your first piece of content.</p>
          <Link
            href="/dashboard/social/requests/new"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Request
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon, label, value, accent,
}: {
  icon: typeof Eye
  label: string
  value: number
  accent: 'amber' | 'blue' | 'emerald' | 'ink'
}) {
  const accentMap = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    ink: 'bg-bg-2 text-ink-3',
  }
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${accentMap[accent]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{value}</div>
      <div className="text-[11px] text-ink-3 mt-0.5">{label}</div>
    </div>
  )
}
