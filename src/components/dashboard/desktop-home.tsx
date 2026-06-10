'use client'

/**
 * Desktop home — a real desktop layout that reuses the mobile pieces so
 * the data and the look stay identical, just arranged to fill a wide
 * screen instead of a single phone column:
 *
 *   ┌───────────────────────────┬──────────────────────┐
 *   │  Metric + chart (hero)     │  Needs you           │
 *   │  big number, W/M/Y graph,  │  This week recap     │
 *   │  breakdown tiles, trend    │  Your channels       │
 *   ├───────────────────────────┴──────────────────────┤
 *   │  Plan — full-width grid of opportunity cards      │
 *   └───────────────────────────────────────────────────┘
 *
 * The Plan row is a wrapping card grid here (not the mobile horizontal
 * slider), since desktop has the room to show every card at once.
 *
 * Loading / failure are handled up top; once data is present each piece
 * renders its own empty / not-connected / no-data states (same as mobile).
 */

import { MobileHomeHero } from '@/components/dashboard/mobile-home-hero'
import {
  NeedsSection,
  WeekSection,
  ChannelsSection,
  PlanSection,
  type HomeSectionsData,
} from '@/components/dashboard/mobile-home-sections'
import type { HomeMetrics } from '@/lib/dashboard/get-home-metrics'

interface Props {
  homeMetrics: HomeMetrics | null
  homeSections: HomeSectionsData | null
  loading?: boolean
  failed?: boolean
}

const EMPTY_SECTIONS: HomeSectionsData = {
  needs: [], plan: [], channels: [],
  week: { shipped: 0, items: '', strategist: null },
}

function Skeleton() {
  return (
    <div className="m-home home-desk" aria-hidden>
      <div className="hd-main">
        <div className="hd-hero">
          <div className="mh-skel skel-eyebrow" />
          <div className="mh-skel skel-num" />
          <div className="mh-skel skel-chart" />
          <div className="skel-cards">
            {[0, 1, 2, 3].map(i => <div key={i} className="mh-skel skel-card" />)}
          </div>
        </div>
        <div className="hd-side">
          <div className="mh-skel skel-eyebrow" style={{ marginBottom: 0 }} />
          {[0, 1, 2].map(i => <div key={i} className="mh-skel skel-line" />)}
        </div>
      </div>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="m-home home-desk">
      <div className="mh-error">
        <p className="er-t">Couldn&rsquo;t load your dashboard</p>
        <p className="er-s">Check your connection and try again.</p>
        <button type="button" onClick={() => { if (typeof window !== 'undefined') window.location.reload() }}>Try again</button>
      </div>
    </div>
  )
}

export default function DesktopHome({ homeMetrics, homeSections, loading, failed }: Props) {
  if (loading) return <Skeleton />
  if (failed) return <ErrorState />

  const s = homeSections ?? EMPTY_SECTIONS

  return (
    <div className="m-home home-desk">
      <div className="hd-main">
        <div className="hd-hero">
          <MobileHomeHero metrics={homeMetrics?.metrics ?? []} />
        </div>
        <div className="hd-side">
          <NeedsSection needs={s.needs} />
          <WeekSection week={s.week} />
          <ChannelsSection channels={s.channels} />
        </div>
      </div>
      <PlanSection plan={s.plan} />
    </div>
  )
}
