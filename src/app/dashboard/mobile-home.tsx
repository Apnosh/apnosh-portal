'use client'

/**
 * Mobile home — the redesigned, data-wired phone dashboard.
 *
 * Thin wrapper that composes the two ported components:
 *   MobileHomeHero     — metric switcher, big number, avg + trend,
 *                        Week/Month/Year bar chart, trend mini-graph,
 *                        breakdown cards (from homeMetrics)
 *   MobileHomeSections — Needs you, This week recap, Your channels,
 *                        Plan (from homeSections)
 *
 * Both are fed by the consolidated /api/dashboard/load payload and each
 * handles its own empty / not-connected / no-data states.
 */

import { MobileHomeHero } from '@/components/dashboard/mobile-home-hero'
import { MobileHomeSections } from '@/components/dashboard/mobile-home-sections'
import type { HomeMetrics } from '@/lib/dashboard/get-home-metrics'
import type { HomeSectionsData } from '@/lib/dashboard/get-home-sections'

interface Props {
  homeMetrics: HomeMetrics | null
  homeSections: HomeSectionsData | null
}

const EMPTY_SECTIONS: HomeSectionsData = {
  needs: [], plan: [], channels: [],
  week: { shipped: 0, items: '', strategist: null },
}

export default function MobileHome({ homeMetrics, homeSections }: Props) {
  return (
    <>
      <MobileHomeHero metrics={homeMetrics?.metrics ?? []} />
      <MobileHomeSections data={homeSections ?? EMPTY_SECTIONS} />
    </>
  )
}
