'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Mail, Plus, Send, TrendingUp, Users, ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { EmailCampaign, EmailListSnapshot } from '@/types/database'

export default function EmailSmsHubPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [upcomingCampaigns, setUpcomingCampaigns] = useState<EmailCampaign[]>([])
  const [latestList, setLatestList] = useState<EmailListSnapshot | null>(null)
  const [sentThisMonth, setSentThisMonth] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [upcomingRes, sentCountRes, listRes] = await Promise.all([
      supabase
        .from('email_campaigns')
        .select('*')
        .eq('client_id', client.id)
        .in('status', ['draft', 'in_review', 'approved', 'scheduled'])
        .order('scheduled_for', { ascending: true, nullsFirst: false })
        .limit(5),
      supabase
        .from('email_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .eq('status', 'sent')
        .gte('sent_at', monthStart),
      supabase
        .from('email_list_snapshot')
        .select('*')
        .eq('client_id', client.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    setUpcomingCampaigns((upcomingRes.data ?? []) as EmailCampaign[])
    setSentThisMonth(sentCountRes.count ?? 0)
    setLatestList((listRes.data as EmailListSnapshot | null))
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['email_campaigns', 'email_list_snapshot'], load)

  if (clientLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-ink-6 rounded" />
        <div className="bg-white rounded-xl border border-ink-6 h-24" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-tint flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-brand-dark" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Email & SMS</h1>
            <p className="text-ink-3 text-sm mt-0.5">Campaigns, performance, and your subscriber list.</p>
          </div>
        </div>
        <Link
          href="/dashboard/email-sms/campaigns"
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Request
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label="Subscribers"
          value={latestList?.active_subscribers ?? 0}
          sub={latestList?.new_subscribers ? `+${latestList.new_subscribers} this month` : 'No data yet'}
          icon={Users}
        />
        <StatCard
          label="Sent This Month"
          value={sentThisMonth}
          sub={sentThisMonth === 1 ? 'campaign' : 'campaigns'}
          icon={Send}
        />
        <StatCard
          label="Upcoming"
          value={upcomingCampaigns.length}
          sub={upcomingCampaigns.length === 1 ? 'in the queue' : 'in the queue'}
          icon={TrendingUp}
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/dashboard/email-sms/campaigns"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <Send className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">Campaigns</div>
              <div className="text-xs text-ink-4">Upcoming + sent</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
        <Link
          href="/dashboard/email-sms/performance"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">Performance</div>
              <div className="text-xs text-ink-4">Opens, clicks, revenue</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
        <Link
          href="/dashboard/email-sms/list"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <Users className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">List & Audience</div>
              <div className="text-xs text-ink-4">Subscribers, segments</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
      </div>

      {/* Upcoming campaigns preview */}
      {upcomingCampaigns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Upcoming Campaigns</h2>
            <Link href="/dashboard/email-sms/campaigns" className="text-xs text-brand hover:text-brand-dark">
              View all →
            </Link>
          </div>
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            {upcomingCampaigns.map((c, i) => (
              <div
                key={c.id}
                className={`px-4 py-3 flex items-center gap-3 ${i > 0 ? 'border-t border-ink-6' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-ink-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate font-medium">{c.name}</p>
                  <p className="text-[10px] text-ink-4 truncate">{c.subject}</p>
                </div>
                <span className="text-[10px] text-ink-4 flex-shrink-0 uppercase tracking-wide">
                  {c.status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: number; sub: string; icon: typeof Users }) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center mb-3">
        <Icon className="w-4 h-4 text-ink-3" />
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{value.toLocaleString()}</div>
      <div className="text-ink-3 text-xs mt-0.5">{label}</div>
      <div className="text-[10px] text-ink-4 mt-0.5">{sub}</div>
    </div>
  )
}
