'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Users, UserPlus, UserMinus, Tag, TrendingUp, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { EmailListSnapshot, EmailListSegment } from '@/types/database'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function EmailListPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [snapshots, setSnapshots] = useState<EmailListSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('email_list_snapshot')
      .select('*')
      .eq('client_id', client.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(12)
    setSnapshots((data ?? []) as EmailListSnapshot[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['email_list_snapshot'], load)

  const latest = snapshots[0] ?? null
  const previous = snapshots[1] ?? null

  const subGrowth = latest && previous
    ? latest.active_subscribers - previous.active_subscribers
    : 0

  // Reverse for chart (oldest left, newest right)
  const trend = [...snapshots].reverse()
  const maxSubs = Math.max(...trend.map(s => s.active_subscribers), 1)

  const segments: EmailListSegment[] = (latest?.segments as EmailListSegment[]) ?? []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/email-sms" className="text-ink-4 hover:text-ink transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">List & Audience</h1>
          <p className="text-ink-3 text-sm mt-0.5">Your subscriber list at a glance.</p>
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
      ) : !latest ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Users className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No list data yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            Once we connect your email platform, your subscriber stats will appear here each month.
          </p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ListStat
              icon={Users}
              label="Active Subscribers"
              value={latest.active_subscribers.toLocaleString()}
              trend={subGrowth}
              sub={`of ${latest.total_subscribers.toLocaleString()} total`}
            />
            <ListStat
              icon={UserPlus}
              label="New This Month"
              value={latest.new_subscribers.toLocaleString()}
              sub="signups"
              accent="emerald"
            />
            <ListStat
              icon={UserMinus}
              label="Unsubscribed"
              value={latest.unsubscribes.toLocaleString()}
              sub="this month"
              accent="red"
            />
            <ListStat
              icon={Tag}
              label="Segments"
              value={segments.length.toString()}
              sub={segments.length === 1 ? 'active segment' : 'active segments'}
            />
          </div>

          {/* Growth trend */}
          {trend.length >= 2 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4">Subscriber Growth</h2>
              <div className="flex items-end gap-2 h-40">
                {trend.map(s => {
                  const pct = (s.active_subscribers / maxSubs) * 100
                  return (
                    <div key={s.id} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className="w-full bg-brand rounded-t transition-all hover:bg-brand-dark"
                          style={{ height: `${pct}%` }}
                          title={`${s.active_subscribers.toLocaleString()} subscribers`}
                        />
                      </div>
                      <span className="text-[9px] text-ink-4">{MONTH_NAMES[s.month - 1]}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Segments */}
          {segments.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4">Active Segments</h2>
              <div className="space-y-2">
                {segments.map((seg, i) => {
                  const pct = latest.active_subscribers > 0
                    ? (seg.count / latest.active_subscribers) * 100
                    : 0
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-ink-6 last:border-0">
                      <Tag className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate font-medium">{seg.name}</p>
                      </div>
                      <div className="flex-1 max-w-[180px]">
                        <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs font-medium text-ink-2 w-20 text-right">
                        {seg.count.toLocaleString()} <span className="text-ink-4">({pct.toFixed(0)}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {latest.notes && (
            <div className="bg-bg-2 rounded-xl border border-ink-6 p-4">
              <p className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-ink-2 whitespace-pre-wrap">{latest.notes}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ListStat({
  icon: Icon, label, value, sub, trend, accent,
}: {
  icon: typeof Users
  label: string
  value: string
  sub: string
  trend?: number
  accent?: 'emerald' | 'red'
}) {
  const showTrend = trend !== undefined && trend !== 0
  const trendUp = (trend ?? 0) > 0
  const iconBg =
    accent === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
    accent === 'red' ? 'bg-red-50 text-red-600' :
    'bg-bg-2 text-ink-3'

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>
        {showTrend && (
          <span className={`text-[10px] font-medium flex items-center gap-0.5 ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendUp ? '+' : ''}{trend!.toLocaleString()}
          </span>
        )}
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{value}</div>
      <div className="text-ink-3 text-xs mt-0.5">{label}</div>
      <div className="text-[10px] text-ink-4 mt-0.5">{sub}</div>
    </div>
  )
}
