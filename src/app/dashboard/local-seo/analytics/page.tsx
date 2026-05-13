/**
 * /dashboard/local-seo/analytics — full analytics view for the
 * connected Google Business Profile listing.
 *
 * Reads the per-client gbp_metrics rows our sync populates, rolls
 * them into the requested date range, and renders charts + KPI
 * tiles + day-level table. Replaces the older /dashboard/analytics
 * page (which used CSV-uploaded gbp_monthly_data) for clients with
 * a live OAuth connection.
 */

import AnalyticsView from './analytics-view'

export const dynamic = 'force-dynamic'

export default function AnalyticsPage() {
  return <AnalyticsView />
}
