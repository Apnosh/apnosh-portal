'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertCircle, XCircle, Sparkles, ArrowRight } from 'lucide-react'
import { getWebsiteHealth, type WebsiteHealthResult } from '@/lib/website-health-score'

export default function WebsiteHealthCard({ clientId }: { clientId: string }) {
  const [data, setData] = useState<WebsiteHealthResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getWebsiteHealth(clientId)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clientId])

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="animate-pulse h-32" />
      </div>
    )
  }
  if (!data) return null

  const ringColor = data.status === 'great' ? 'text-emerald-600' : data.status === 'good' ? 'text-amber-500' : 'text-rose-500'
  const headline = data.status === 'great'
    ? 'Your website is in great shape'
    : data.status === 'good'
      ? 'Your website is solid with room to improve'
      : 'Your website needs attention'

  const r = 28
  const c = 2 * Math.PI * r
  const offset = c - (data.score / 100) * c

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={r} stroke="currentColor" strokeWidth="6" fill="none" className="text-ink-7" />
            <circle
              cx="36" cy="36" r={r}
              stroke="currentColor" strokeWidth="6" fill="none"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              transform="rotate(-90 36 36)"
              className={ringColor}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-[18px] font-semibold text-ink tabular-nums">{data.score}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Website health</h2>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">{headline}</p>

          {data.topFixes.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data.topFixes.map(fix => (
                <li key={fix.id}>
                  <Link
                    href={fix.fixLink}
                    className="flex items-start gap-2 text-[12.5px] text-ink-2 hover:text-ink group"
                  >
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

          {data.topFixes.length === 0 && (
            <p className="mt-3 text-[12.5px] text-emerald-700 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All checks passing. Nice work.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
