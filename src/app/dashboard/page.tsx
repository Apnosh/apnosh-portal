'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Share2, Globe, MapPin, Mail, ChevronRight, Eye, Plus,
  TrendingUp, Clock, CheckCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
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
  comingSoon?: boolean
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
    description: 'Content, design, bug fixes',
    icon: Globe,
    href: '/dashboard/website',
    allotmentKey: 'website_changes_per_month',
    comingSoon: true,
  },
  {
    id: 'local_seo',
    label: 'Local SEO',
    description: 'GBP, reviews, rankings',
    icon: MapPin,
    href: '/dashboard/local-seo',
    allotmentKey: 'seo_updates_per_month',
    comingSoon: true,
  },
  {
    id: 'email_sms',
    label: 'Email & SMS',
    description: 'Campaigns and automations',
    icon: Mail,
    href: '/dashboard/email-sms',
    allotmentKey: 'email_campaigns_per_month',
    comingSoon: true,
  },
]

export default function DashboardOverviewPage() {
  const supabase = createClient()

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

    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (business?.client_id) {
      // Fetch allotment usage
      const usageResult = await getAllotmentUsage()
      if (usageResult.success && usageResult.data) {
        setAllotments(usageResult.data.allotments)
        setUsage(usageResult.data.usage)
      }

      // Recent requests across all service areas
      const { data } = await supabase
        .from('content_queue')
        .select('*')
        .eq('client_id', business.client_id)
        .order('updated_at', { ascending: false })
        .limit(5)

      setRequests((data ?? []) as ContentQueueItem[])
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['content_queue'], load)

  const needsReview = requests.filter(r => r.status === 'in_review').length

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

      {/* Service area cards */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Your Services</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SERVICES.map(svc => {
            const allotment = (allotments[svc.allotmentKey] ?? 0) as number
            const used = usage[svc.id] ?? 0
            const remaining = Math.max(0, allotment - used)
            const percent = allotment > 0 ? Math.min(100, (used / allotment) * 100) : 0
            const Icon = svc.icon

            return (
              <Link
                key={svc.id}
                href={svc.href}
                className={`bg-white rounded-xl border border-ink-6 p-5 hover:shadow-sm hover:border-brand/30 transition-all ${
                  svc.comingSoon ? 'opacity-90' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-tint flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-brand-dark" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-[family-name:var(--font-display)] text-base text-ink">{svc.label}</h3>
                        {svc.comingSoon && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-bg-2 text-ink-4 uppercase tracking-wide">
                            Soon
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-3 mt-0.5">{svc.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-2" />
                </div>

                {/* Allotment bar */}
                {allotment > 0 && !svc.comingSoon && (
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
                )}
              </Link>
            )
          })}
        </div>
      </div>

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
                    {req.status.replace(/_/g, ' ')} · {new Date(req.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && requests.length === 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
            <Plus className="w-5 h-5 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">No activity yet</p>
          <p className="text-xs text-ink-4 mt-1 mb-4">Start by requesting your first social post.</p>
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
