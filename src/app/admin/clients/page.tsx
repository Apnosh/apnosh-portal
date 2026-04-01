'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Eye, Users } from 'lucide-react'

interface Client {
  id: string
  name: string
  industry: string
  plan: string
  monthlyValue: string
  status: 'Active' | 'Inactive'
  lastActivity: string
  initials: string
}

const clients: Client[] = [
  { id: '1', name: 'Casa Priya', industry: 'Restaurant & Hospitality', plan: 'Social Media Growth', monthlyValue: '$449', status: 'Active', lastActivity: 'Mar 22, 2024', initials: 'CP' },
  { id: '2', name: 'Vesta Bakery', industry: 'Food & Beverage', plan: 'A La Carte', monthlyValue: '$140', status: 'Active', lastActivity: 'Mar 21, 2024', initials: 'VB' },
  { id: '3', name: 'Lumina Boutique', industry: 'Retail & Fashion', plan: 'Website + Social', monthlyValue: '$599', status: 'Active', lastActivity: 'Mar 20, 2024', initials: 'LB' },
  { id: '4', name: 'Peak Fitness', industry: 'Health & Fitness', plan: 'Email Starter', monthlyValue: '$199', status: 'Active', lastActivity: 'Mar 19, 2024', initials: 'PF' },
  { id: '5', name: 'Golden Wok', industry: 'Restaurant & Hospitality', plan: 'Brand Identity', monthlyValue: '$499', status: 'Active', lastActivity: 'Mar 18, 2024', initials: 'GW' },
  { id: '6', name: 'Bloom & Gather', industry: 'Events & Florals', plan: 'Content Calendar', monthlyValue: '$299', status: 'Active', lastActivity: 'Mar 17, 2024', initials: 'BG' },
  { id: '7', name: 'Zara Legal', industry: 'Professional Services', plan: 'LinkedIn Growth', monthlyValue: '$349', status: 'Active', lastActivity: 'Mar 16, 2024', initials: 'ZL' },
  { id: '8', name: 'TrueNorth Realty', industry: 'Real Estate', plan: 'A La Carte', monthlyValue: '$320', status: 'Inactive', lastActivity: 'Mar 10, 2024', initials: 'TR' },
  { id: '9', name: 'Solstice Yoga', industry: 'Health & Wellness', plan: 'Social Media Starter', monthlyValue: '$199', status: 'Active', lastActivity: 'Mar 13, 2024', initials: 'SY' },
  { id: '10', name: 'Atlas Consulting', industry: 'Professional Services', plan: 'Strategy Only', monthlyValue: '$250', status: 'Inactive', lastActivity: 'Mar 5, 2024', initials: 'AC' },
]

export default function AdminClientsPage() {
  const [search, setSearch] = useState('')

  const filtered = clients.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q) || c.plan.toLowerCase().includes(q)
  })

  const activeCount = clients.filter((c) => c.status === 'Active').length
  const totalValue = clients.filter((c) => c.status === 'Active').reduce((sum, c) => sum + parseInt(c.monthlyValue.replace(/[$,]/g, '')), 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Clients</h1>
          <p className="text-ink-3 text-sm mt-1">{activeCount} active clients &middot; ${totalValue.toLocaleString()}/mo total value</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        {/* Search */}
        <div className="p-5 border-b border-ink-6">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-6">
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Client Name</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Industry</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Active Plan</th>
                <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Monthly Value</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Status</th>
                <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Last Activity</th>
                <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-full bg-brand-tint flex items-center justify-center flex-shrink-0">
                        <span className="text-brand-dark text-[11px] font-bold">{client.initials}</span>
                      </div>
                      <span className="font-medium text-ink group-hover:text-brand-dark transition-colors">{client.name}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-ink-3">{client.industry}</td>
                  <td className="px-5 py-3 text-ink-2">{client.plan}</td>
                  <td className="px-5 py-3 text-right font-medium text-ink">{client.monthlyValue}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${client.status === 'Active' ? 'bg-green-500' : 'bg-ink-4'}`} />
                      <span className={`text-xs font-medium ${client.status === 'Active' ? 'text-green-700' : 'text-ink-4'}`}>{client.status}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-ink-4">{client.lastActivity}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 bg-bg-2 px-2 py-1 rounded-md hover:bg-ink-6 transition-colors"
                    >
                      <Eye className="w-3 h-3" /> View Profile
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-ink-4 text-sm">
                    No clients found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
