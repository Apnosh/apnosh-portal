'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Gauge, Check, AlertCircle, ChevronRight, Loader2, Minus } from 'lucide-react'

type CheckStatus = 'pass' | 'fail' | 'unknown'
interface HealthCheck {
  key: string; label: string; status: CheckStatus; weight: number
  detail?: string; fixLabel?: string; fixHref?: string
}
interface ListingHealth {
  connected: boolean; score: number; grade: 'great' | 'good' | 'needs-work'
  passed: number; total: number; checks: HealthCheck[]
}

const GRADE = {
  great: { label: 'Looking great', color: '#16a34a', tint: 'text-green-600' },
  good: { label: 'Pretty good', color: '#d97706', tint: 'text-amber-600' },
  'needs-work': { label: 'Needs attention', color: '#dc2626', tint: 'text-red-600' },
} as const

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 52, c = 2 * Math.PI * r, off = c - (score / 100) * c
  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--ink-6, #e5e5ea)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-bold text-ink leading-none">{score}</span>
        <span className="text-[10px] font-medium text-ink-4 mt-0.5">out of 100</span>
      </div>
    </div>
  )
}

export default function ListingHealthPage() {
  const [data, setData] = useState<ListingHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/listing/health')
      .then(r => r.ok ? r.json() : null)
      .then((d: ListingHealth | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const failed = data?.checks.filter(c => c.status === 'fail') ?? []
  const passed = data?.checks.filter(c => c.status === 'pass') ?? []
  const unknown = data?.checks.filter(c => c.status === 'unknown') ?? []
  const grade = data ? GRADE[data.grade] : GRADE.good

  return (
    <div className="max-w-[760px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Local SEO</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Gauge className="w-6 h-6 text-brand" />
          Listing health
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          How complete and competitive your Google listing is, with the exact fixes to climb higher.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-10 flex items-center justify-center text-ink-3">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {!loading && !data && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          We couldn&rsquo;t load your listing health right now. Try again in a moment.
        </div>
      )}

      {!loading && data && (
        <>
          {/* Score */}
          <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-6 flex items-center gap-6">
            <ScoreRing score={data.score} color={grade.color} />
            <div>
              <p className={'text-lg font-semibold ' + grade.tint}>{grade.label}</p>
              <p className="text-sm text-ink-3 mt-1">
                {data.passed} of {data.total} checks passing.
                {failed.length > 0 && ` Fix ${failed.length} thing${failed.length === 1 ? '' : 's'} to score higher.`}
              </p>
            </div>
          </div>

          {/* Needs attention */}
          {failed.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 px-1">Fix these</div>
              {failed.map(c => (
                <div key={c.key} className="rounded-2xl bg-white ring-1 ring-ink-6 p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{c.label}</p>
                    {c.detail && <p className="text-sm text-ink-3 mt-0.5 leading-relaxed">{c.detail}</p>}
                  </div>
                  {c.fixHref && (
                    <Link href={c.fixHref}
                      className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1 transition-colors flex-shrink-0">
                      {c.fixLabel ?? 'Fix'} <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Looking good */}
          {passed.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 px-1">Looking good</div>
              <div className="rounded-2xl bg-white ring-1 ring-ink-6 divide-y divide-ink-6">
                {passed.map(c => (
                  <div key={c.key} className="p-3.5 flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-600" />
                    </span>
                    <span className="text-sm text-ink-2">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unknown (couldn't read) */}
          {unknown.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 px-1">Couldn&rsquo;t check</div>
              <div className="rounded-2xl bg-bg-2 ring-1 ring-ink-6 divide-y divide-ink-6">
                {unknown.map(c => (
                  <div key={c.key} className="p-3.5 flex items-center gap-2.5">
                    <Minus className="w-4 h-4 text-ink-4 flex-shrink-0" />
                    <span className="text-sm text-ink-3">{c.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-4 px-1">
                We couldn&rsquo;t read these from Google just now (connection or sync). They don&rsquo;t count against your score.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
