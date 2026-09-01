'use client'

/**
 * /preview/report — the monthly report with labeled sample data, viewable
 * without an account, so the design can be judged before a data-rich month
 * exists. Nothing here reads real numbers.
 */

import ReportView from '@/components/report/report-view'
import type { MonthlyReport } from '@/lib/report/build-month'

const SAMPLE: MonthlyReport = {
  year: 2026, month: 8, monthLabel: 'August', sealed: true,
  found: {
    total: 1204, prior: 977,
    words: [
      { q: 'restaurant marketing', n: 412 },
      { q: 'apnosh', n: 287 },
      { q: 'social media for restaurants', n: 168 },
      { q: 'marketing agency seattle', n: 74 },
      { q: 'google business help', n: 41 },
    ],
  },
  said: { count: 2, avg: 5.0, priorCount: 1, quote: 'Our Fridays are full for the first time since we opened.' },
  worked: { posts: 6, topTitle: 'the before and after reel', topReach: 2418 },
  moved: { calls: 14, directions: 0, siteClicks: 391, priorCalls: 9, priorDirections: 0, priorSiteClicks: 344 },
}

export default function ReportPreviewPage() {
  return (
    <div>
      <div style={{ position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 50, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f6e56', background: '#f0faf6', border: '1px solid rgba(74,189,152,0.3)', borderRadius: 7, padding: '3px 8px', fontFamily: "'Inter', system-ui, sans-serif" }}>
        Preview · sample numbers
      </div>
      <ReportView report={SAMPLE} bizName="Apnosh" />
    </div>
  )
}
