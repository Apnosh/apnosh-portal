'use client'

/**
 * /dashboard/mvp-home — PROOF route for the apnosh-mvp design port.
 *
 * Renders the ported design Home (components/mvp/mvp-home.tsx) wired to
 * REAL data from the existing /api/dashboard/load endpoint. No backend
 * changes: we transform the `homeMetrics.interactions` series + `agenda`
 * approvals into the design's Home shape on the client.
 *
 * Unlinked on purpose — nothing navigates here. Safe to delete. This is
 * a single-screen proof to validate the port pattern before scoping the
 * rest of the design.
 */

import { useEffect, useState } from 'react'
import { useClient } from '@/lib/client-context'
import MvpHome, { type MvpHomeData } from '@/components/mvp/mvp-home'

interface HomeInstance { vals: (number | null)[]; start: string; total: number; breakdown: { label: string; value: string; icon: string }[] }
interface HomeMetric { key: string; label: string; hasData: boolean; week: HomeInstance[]; month: HomeInstance[] }
interface AgendaItem { id: string; type: string; urgency: string; label: string; detail?: string }

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

function monthName(iso: string): string {
  const m = Number(iso.slice(5, 7)) - 1
  return MONTHS[m] ?? ''
}

/* Pull the matching source value out of the interactions breakdown. */
function breakdownVal(inst: HomeInstance | undefined, match: string): string {
  const item = inst?.breakdown.find((b) => b.label.toLowerCase().includes(match))
  return item?.value ?? '—'
}

function transform(homeMetrics: { metrics: HomeMetric[] }, agenda: AgendaItem[], avatarText: string): MvpHomeData {
  const metrics = homeMetrics?.metrics ?? []
  const inter = metrics.find((m) => m.key === 'interactions')
  const bookings = metrics.find((m) => m.key === 'bookings')

  const weeks = inter?.week ?? []
  const thisWeek = weeks[weeks.length - 1]
  const lastWeek = weeks[weeks.length - 2]
  const heroTotal = thisWeek?.total ?? 0
  const weekPct = pct(thisWeek?.total ?? 0, lastWeek?.total ?? 0)

  const months = inter?.month ?? []
  const thisMonth = months[months.length - 1]
  const lastMonth = months[months.length - 2]
  const monthPct = pct(thisMonth?.total ?? 0, lastMonth?.total ?? 0)

  // Daily chart: this week's 7 days over last week's as a ghost.
  const tv = thisWeek?.vals ?? []
  const lv = lastWeek?.vals ?? []
  const chart = DOW.map((label, i) => ({ label, value: Number(tv[i] ?? 0), prev: Number(lv[i] ?? 0) }))

  const bWeek = bookings?.week ?? []
  const bThis = bWeek[bWeek.length - 1]

  const sources: MvpHomeData['sources'] = [
    { key: 'directions', label: 'Directions', value: breakdownVal(thisWeek, 'direction'), configured: true },
    { key: 'calls', label: 'Calls', value: breakdownVal(thisWeek, 'call'), configured: true },
    { key: 'clicks', label: 'Site clicks', value: breakdownVal(thisWeek, 'click'), configured: true },
    { key: 'bookings', label: 'Bookings', value: bThis ? String(bThis.total) : '—', configured: !!(bookings?.hasData) },
  ]

  const approvals = (agenda ?? [])
    .filter((a) => a.type === 'approval')
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      tag: 'NEEDS REVIEW',
      timing: a.urgency === 'high' ? 'Soon' : 'No rush',
      title: a.label,
      subtitle: a.detail ?? 'Drafted by your team',
    }))

  const down = weekPct < 0
  const signal: MvpHomeData['signal'] = down
    ? { state: 'recommendation', metric: 'interactions', message: 'Fewer customers took action this week than last. A fresh post can bring it back up.' }
    : { state: 'ontrack' }

  return {
    greeting: 'Good day',
    avatarText,
    hero: { total: heroTotal, weekPct, down, monthPct, prevMonthLabel: lastMonth ? monthName(lastMonth.start) : '' },
    chart,
    sources,
    signal,
    approvals,
    review: null,
  }
}

export default function MvpHomePage() {
  const { client, loading: clientLoading } = useClient()
  const [data, setData] = useState<MvpHomeData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    fetch(`/api/dashboard/load?clientId=${client.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`)
        return r.json()
      })
      .then((json) => {
        if (!live) return
        const avatar = (client.name?.[0] ?? '·').toUpperCase()
        setData(transform(json.homeMetrics, json.agenda, avatar))
      })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id, client?.name])

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f0f3', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 0' }}>
      <div style={{ width: 430, maxWidth: '100%', minHeight: 800, background: '#fff', borderRadius: 28, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
        {clientLoading || (!data && !error) ? (
          <Centered>Loading your numbers…</Centered>
        ) : error ? (
          <Centered>Couldn&apos;t load: {error}</Centered>
        ) : data ? (
          <MvpHome data={data} />
        ) : (
          <Centered>No client found for this account.</Centered>
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}
