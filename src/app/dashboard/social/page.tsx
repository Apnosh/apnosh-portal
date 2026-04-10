'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Check, Eye, Loader2, Users, Heart, UserPlus, ChevronRight,
  Image as ImageIcon, Film, Bell, Calendar, MessageSquare,
  Send, Star, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'
import { useRealtimeRefresh } from '@/lib/realtime'
import { submitClientFeedback } from '@/lib/client-portal-actions'
import type {
  ContentQueueItem, ContentQueueDraft, SocialMetricsRow, AmClientNote, TeamMember,
} from '@/types/database'

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString()
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Submitted',
  confirmed: 'Confirmed',
  drafting: 'In production',
  in_review: 'Ready for review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Published',
  cancelled: 'Cancelled',
}

export default function SocialOverviewPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [pendingReview, setPendingReview] = useState<ContentQueueItem[]>([])
  const [recentActivity, setRecentActivity] = useState<ContentQueueItem[]>([])
  const [weekPosts, setWeekPosts] = useState<ContentQueueItem[]>([])
  const [metrics, setMetrics] = useState<SocialMetricsRow[]>([])
  const [prevMetrics, setPrevMetrics] = useState<SocialMetricsRow[]>([])
  const [amNote, setAmNote] = useState<(AmClientNote & { team_member?: TeamMember }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const thisMonth = now.getMonth() + 1
    const thisYear = now.getFullYear()
    const lastMonth = thisMonth === 1 ? 12 : thisMonth - 1
    const lastMonthYear = thisMonth === 1 ? thisYear - 1 : thisYear

    const [pendingRes, activityRes, weekRes, metricsRes, prevMetricsRes, noteRes] = await Promise.all([
      supabase
        .from('content_queue').select('*')
        .eq('client_id', client.id).eq('service_area', 'social').eq('status', 'in_review')
        .order('scheduled_for', { ascending: true, nullsFirst: false }).limit(5),
      supabase
        .from('content_queue').select('*')
        .eq('client_id', client.id).eq('service_area', 'social')
        .gte('updated_at', sevenDaysAgo.toISOString())
        .order('updated_at', { ascending: false }).limit(10),
      supabase
        .from('content_queue').select('*')
        .eq('client_id', client.id).eq('service_area', 'social')
        .in('status', ['scheduled', 'posted'])
        .gte('scheduled_for', weekStart.toISOString()).lt('scheduled_for', weekEnd.toISOString()),
      supabase
        .from('social_metrics').select('*')
        .eq('client_id', client.id).eq('month', thisMonth).eq('year', thisYear),
      supabase
        .from('social_metrics').select('*')
        .eq('client_id', client.id).eq('month', lastMonth).eq('year', lastMonthYear),
      supabase
        .from('am_client_notes').select('*, team_member:created_by(name, avatar_url, role)')
        .eq('client_id', client.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    setPendingReview((pendingRes.data ?? []) as ContentQueueItem[])
    setRecentActivity((activityRes.data ?? []) as ContentQueueItem[])
    setWeekPosts((weekRes.data ?? []) as ContentQueueItem[])
    setMetrics((metricsRes.data ?? []) as SocialMetricsRow[])
    setPrevMetrics((prevMetricsRes.data ?? []) as SocialMetricsRow[])

    if (noteRes.data) {
      const raw = noteRes.data as Record<string, unknown>
      setAmNote({
        id: raw.id as string,
        client_id: raw.client_id as string,
        note_text: raw.note_text as string,
        created_by: raw.created_by as string | null,
        created_at: raw.created_at as string,
        updated_at: raw.updated_at as string,
        team_member: raw.team_member as TeamMember | undefined,
      })
    }

    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { if (!clientLoading) load() }, [load, clientLoading])
  useRealtimeRefresh(['content_queue', 'client_feedback', 'am_client_notes'] as never[], load)

  const reach = metrics.reduce((s, m) => s + m.total_reach, 0)
  const engagement = metrics.reduce((s, m) => s + m.total_engagement, 0)
  const followersChange = metrics.reduce((s, m) => s + m.followers_change, 0)
  const prevReach = prevMetrics.reduce((s, m) => s + m.total_reach, 0)
  const prevEngagement = prevMetrics.reduce((s, m) => s + m.total_engagement, 0)

  const pendingCount = pendingReview.length
  const weekPostCount = weekPosts.length
  const weekPlatforms = Array.from(new Set(weekPosts.map(p => p.platform).filter(Boolean)))

  async function handleQuickApprove(id: string) {
    setApprovingId(id)
    await submitClientFeedback(id, 'approval')
    setApprovingId(null)
    load()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Social Media</h1>
        <p className="text-ink-3 text-sm mt-0.5">Your social media at a glance.</p>
      </div>

      {loading || clientLoading ? (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-ink-6 h-32 animate-pulse" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-ink-6 h-24 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* This week summary */}
          <div className="bg-white rounded-2xl border border-ink-6 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-tint flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-brand-dark" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-ink mb-1">This week</h2>
                <p className="text-sm text-ink-2 leading-relaxed">
                  {weekPostCount > 0
                    ? `${weekPostCount} ${weekPostCount === 1 ? 'post is' : 'posts are'} going out this week${weekPlatforms.length > 0 ? ` on ${weekPlatforms.join(' and ')}` : ''}.`
                    : 'No posts scheduled this week.'}
                  {pendingCount > 0
                    ? ` You have ${pendingCount} ${pendingCount === 1 ? 'thing' : 'things'} that ${pendingCount === 1 ? 'needs' : 'need'} your attention.`
                    : ' Everything is on track.'}
                </p>
                {pendingCount > 0 && (
                  <Link href="/dashboard/social/action-needed" className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-dark font-medium mt-2">
                    <Eye className="w-3.5 h-3.5" /> Review now →
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Action needed preview */}
          {pendingReview.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-600" /> Needs your review
                </h2>
                <Link href="/dashboard/social/action-needed" className="text-xs text-brand hover:text-brand-dark font-medium">See all →</Link>
              </div>
              <div className="space-y-2">
                {pendingReview.slice(0, 3).map(item => {
                  const draft: ContentQueueDraft | null = item.selected_draft != null && item.drafts[item.selected_draft] ? item.drafts[item.selected_draft] as ContentQueueDraft : null
                  return (
                    <div key={item.id} className="bg-white rounded-xl border border-amber-200 p-4 flex items-center gap-4">
                      <Link href={`/dashboard/social/requests/${item.id}`} className="w-14 h-14 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0 overflow-hidden hover:opacity-80">
                        {draft?.image_url ? <img src={draft.image_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-ink-4" />}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{draft?.caption || item.input_text || 'Ready for review'}</p>
                        <p className="text-[10px] text-ink-4 mt-0.5">{timeAgo(item.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => handleQuickApprove(item.id)} disabled={approvingId === item.id} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1 transition-colors disabled:opacity-50">
                          {approvingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                        </button>
                        <Link href={`/dashboard/social/requests/${item.id}`} className="text-xs text-ink-4 hover:text-ink">View →</Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick stats */}
          {(reach > 0 || engagement > 0 || followersChange !== 0) && (
            <div className="grid grid-cols-3 gap-3">
              <QuickStat icon={Users} value={fmtNum(reach)} label="people reached" prev={prevReach} current={reach} />
              <QuickStat icon={Heart} value={fmtNum(engagement)} label="people engaged" prev={prevEngagement} current={engagement} />
              <QuickStat icon={UserPlus} value={followersChange >= 0 ? `+${fmtNum(followersChange)}` : `${fmtNum(followersChange)}`} label="new followers" />
            </div>
          )}

          {/* Recent activity */}
          {recentActivity.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink mb-3">Recent activity</h2>
              <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
                {recentActivity.slice(0, 8).map((item, i) => (
                  <Link key={item.id} href={`/dashboard/social/requests/${item.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-bg-2 transition-colors ${i > 0 ? 'border-t border-ink-6' : ''}`}>
                    <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0">
                      {item.status === 'posted' ? <Send className="w-3.5 h-3.5 text-emerald-600" /> :
                       item.status === 'in_review' ? <Eye className="w-3.5 h-3.5 text-amber-600" /> :
                       item.status === 'drafting' ? <Loader2 className="w-3.5 h-3.5 text-purple-600" /> :
                       <Clock className="w-3.5 h-3.5 text-ink-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink truncate">{item.input_text || 'Content request'}</p>
                      <p className="text-[10px] text-ink-4">{STATUS_LABEL[item.status] || item.status}</p>
                    </div>
                    <span className="text-[10px] text-ink-4 flex-shrink-0">{timeAgo(item.updated_at)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* AM note */}
          {amNote && (
            <div className="bg-brand-tint/40 rounded-xl border border-brand/20 p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-white border border-brand/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {amNote.team_member?.avatar_url ? <img src={amNote.team_member.avatar_url} alt="" className="w-full h-full object-cover" /> : <MessageSquare className="w-4 h-4 text-brand-dark" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-semibold text-brand-dark">{amNote.team_member?.name || 'Your account manager'}</span>
                    <span className="text-[10px] text-ink-4">{timeAgo(amNote.updated_at)}</span>
                  </div>
                  <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{amNote.note_text}</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty fallback */}
          {pendingReview.length === 0 && recentActivity.length === 0 && reach === 0 && !amNote && (
            <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
              <Star className="w-6 h-6 text-ink-4 mx-auto mb-3" />
              <p className="text-sm font-medium text-ink-2">Welcome to your social media hub</p>
              <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">Once your team starts creating content and tracking results, everything will show up here.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function QuickStat({ icon: Icon, value, label, prev, current }: { icon: typeof Users; value: string; label: string; prev?: number; current?: number }) {
  let changeText = ''
  if (prev !== undefined && current !== undefined && prev > 0) {
    const pct = Math.round(((current - prev) / prev) * 100)
    if (pct > 0) changeText = `Up ${pct}% from last month`
    else if (pct < 0) changeText = `Down ${Math.abs(pct)}% from last month`
    else changeText = 'Same as last month'
  }
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className="w-7 h-7 rounded-lg bg-bg-2 flex items-center justify-center mb-2">
        <Icon className="w-3.5 h-3.5 text-ink-3" />
      </div>
      <div className="font-[family-name:var(--font-display)] text-xl text-ink">{value}</div>
      <div className="text-[11px] text-ink-3 mt-0.5">{label}</div>
      {changeText && (
        <div className={`text-[10px] font-medium mt-1 ${changeText.startsWith('Up') ? 'text-emerald-600' : changeText.startsWith('Down') ? 'text-red-600' : 'text-ink-4'}`}>
          {changeText}
        </div>
      )}
    </div>
  )
}
