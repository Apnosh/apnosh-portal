'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Globe, Plus, Activity, BarChart3, ListTodo, ChevronRight,
  Wifi, WifiOff, Gauge, ShieldCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { WebsiteHealth, ContentQueueItem, QueueStatus } from '@/types/database'

const STATUS_COLOR: Record<QueueStatus, string> = {
  new: 'bg-blue-50 text-blue-700',
  confirmed: 'bg-blue-50 text-blue-700',
  drafting: 'bg-purple-50 text-purple-700',
  in_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-indigo-50 text-indigo-700',
  posted: 'bg-green-50 text-green-700',
  cancelled: 'bg-ink-6 text-ink-3',
}

export default function WebsiteHubPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [health, setHealth] = useState<WebsiteHealth | null>(null)
  const [recentRequests, setRecentRequests] = useState<ContentQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [healthRes, requestsRes] = await Promise.all([
      supabase.from('website_health').select('*').eq('client_id', client.id).maybeSingle(),
      supabase
        .from('content_queue')
        .select('*')
        .eq('client_id', client.id)
        .eq('service_area', 'website')
        .order('updated_at', { ascending: false })
        .limit(5),
    ])

    setHealth(healthRes.data as WebsiteHealth | null)
    setRecentRequests((requestsRes.data ?? []) as ContentQueueItem[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['website_health', 'content_queue'], load)

  if (clientLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 bg-ink-6 rounded-xl" />
          <div className="space-y-2"><div className="h-7 w-48 bg-ink-6 rounded" /></div>
        </div>
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
            <Globe className="w-5 h-5 text-brand-dark" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Website</h1>
            <p className="text-ink-3 text-sm mt-0.5">Site health, traffic, and change requests.</p>
          </div>
        </div>
        <Link
          href="/dashboard/website/requests/new"
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Request
        </Link>
      </div>

      {/* Health at a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HealthCard
          label="Uptime"
          value={health?.uptime_status === 'up' ? 'Online' : health?.uptime_status === 'down' ? 'Down' : health?.uptime_status === 'degraded' ? 'Degraded' : '—'}
          subValue={health?.uptime_pct_30d != null ? `${health.uptime_pct_30d}% last 30d` : 'No data'}
          icon={health?.uptime_status === 'down' ? WifiOff : Wifi}
          color={health?.uptime_status === 'up' ? 'emerald' : health?.uptime_status === 'down' ? 'red' : 'amber'}
        />
        <HealthCard
          label="Speed (Mobile)"
          value={health?.pagespeed_mobile != null ? `${health.pagespeed_mobile}/100` : '—'}
          subValue={health?.pagespeed_mobile != null ? speedLabel(health.pagespeed_mobile) : 'No data'}
          icon={Gauge}
          color={scoreColor(health?.pagespeed_mobile)}
        />
        <HealthCard
          label="Speed (Desktop)"
          value={health?.pagespeed_desktop != null ? `${health.pagespeed_desktop}/100` : '—'}
          subValue={health?.pagespeed_desktop != null ? speedLabel(health.pagespeed_desktop) : 'No data'}
          icon={Gauge}
          color={scoreColor(health?.pagespeed_desktop)}
        />
        <HealthCard
          label="SSL"
          value={health?.ssl_valid == null ? '—' : health.ssl_valid ? 'Valid' : 'Invalid'}
          subValue={health?.ssl_expires_at ? `Expires ${new Date(health.ssl_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'No data'}
          icon={ShieldCheck}
          color={health?.ssl_valid ? 'emerald' : health?.ssl_valid === false ? 'red' : 'ink'}
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/dashboard/website/health"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <Activity className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">Site Health</div>
              <div className="text-xs text-ink-4">Uptime, speed, security</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
        <Link
          href="/dashboard/website/traffic"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">Traffic</div>
              <div className="text-xs text-ink-4">Visitors, pages, sources</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
        <Link
          href="/dashboard/website/requests"
          className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
              <ListTodo className="w-5 h-5 text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">Change Requests</div>
              <div className="text-xs text-ink-4">{recentRequests.length} total</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4" />
        </Link>
      </div>

      {/* Recent change requests */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Recent Change Requests</h2>
          <Link href="/dashboard/website/requests" className="text-xs text-brand hover:text-brand-dark">
            View all →
          </Link>
        </div>
        {recentRequests.length === 0 ? (
          <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
            <ListTodo className="w-6 h-6 text-ink-4 mx-auto mb-3" />
            <p className="text-sm font-medium text-ink-2">No change requests yet</p>
            <p className="text-xs text-ink-4 mt-1">Submit your first update request to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            {recentRequests.map((req, i) => (
              <Link
                key={req.id}
                href={`/dashboard/website/requests/${req.id}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-bg-2 transition-colors ${
                  i > 0 ? 'border-t border-ink-6' : ''
                }`}
              >
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[req.status]}`}>
                  {req.status.replace(/_/g, ' ')}
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

function HealthCard({
  label, value, subValue, icon: Icon, color,
}: {
  label: string
  value: string
  subValue: string
  icon: typeof Wifi
  color: 'emerald' | 'amber' | 'red' | 'ink'
}) {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-500',
    ink: 'bg-bg-2 text-ink-4',
  }
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className={`w-8 h-8 rounded-lg ${colorMap[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-[family-name:var(--font-display)] text-xl text-ink">{value}</div>
      <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mt-1">{label}</div>
      <div className="text-[10px] text-ink-3 mt-1">{subValue}</div>
    </div>
  )
}

function speedLabel(score: number): string {
  if (score >= 90) return 'Fast'
  if (score >= 50) return 'Moderate'
  return 'Slow'
}

function scoreColor(score: number | null | undefined): 'emerald' | 'amber' | 'red' | 'ink' {
  if (score == null) return 'ink'
  if (score >= 90) return 'emerald'
  if (score >= 50) return 'amber'
  return 'red'
}
