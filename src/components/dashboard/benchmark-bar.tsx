'use client'

import { useEffect, useRef } from 'react'

interface BenchmarkBarProps {
  yourValue: number
  avgValue: number
  maxValue: number
  rank: string
  yourFormatted: string
  avgFormatted: string
  animationKey: string
}

export default function BenchmarkBar({
  yourValue,
  avgValue,
  maxValue,
  rank,
  yourFormatted,
  avgFormatted,
  animationKey,
}: BenchmarkBarProps) {
  const youRef = useRef<HTMLDivElement>(null)
  const avgRef = useRef<HTMLDivElement>(null)
  const noBenchmark = avgValue <= 0 || maxValue <= 0

  useEffect(() => {
    const youPct = Math.min((yourValue / maxValue) * 100, 100)
    const avgPct = Math.min((avgValue / maxValue) * 100, 100)

    // Reset to 0 width then animate
    if (youRef.current) {
      youRef.current.style.width = '0%'
      setTimeout(() => {
        if (youRef.current) youRef.current.style.width = `${youPct}%`
      }, 100)
    }
    if (avgRef.current) {
      avgRef.current.style.width = '0%'
      setTimeout(() => {
        if (avgRef.current) avgRef.current.style.width = `${avgPct}%`
      }, 100)
    }
  }, [yourValue, avgValue, maxValue, animationKey])

  if (noBenchmark) {
    return (
      <div className="pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: 'var(--db-black)' }}>
          Compared to nearby businesses
        </h2>
        <div
          className="rounded-[14px] p-5 text-center"
          style={{ background: 'var(--db-bg-2)' }}
        >
          <p className="text-[13px]" style={{ color: 'var(--db-ink-3)' }}>
            Benchmark data isn&apos;t available yet for your area. We&apos;ll surface it here once we have enough peer data.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
      <h2 className="text-[15px] font-bold mb-4" style={{ color: 'var(--db-black)' }}>
        Compared to nearby businesses
      </h2>
      <div
        className="flex items-center gap-5 max-sm:flex-col max-sm:items-stretch max-sm:gap-3 rounded-[14px] p-5"
        style={{ background: 'var(--db-bg-2)' }}
      >
        {/* You */}
        <div className="min-w-[70px] text-center max-sm:flex max-sm:items-center max-sm:gap-2.5 max-sm:text-left">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--db-ink-3)' }}>
            You
          </div>
          <div
            className="text-[22px] font-bold"
            style={{ color: 'var(--db-black)', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}
          >
            {yourFormatted}
          </div>
          <div
            className="inline-block text-[10px] font-bold rounded px-2 py-0.5 mt-1"
            style={{
              color: 'var(--db-up)',
              background: 'var(--db-up-bg)',
            }}
          >
            {rank}
          </div>
        </div>

        {/* Bars */}
        <div className="flex-1 space-y-2">
          <div className="h-2 rounded-full" style={{ background: 'var(--db-bg-3)' }}>
            <div
              ref={youRef}
              className="h-full rounded-full"
              style={{
                background: 'var(--db-up)',
                transition: 'width 1.2s cubic-bezier(.16,1,.3,1)',
                width: '0%',
              }}
            />
          </div>
          <div className="h-2 rounded-full" style={{ background: 'var(--db-bg-3)' }}>
            <div
              ref={avgRef}
              className="h-full rounded-full"
              style={{
                background: '#ccc',
                transition: 'width 1.2s cubic-bezier(.16,1,.3,1)',
                width: '0%',
              }}
            />
          </div>
        </div>

        {/* Area avg */}
        <div className="min-w-[70px] text-center max-sm:flex max-sm:items-center max-sm:gap-2.5 max-sm:text-left">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--db-ink-3)' }}>
            Area avg
          </div>
          <div
            className="text-[22px] font-bold"
            style={{ color: 'var(--db-ink-3)', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}
          >
            {avgFormatted}
          </div>
        </div>
      </div>
    </div>
  )
}
