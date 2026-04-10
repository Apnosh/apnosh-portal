'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Activity, Wifi, WifiOff, Gauge, ShieldCheck, Clock,
  CheckCircle, XCircle, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { WebsiteHealth, UptimeStatus } from '@/types/database'

const STATUS_CONFIG: Record<UptimeStatus, { label: string; color: string; icon: typeof Wifi }> = {
  up: { label: 'Online', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: Wifi },
  down: { label: 'Down', color: 'text-red-600 bg-red-50 border-red-200', icon: WifiOff },
  degraded: { label: 'Degraded', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: AlertCircle },
  unknown: { label: 'Unknown', color: 'text-ink-3 bg-bg-2 border-ink-6', icon: AlertCircle },
}

function ScoreBar({ score, label }: { score: number | null; label: string }) {
  if (score == null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-ink-2 font-medium">{label}</span>
          <span className="text-xs text-ink-4">No data</span>
        </div>
        <div className="h-2 bg-bg-2 rounded-full" />
      </div>
    )
  }

  const color = score >= 90 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
  const label2 = score >= 90 ? 'Fast' : score >= 50 ? 'Moderate' : 'Slow'

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-ink-2 font-medium">{label}</span>
        <span className="text-sm text-ink">
          {score}<span className="text-ink-4">/100</span>
          <span className="text-[10px] text-ink-4 ml-2 uppercase tracking-wide">{label2}</span>
        </span>
      </div>
      <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

export default function WebsiteHealthPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [health, setHealth] = useState<WebsiteHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const { data } = await supabase
      .from('website_health')
      .select('*')
      .eq('client_id', client.id)
      .maybeSingle()

    setHealth(data as WebsiteHealth | null)
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['website_health'], load)

  if (clientLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-ink-6 rounded" />
        <div className="bg-white rounded-xl border border-ink-6 h-64" />
      </div>
    )
  }

  const statusConfig = health ? STATUS_CONFIG[health.uptime_status] : STATUS_CONFIG.unknown
  const StatusIcon = statusConfig.icon

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/website" className="text-ink-4 hover:text-ink transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-2">
            <Activity className="w-6 h-6 text-ink-4" />
            Site Health
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">Uptime, speed, security, and content freshness.</p>
        </div>
      </div>

      {!health ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Activity className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No health data yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            Your Apnosh team will publish site health snapshots here including uptime, PageSpeed scores, and SSL status.
          </p>
        </div>
      ) : (
        <>
          {/* Status banner */}
          <div className={`rounded-xl border p-5 flex items-center gap-4 ${statusConfig.color}`}>
            <StatusIcon className="w-8 h-8 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-lg font-semibold">{statusConfig.label}</div>
              {health.uptime_pct_30d != null && (
                <div className="text-sm mt-0.5">{health.uptime_pct_30d}% uptime over the last 30 days</div>
              )}
            </div>
          </div>

          {/* PageSpeed */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-ink-4" />
              PageSpeed
            </h2>
            <div className="space-y-4">
              <ScoreBar score={health.pagespeed_mobile} label="Mobile" />
              <ScoreBar score={health.pagespeed_desktop} label="Desktop" />
            </div>
            <p className="text-[11px] text-ink-4 mt-4">Scores are out of 100. 90+ is considered fast.</p>
          </div>

          {/* Security */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-ink-4" />
              Security
            </h2>
            <div className="flex items-center gap-3">
              {health.ssl_valid == null ? (
                <>
                  <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-ink-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">SSL Status Unknown</div>
                    <div className="text-xs text-ink-3">Not yet verified</div>
                  </div>
                </>
              ) : health.ssl_valid ? (
                <>
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">SSL Certificate Valid</div>
                    <div className="text-xs text-ink-3">
                      {health.ssl_expires_at
                        ? `Expires ${new Date(health.ssl_expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                        : 'No expiration date recorded'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">SSL Certificate Invalid</div>
                    <div className="text-xs text-red-600">Needs immediate attention</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Content freshness */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-ink-4" />
              Content Freshness
            </h2>
            {health.last_content_update_at ? (
              <div>
                <div className="text-sm text-ink">
                  Last updated{' '}
                  <span className="font-medium">
                    {new Date(health.last_content_update_at).toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="text-xs text-ink-3 mt-1">
                  {daysAgo(health.last_content_update_at)} days ago
                </div>
              </div>
            ) : (
              <div className="text-sm text-ink-3">No content update recorded</div>
            )}
          </div>

          {health.notes && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-2">Notes from your team</h2>
              <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{health.notes}</p>
            </div>
          )}

          <p className="text-[11px] text-ink-4 text-center">
            Updated {new Date(health.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </>
      )}
    </div>
  )
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}
