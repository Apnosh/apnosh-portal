'use client'
/**
 * /dashboard/insights/metrics — "Choose your metrics" as its OWN screen (owner
 * 2026-09-04: a sheet over the graph was cramped; a full page with no nav bar and
 * one Done button at the bottom is easier to read and use). Chrome-free via the
 * /dashboard/insights prefix in the layout's MVP allowlist.
 */
import { MetricSettingsPage } from '@/components/mvp/metric-settings'

export default function Page() {
  return <MetricSettingsPage />
}
