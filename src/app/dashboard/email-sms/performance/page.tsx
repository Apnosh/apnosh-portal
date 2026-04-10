'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, TrendingDown, Mail, MousePointerClick, DollarSign, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { EmailCampaign } from '@/types/database'

export default function EmailPerformancePage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('client_id', client.id)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(50)
    setCampaigns((data ?? []) as EmailCampaign[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['email_campaigns'], load)

  // Aggregates
  const totalRecipients = campaigns.reduce((sum, c) => sum + c.recipient_count, 0)
  const totalOpens = campaigns.reduce((sum, c) => sum + c.opens, 0)
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0)
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenue ?? 0), 0)

  const avgOpenRate = totalRecipients > 0 ? ((totalOpens / totalRecipients) * 100).toFixed(1) : '0.0'
  const avgClickRate = totalOpens > 0 ? ((totalClicks / totalOpens) * 100).toFixed(1) : '0.0'

  // Top campaigns by open rate
  const topByOpenRate = [...campaigns]
    .filter(c => c.recipient_count > 0)
    .sort((a, b) => (b.opens / b.recipient_count) - (a.opens / a.recipient_count))
    .slice(0, 5)

  // Recent 6 for trend
  const recentSix = [...campaigns].slice(0, 6).reverse()

  // Compare last 3 vs prior 3
  const last3 = campaigns.slice(0, 3)
  const prior3 = campaigns.slice(3, 6)
  const last3OpenRate = last3.length > 0
    ? last3.reduce((s, c) => s + (c.recipient_count > 0 ? c.opens / c.recipient_count : 0), 0) / last3.length * 100
    : 0
  const prior3OpenRate = prior3.length > 0
    ? prior3.reduce((s, c) => s + (c.recipient_count > 0 ? c.opens / c.recipient_count : 0), 0) / prior3.length * 100
    : 0
  const openRateTrend = prior3OpenRate > 0 ? last3OpenRate - prior3OpenRate : 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/email-sms" className="text-ink-4 hover:text-ink transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Email Performance</h1>
          <p className="text-ink-3 text-sm mt-0.5">How your campaigns are performing across the board.</p>
        </div>
      </div>

      {clientLoading || loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-ink-6 h-28 animate-pulse" />
            ))}
          </div>
          <div className="bg-white rounded-xl border border-ink-6 h-64 animate-pulse" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <TrendingUp className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No performance data yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            Once your first campaign sends, performance metrics will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Aggregate stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PerfCard
              icon={Eye}
              label="Avg Open Rate"
              value={`${avgOpenRate}%`}
              trend={openRateTrend}
              sub={`${totalOpens.toLocaleString()} total opens`}
            />
            <PerfCard
              icon={MousePointerClick}
              label="Avg Click Rate"
              value={`${avgClickRate}%`}
              sub={`${totalClicks.toLocaleString()} total clicks`}
            />
            <PerfCard
              icon={Mail}
              label="Total Sent"
              value={campaigns.length.toString()}
              sub={`${totalRecipients.toLocaleString()} recipients`}
            />
            <PerfCard
              icon={DollarSign}
              label="Revenue"
              value={`$${totalRevenue.toLocaleString()}`}
              sub={totalRevenue > 0 ? 'Attributed to email' : 'Not yet tracked'}
            />
          </div>

          {/* Recent trend */}
          {recentSix.length >= 2 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4">Recent Open Rates</h2>
              <div className="space-y-3">
                {recentSix.map(c => {
                  const rate = c.recipient_count > 0 ? (c.opens / c.recipient_count) * 100 : 0
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-ink truncate font-medium">{c.name}</p>
                        <p className="text-[10px] text-ink-4">
                          {c.sent_at ? new Date(c.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </p>
                      </div>
                      <div className="flex-1 max-w-xs">
                        <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand rounded-full transition-all"
                            style={{ width: `${Math.min(rate, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs font-medium text-ink-2 w-12 text-right">{rate.toFixed(1)}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top performing */}
          {topByOpenRate.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4">Top Campaigns by Open Rate</h2>
              <div className="space-y-2">
                {topByOpenRate.map((c, i) => {
                  const rate = ((c.opens / c.recipient_count) * 100).toFixed(1)
                  return (
                    <div key={c.id} className="flex items-center gap-3 py-2 border-b border-ink-6 last:border-0">
                      <span className="text-xs font-medium text-ink-4 w-5">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate font-medium">{c.name}</p>
                        <p className="text-[10px] text-ink-4 truncate">{c.subject}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-medium text-ink">{rate}%</div>
                        <div className="text-[10px] text-ink-4">{c.opens.toLocaleString()} opens</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PerfCard({
  icon: Icon, label, value, sub, trend,
}: {
  icon: typeof Mail
  label: string
  value: string
  sub: string
  trend?: number
}) {
  const showTrend = trend !== undefined && Math.abs(trend) > 0.1
  const trendUp = (trend ?? 0) > 0
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center">
          <Icon className="w-4 h-4 text-ink-3" />
        </div>
        {showTrend && (
          <span className={`text-[10px] font-medium flex items-center gap-0.5 ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendUp ? '+' : ''}{trend!.toFixed(1)}pt
          </span>
        )}
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{value}</div>
      <div className="text-ink-3 text-xs mt-0.5">{label}</div>
      <div className="text-[10px] text-ink-4 mt-0.5">{sub}</div>
    </div>
  )
}
