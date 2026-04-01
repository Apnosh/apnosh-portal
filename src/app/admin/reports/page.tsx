'use client'

import {
  TrendingUp, TrendingDown, DollarSign, UserMinus, Heart, UserCheck,
  Star,
} from 'lucide-react'

// ── Revenue Stats ────────────────────────────────────────────────────

const revenueStats = [
  { label: 'MRR', value: '$12,840', change: '+8.3%', up: true, icon: DollarSign, color: 'bg-brand-tint text-brand-dark' },
  { label: 'Churn Rate', value: '4.2%', change: '-1.1%', up: true, icon: UserMinus, color: 'bg-red-50 text-red-600' },
  { label: 'Avg LTV', value: '$3,420', change: '+12%', up: true, icon: Heart, color: 'bg-purple-50 text-purple-600' },
  { label: 'ARPU', value: '$535', change: '+3.7%', up: true, icon: UserCheck, color: 'bg-blue-50 text-blue-600' },
]

// ── Client Health ────────────────────────────────────────────────────

interface ClientHealth {
  name: string
  plan: string
  monthlyValue: string
  approvalSpeed: string
  engagement: string
  healthScore: number
}

const clientHealth: ClientHealth[] = [
  { name: 'Casa Priya', plan: 'Social Media Growth', monthlyValue: '$449', approvalSpeed: '4h', engagement: '5.2%', healthScore: 9 },
  { name: 'Lumina Boutique', plan: 'Website + Social', monthlyValue: '$599', approvalSpeed: '8h', engagement: '4.1%', healthScore: 8 },
  { name: 'Golden Wok', plan: 'Brand Identity', monthlyValue: '$499', approvalSpeed: '6h', engagement: '4.8%', healthScore: 8 },
  { name: 'Peak Fitness', plan: 'Email Starter', monthlyValue: '$199', approvalSpeed: '12h', engagement: '3.4%', healthScore: 7 },
  { name: 'Bloom & Gather', plan: 'Content Calendar', monthlyValue: '$299', approvalSpeed: '18h', engagement: '3.9%', healthScore: 7 },
  { name: 'Zara Legal', plan: 'LinkedIn Growth', monthlyValue: '$349', approvalSpeed: '24h', engagement: '2.8%', healthScore: 6 },
  { name: 'Vesta Bakery', plan: 'A La Carte', monthlyValue: '$140', approvalSpeed: '36h', engagement: '2.1%', healthScore: 5 },
  { name: 'Solstice Yoga', plan: 'Social Media Starter', monthlyValue: '$199', approvalSpeed: '48h', engagement: '1.9%', healthScore: 4 },
  { name: 'TrueNorth Realty', plan: 'A La Carte', monthlyValue: '$320', approvalSpeed: '72h', engagement: '1.2%', healthScore: 3 },
  { name: 'Atlas Consulting', plan: 'Strategy Only', monthlyValue: '$250', approvalSpeed: '96h', engagement: '0.8%', healthScore: 2 },
]

// ── Service Popularity ──────────────────────────────────────────────

const services = [
  { name: 'Social Media', percent: 42 },
  { name: 'Websites', percent: 18 },
  { name: 'Local SEO', percent: 15 },
  { name: 'Email', percent: 12 },
  { name: 'Branding', percent: 8 },
  { name: 'Other', percent: 5 },
]

// ── Team Performance ────────────────────────────────────────────────

interface TeamPerf {
  name: string
  initials: string
  color: string
  deliverables: number
  onTimeRate: string
  revisionRate: string
  avgRating: number
}

const teamPerformance: TeamPerf[] = [
  { name: 'Sarah K.', initials: 'SK', color: 'bg-rose-100 text-rose-700', deliverables: 24, onTimeRate: '96%', revisionRate: '12%', avgRating: 4.8 },
  { name: 'Mike R.', initials: 'MR', color: 'bg-blue-100 text-blue-700', deliverables: 18, onTimeRate: '92%', revisionRate: '18%', avgRating: 4.6 },
  { name: 'Alex T.', initials: 'AT', color: 'bg-violet-100 text-violet-700', deliverables: 21, onTimeRate: '95%', revisionRate: '8%', avgRating: 4.9 },
  { name: 'Jordan L.', initials: 'JL', color: 'bg-amber-100 text-amber-700', deliverables: 14, onTimeRate: '93%', revisionRate: '15%', avgRating: 4.7 },
]

// ── Helpers ──────────────────────────────────────────────────────────

function healthColor(score: number) {
  if (score >= 7) return { bg: 'bg-green-100', text: 'text-green-700' }
  if (score >= 4) return { bg: 'bg-amber-100', text: 'text-amber-700' }
  return { bg: 'bg-red-100', text: 'text-red-700' }
}

function ratingStars(rating: number) {
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5
  return { full, half, empty: 5 - full - (half ? 1 : 0) }
}

// ── Component ────────────────────────────────────────────────────────

export default function ReportsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Reports</h1>
        <p className="text-ink-3 text-sm mt-1">Business analytics and team performance overview.</p>
      </div>

      {/* Revenue Stats */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Revenue</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {revenueStats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-4 hover:shadow-sm transition-shadow">
              <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{stat.value}</div>
              <div className="text-xs text-ink-4 mt-0.5">{stat.label}</div>
              <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${stat.up ? 'text-emerald-600' : 'text-red-500'}`}>
                {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {stat.change} vs last month
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Client Health */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Client Health</h2>
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-6">
                  <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Client</th>
                  <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Plan</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Monthly Value</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Approval Speed</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Engagement</th>
                  <th className="text-center font-medium text-ink-4 text-xs px-5 py-3">Health Score</th>
                </tr>
              </thead>
              <tbody>
                {clientHealth
                  .sort((a, b) => b.healthScore - a.healthScore)
                  .map((client) => {
                    const hc = healthColor(client.healthScore)
                    return (
                      <tr key={client.name} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                        <td className="px-5 py-3 font-medium text-ink">{client.name}</td>
                        <td className="px-5 py-3 text-ink-3">{client.plan}</td>
                        <td className="px-5 py-3 text-right font-medium text-ink">{client.monthlyValue}</td>
                        <td className="px-5 py-3 text-right text-ink-3">{client.approvalSpeed}</td>
                        <td className="px-5 py-3 text-right text-ink-3">{client.engagement}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${hc.bg} ${hc.text}`}>
                            {client.healthScore}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Service Popularity */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Service Popularity</h2>
        <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-3">
          {services.map((service) => (
            <div key={service.name} className="flex items-center gap-4">
              <div className="w-28 flex-shrink-0">
                <span className="text-sm font-medium text-ink">{service.name}</span>
              </div>
              <div className="flex-1 h-6 bg-ink-6 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full flex items-center justify-end pr-2 transition-all"
                  style={{ width: `${service.percent}%`, minWidth: service.percent > 8 ? undefined : '2rem' }}
                >
                  {service.percent > 8 && (
                    <span className="text-[11px] font-bold text-white">{service.percent}%</span>
                  )}
                </div>
              </div>
              {service.percent <= 8 && (
                <span className="text-xs font-medium text-ink-3 w-10 text-right">{service.percent}%</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Team Performance */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Team Performance</h2>
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-6">
                  <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Team Member</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Deliverables</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">On-Time Rate</th>
                  <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Revision Rate</th>
                  <th className="text-center font-medium text-ink-4 text-xs px-5 py-3">Avg Client Rating</th>
                </tr>
              </thead>
              <tbody>
                {teamPerformance.map((member) => {
                  const stars = ratingStars(member.avgRating)
                  return (
                    <tr key={member.name} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${member.color} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-[11px] font-bold">{member.initials}</span>
                          </div>
                          <span className="font-medium text-ink">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-[family-name:var(--font-display)] text-lg text-ink">{member.deliverables}</span>
                        <span className="text-xs text-ink-4 ml-1">this month</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-sm font-medium ${
                          parseFloat(member.onTimeRate) >= 95 ? 'text-green-600' : parseFloat(member.onTimeRate) >= 90 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {member.onTimeRate}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-sm font-medium ${
                          parseFloat(member.revisionRate) <= 10 ? 'text-green-600' : parseFloat(member.revisionRate) <= 15 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {member.revisionRate}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: stars.full }).map((_, i) => (
                              <Star key={`f${i}`} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            ))}
                            {stars.half && (
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/50" />
                            )}
                            {Array.from({ length: stars.empty }).map((_, i) => (
                              <Star key={`e${i}`} className="w-3.5 h-3.5 text-ink-5" />
                            ))}
                          </div>
                          <span className="text-xs font-medium text-ink-3 ml-1">{member.avgRating}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
