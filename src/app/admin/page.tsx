import { Users, ShoppingBag, DollarSign, Clock, ArrowUpRight } from 'lucide-react'

const stats = [
  { label: 'Total Clients', value: '24', change: '+3 this month', icon: Users, color: 'bg-brand-tint text-brand-dark' },
  { label: 'Active Orders', value: '18', change: '5 due this week', icon: ShoppingBag, color: 'bg-blue-50 text-blue-600' },
  { label: 'Revenue (MTD)', value: '$12,840', change: '+18% vs last month', icon: DollarSign, color: 'bg-green-50 text-green-600' },
  { label: 'Pending Deliverables', value: '7', change: '2 overdue', icon: Clock, color: 'bg-amber-50 text-amber-600' },
]

const recentOrders = [
  { client: 'Casa Priya', service: 'Social Media Growth', status: 'In Progress', amount: '$449/mo', date: 'Mar 22' },
  { client: 'Vesta Bakery', service: '4x Feed Posts', status: 'Pending Review', amount: '$140', date: 'Mar 21' },
  { client: 'Lumina Boutique', service: 'Website Redesign', status: 'Client Review', amount: '$1,299', date: 'Mar 20' },
  { client: 'Peak Fitness', service: 'Email Setup', status: 'Completed', amount: '$199', date: 'Mar 19' },
  { client: 'Golden Wok', service: 'Logo & Branding', status: 'In Progress', amount: '$499', date: 'Mar 18' },
]

const statusColors: Record<string, string> = {
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Pending Review': 'bg-amber-50 text-amber-700 border-amber-200',
  'Client Review': 'bg-purple-50 text-purple-700 border-purple-200',
  'Completed': 'bg-green-50 text-green-700 border-green-200',
}

export default function AdminDashboard() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Admin Dashboard</h1>
        <p className="text-ink-3 text-sm mt-1">Overview of all client activity and team workload.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-4">
            <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{stat.value}</div>
            <div className="text-xs text-ink-4 mt-0.5">{stat.label}</div>
            <div className="text-[10px] text-brand-dark mt-1">{stat.change}</div>
          </div>
        ))}
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-ink-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Recent Orders</h2>
          <a href="/admin/orders" className="text-xs text-brand-dark font-medium hover:underline flex items-center gap-1">
            View all <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-6">
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Client</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Service</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Status</th>
                <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Amount</th>
                <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order, i) => (
                <tr key={i} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors cursor-pointer">
                  <td className="px-5 py-3 font-medium text-ink">{order.client}</td>
                  <td className="px-5 py-3 text-ink-3">{order.service}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColors[order.status] || ''}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-ink-2 font-medium">{order.amount}</td>
                  <td className="px-5 py-3 text-right text-ink-4">{order.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
