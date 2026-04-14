import type { DashboardData, DashboardView, TimeRange, ChartData } from '@/types/dashboard'

/**
 * Fallback data matching the mockup (The Golden Spoon).
 * Used when Supabase tables are empty or during development.
 */
export function getFallbackDashboardData(): DashboardData {
  return {
    businessName: 'The Golden Spoon',
    visibility: FALLBACK_VISIBILITY,
    footTraffic: FALLBACK_FOOT_TRAFFIC,
  }
}

// ---------------------------------------------------------------------------
// Visibility view — matches mockup DATA.v exactly
// ---------------------------------------------------------------------------

const FALLBACK_VISIBILITY: DashboardView = {
  headline: "You're growing",
  up: true,
  ctx: 'People who discovered you',
  num: '4,284',
  unit: 'people',
  pct: '+18%',
  pctFull: '+18% from last month',
  bdtitle: "What's driving visibility",
  bmy: 4284,
  bmavg: 2800,
  bmmax: 6200,
  rank: 'Top 25%',
  metrics: [
    {
      label: 'Social reach',
      value: '8,412',
      subtitle: 'People who saw your content',
      trend: '+22%',
      up: true,
      sparkline: [320, 380, 340, 420, 460, 410, 490, 520, 480, 560, 590, 620],
    },
    {
      label: 'Profile visits',
      value: '1,847',
      subtitle: 'People who checked your page',
      trend: '+14%',
      up: true,
      sparkline: [120, 140, 130, 155, 148, 162, 170, 165, 180, 190, 185, 200],
    },
    {
      label: 'Impressions',
      value: '12.3k',
      subtitle: 'Times your content was shown',
      trend: '+9%',
      up: true,
      sparkline: [800, 820, 790, 860, 840, 880, 910, 890, 920, 950, 930, 970],
    },
    {
      label: 'New followers',
      value: '+143',
      subtitle: 'People who followed you',
      trend: '+31%',
      up: true,
      sparkline: [8, 12, 10, 14, 11, 16, 18, 15, 20, 22, 19, 24],
    },
  ],
  insights: [
    {
      icon: 'star',
      title: 'Your reel reached 2,100 people in Capitol Hill',
      subtitle: 'Video is reaching 3x more people than photos right now.',
    },
    {
      icon: 'clock',
      title: 'Tuesday lunch is your sweet spot',
      subtitle: 'Posts at 11am-1pm get 40% more engagement.',
    },
  ],
  am: {
    name: 'Jordan Lee',
    initials: 'JL',
    role: 'Your account manager',
    note: "Great month \u2014 your tasting menu reel was the top performer across all our restaurant clients this week. We're doubling down on video content for November. I'd recommend scheduling a 15-min photo session to build up your content library.",
  },
  chartData: {
    '1W': {
      data: [142, 138, 155, 148, 162, 158, 170, 165, 178, 172, 185, 180, 192, 188, 196, 190, 204, 198, 210, 205, 218, 212, 225, 220, 232, 228, 238, 234, 245, 248],
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    },
    '1M': {
      data: [120, 118, 125, 130, 128, 135, 140, 138, 145, 142, 150, 148, 155, 152, 160, 158, 165, 162, 170, 168, 175, 172, 178, 176, 182, 180, 188, 186, 192, 190, 198, 196, 204, 202, 210, 208, 215, 212, 220, 218, 225, 228, 232],
      labels: ['Oct 1', 'Oct 8', 'Oct 15', 'Oct 22', 'Nov 1'],
    },
    '3M': {
      data: [80, 85, 90, 88, 95, 92, 98, 96, 102, 100, 108, 105, 112, 110, 118, 115, 120, 118, 125, 122, 130, 128, 135, 132, 140, 138, 145, 142, 150, 148, 155, 152, 160, 158, 165, 162, 170, 168, 175, 172, 180, 178, 185, 182, 190, 188, 195, 198, 205, 210, 215],
      labels: ['Aug', 'Sep', 'Oct', 'Nov'],
    },
    '6M': {
      data: [50, 55, 52, 58, 56, 62, 60, 65, 63, 68, 66, 72, 70, 75, 73, 78, 76, 82, 80, 85, 83, 88, 86, 92, 90, 95, 93, 98, 96, 102, 100, 108, 105, 112, 110, 118, 115, 122, 120, 128, 125, 132, 130, 138, 142, 148, 155, 162, 170, 178, 190, 210],
      labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
    },
    '1Y': {
      data: [20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72, 75, 78, 80, 82, 85, 88, 90, 92, 95, 98, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 178, 185, 192, 200, 210, 220, 232, 240, 248],
      labels: ["Nov '23", 'Feb', 'May', 'Aug', 'Nov'],
    },
  },
}

// ---------------------------------------------------------------------------
// Foot traffic view — matches mockup DATA.f exactly
// ---------------------------------------------------------------------------

const FALLBACK_FOOT_TRAFFIC: DashboardView = {
  headline: 'Traffic is climbing',
  up: true,
  ctx: 'People taking action to visit',
  num: '312',
  unit: 'actions',
  pct: '+24%',
  pctFull: '+24% from last month',
  bdtitle: "What's driving foot traffic",
  bmy: 312,
  bmavg: 195,
  bmmax: 520,
  rank: 'Top 30%',
  metrics: [
    {
      label: 'Directions',
      value: '187',
      subtitle: 'People who got directions to you',
      trend: '+28%',
      up: true,
      sparkline: [12, 15, 13, 18, 16, 20, 22, 19, 25, 24, 28, 30],
    },
    {
      label: 'Phone calls',
      value: '64',
      subtitle: 'Calls from your Google listing',
      trend: '+11%',
      up: true,
      sparkline: [4, 5, 4, 6, 5, 7, 6, 7, 8, 7, 8, 9],
    },
    {
      label: 'Website clicks',
      value: '61',
      subtitle: 'Visits to your site from Google',
      trend: '+19%',
      up: true,
      sparkline: [3, 4, 3, 5, 4, 6, 5, 6, 7, 6, 7, 8],
    },
    {
      label: 'Search views',
      value: '2.8k',
      subtitle: 'Times you appeared in search',
      trend: '+16%',
      up: true,
      sparkline: [180, 200, 190, 220, 210, 240, 230, 250, 260, 250, 270, 290],
    },
  ],
  insights: [
    {
      icon: 'map',
      title: 'Directions up 28% this month',
      subtitle: 'Google Business posts are driving visits.',
    },
    {
      icon: 'clock',
      title: 'Friday evenings are peak',
      subtitle: 'Dinner searchers are finding you.',
    },
  ],
  am: {
    name: 'Jordan Lee',
    initials: 'JL',
    role: 'Your account manager',
    note: "Your Google Business Profile is really picking up. The weekly posts we started last month are paying off \u2014 directions requests are at an all-time high. Let's add some Q&A posts next to capture more search traffic.",
  },
  chartData: {
    '1W': {
      data: [8, 10, 9, 12, 11, 14, 13, 15, 14, 16, 15, 18, 17, 19, 18, 20, 19, 22, 21, 24, 23, 25, 24, 26, 25, 28, 27, 30, 32, 35],
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    },
    '1M': {
      data: [5, 6, 5, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20, 19, 21, 20, 22, 21, 23, 22, 24, 25, 26, 28, 30, 32],
      labels: ['Oct 1', 'Oct 8', 'Oct 15', 'Oct 22', 'Nov 1'],
    },
    '3M': {
      data: [3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18, 19, 20, 20, 21, 22, 23, 24, 25, 26, 28, 30, 32],
      labels: ['Aug', 'Sep', 'Oct', 'Nov'],
    },
    '6M': {
      data: [2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 34, 35],
      labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
    },
    '1Y': {
      data: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 34, 35, 36, 38, 40],
      labels: ["Nov '23", 'Feb', 'May', 'Aug', 'Nov'],
    },
  },
}
