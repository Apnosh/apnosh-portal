export type ViewType = 'visibility' | 'foot_traffic'
export type TimeRange = '1W' | '1M' | '3M' | '6M' | '1Y'
export type InsightIcon = 'star' | 'clock' | 'map' | 'trending' | 'alert'

export interface DashboardMetric {
  label: string
  value: string
  subtitle: string
  trend: string
  up: boolean
  sparkline: number[]
}

export interface DashboardInsight {
  icon: InsightIcon
  title: string
  subtitle: string
}

export interface ChartData {
  data: number[]
  labels: string[]
  /** Same buckets, same metric, but shifted 365 days back. When present
      the TrendChart renders this as a dashed grey overlay so the client
      can see 'are we up or down vs the same time last year' visually
      without having to read the % delta. */
  prevYearData?: number[]
}

export interface DashboardView {
  headline: string
  up: boolean
  ctx: string
  num: string
  unit: string
  pct: string
  pctFull: string
  bdtitle: string
  bmy: number
  bmavg: number
  bmmax: number
  rank: string
  metrics: DashboardMetric[]
  insights: DashboardInsight[]
  am: {
    name: string
    initials: string
    role: string
    note: string
  }
  chartData: Record<TimeRange, ChartData>
  /* Optional per-range hero + metrics so the time-range tabs can drive
     the headline numbers, not just the chart. When present, the page
     swaps in byRange[timeRange] for num/pct/pctFull/up/metrics. */
  byRange?: Record<TimeRange, {
    num: string
    pct: string
    pctFull: string
    up: boolean
    metrics: DashboardMetric[]
  }>
}

export interface ActionItem {
  icon: 'inbox' | 'alert' | 'message' | 'check'
  title: string
  href: string
}

export type HealthSignal = 'green' | 'amber' | 'red'

export interface DashboardData {
  visibility: DashboardView
  footTraffic: DashboardView
  businessName: string
  // Executive summary extensions
  healthSignal: HealthSignal
  healthHeadline: string
  pendingApprovals: number
  actionItems: ActionItem[]
}
