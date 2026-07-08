'use client'

/**
 * /dashboard/insights — the owner's "See all insights" deep-dive, in the
 * apnosh-mvp app design. Reached from the home chart's "See all insights" link.
 *
 * Sources the same /api/dashboard/load payload the home uses, so the numbers
 * match exactly, and reuses the home's transform + chart for visual continuity.
 * Renders its own full-screen frame (back header), like the review + campaign
 * detail pages — so it's added to the layout's full-screen-owner allowlist.
 */

import { useEffect, useState } from 'react'
import { useClient } from '@/lib/client-context'
import { transformHome } from '@/components/mvp/home-transform'
import MvpInsights, { type InsightsData } from '@/components/mvp/mvp-insights'

export default function InsightsPage() {
  const { client, loading: clientLoading } = useClient()
  const [data, setData] = useState<InsightsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // deep-link: the home funnel's stages link here as /dashboard/insights?stage=<key>
  // so tapping a stage jumps straight to its matching journey tab.
  const [stageKey, setStageKey] = useState<string | undefined>(undefined)
  useEffect(() => {
    try { setStageKey(new URLSearchParams(window.location.search).get('stage') ?? undefined) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    setData(null)
    fetch(`/api/dashboard/load?clientId=${client.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`)
        return r.json()
      })
      .then((json) => {
        if (!live) return
        const home = transformHome(json.homeMetrics, json.agenda, client.name ?? '·', undefined, json.comingUp)
        const rr = json.recentReviews
        setData({
          businessName: client.name ?? 'Your restaurant',
          metrics: home.metrics,
          reviews: rr?.items ?? [],
          avgRating: rr?.avgRating ?? null,
          totalReviews: rr?.total ?? 0,
          unanswered: json.counts?.unansweredReviews ?? 0,
        })
      })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id, client?.name])

  return <MvpInsights data={data} loading={clientLoading || (!data && !error)} error={error} clientId={client?.id} initialStageKey={stageKey} />
}
