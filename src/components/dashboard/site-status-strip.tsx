'use client'

/**
 * Single-line site status strip — answers the question owners ask
 * most: "is my site working?" — in under a second of glance.
 *
 * Replaces the dedicated /dashboard/website/health page. When
 * something needs attention (uptime degraded, SSL expired, analytics
 * not connected, etc.) the strip's color shifts and a small punch
 * list renders inline below.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, AlertCircle, XCircle, Wifi, WifiOff, Sparkles,
  ArrowRight, Inbox,
} from 'lucide-react'
import { getWebsiteHealth, type WebsiteHealthResult } from '@/lib/website-health-score'

interface Props {
  clientId: string
}

interface StripStat {
  open_requests: number
}

export default function SiteStatusStrip({ clientId }: Props) {
  const [health, setHealth] = useState<WebsiteHealthResult | null>(null)
  const [stats, setStats] = useState<StripStat | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getWebsiteHealth(clientId).catch(() => null),
      fetch(`/api/dashboard/website/status-strip?clientId=${clientId}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    ]).then(([h, s]) => {
      if (cancelled) return
      setHealth(h)
      setStats(s as StripStat | null)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clientId])

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white px-5 py-3">
        <div className="h-5 bg-ink-7 rounded animate-pulse w-2/3" />
      </div>
    )
  }
  if (!health) return null

  const uptime = health.checks.find(c => c.id === 'uptime')
  const analytics = health.checks.find(c => c.id === 'analytics')
  const ssl = health.checks.find(c => c.id === 'ssl')
  const isUp = uptime?.status !== 'fail'
  const issuesCount = health.checks.filter(c => c.status === 'fail').length

  const tone =
    !isUp ? 'red' :
    issuesCount > 0 ? 'amber' :
    health.status === 'great' ? 'green' :
    'amber'

  const ringClass =
    tone === 'green' ? 'border-emerald-200 bg-emerald-50/40' :
    tone === 'amber' ? 'border-amber-200 bg-amber-50/40' :
    'border-rose-200 bg-rose-50/40'

  return (
    <div className={`rounded-2xl border ${ringClass} px-5 py-3`}>
      <div className="flex items-center gap-3 flex-wrap text-[12.5px]">
        {/* Site status */}
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          {isUp
            ? <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            : <WifiOff className="w-3.5 h-3.5 text-rose-600" />}
          {isUp ? 'Site up' : 'Site down'}
        </span>

        <Dot />

        {/* SSL */}
        <Pill
          label={ssl?.status === 'pass' ? 'HTTPS valid' : 'HTTPS check'}
          status={ssl?.status ?? 'warn'}
        />

        <Dot />

        {/* Analytics connection */}
        <Pill
          label={analytics?.status === 'pass' ? 'Analytics flowing' : 'Analytics not connected'}
          status={analytics?.status ?? 'warn'}
        />

        <Dot />

        {/* Open change requests */}
        <span className="inline-flex items-center gap-1.5 text-ink-2">
          <Inbox className="w-3.5 h-3.5 text-ink-3" />
          {stats?.open_requests ?? 0} open request{(stats?.open_requests ?? 0) === 1 ? '' : 's'}
        </span>

        {/* Sparkles + health score on the right */}
        <span className="ml-auto inline-flex items-center gap-1.5 text-ink-3 text-[11.5px]">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          Health <strong className="text-ink-2 tabular-nums">{health.score}/100</strong>
        </span>
      </div>

      {/* Inline punch list — only when there are fixes to do. */}
      {health.topFixes.length > 0 && (
        <ul className="mt-2.5 pt-2.5 border-t border-ink-7 space-y-1.5">
          {health.topFixes.map(fix => (
            <li key={fix.id}>
              <Link href={fix.fixLink} className="flex items-start gap-2 text-[12.5px] text-ink-2 hover:text-ink group">
                {fix.status === 'fail'
                  ? <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                  : <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />}
                <span className="flex-1">
                  <span className="font-medium">{fix.label}:</span>{' '}
                  <span className="text-ink-3">{fix.message}</span>
                </span>
                <ArrowRight className="w-3 h-3 text-ink-4 group-hover:text-ink-2 flex-shrink-0 mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* All-green confirmation */}
      {health.topFixes.length === 0 && (
        <p className="mt-2 text-[11.5px] text-emerald-700 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" />
          Everything looking good.
        </p>
      )}
    </div>
  )
}

function Pill({ label, status }: { label: string; status: 'pass' | 'warn' | 'fail' }) {
  const color =
    status === 'pass' ? 'text-emerald-700' :
    status === 'warn' ? 'text-amber-700' :
    'text-rose-700'
  return <span className={`inline-flex items-center gap-1 ${color}`}>{label}</span>
}

function Dot() {
  return <span className="text-ink-5">·</span>
}
