'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CreditCard, Calendar, ArrowUpRight, Settings, Download,
  CheckCircle, Clock, XCircle, Zap, Globe, Server
} from 'lucide-react'

const activePlan = {
  name: 'Growth Plan',
  price: 647,
  nextBilling: 'April 15, 2026',
  status: 'active' as const,
}

const subscriptions = [
  {
    id: '1',
    name: 'Social Media Growth',
    icon: Zap,
    price: 449,
    started: 'Jan 15, 2026',
    nextRenewal: 'Apr 15, 2026',
    color: 'bg-brand-tint text-brand-dark',
  },
  {
    id: '2',
    name: 'Local SEO',
    icon: Globe,
    price: 149,
    started: 'Feb 1, 2026',
    nextRenewal: 'Apr 1, 2026',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    id: '3',
    name: 'Hosting',
    icon: Server,
    price: 49,
    started: 'Dec 10, 2025',
    nextRenewal: 'Apr 10, 2026',
    color: 'bg-purple-50 text-purple-600',
  },
]

const invoices = [
  { id: 'INV-2026-006', date: 'Mar 15, 2026', description: 'Monthly Services — March', amount: 647, status: 'paid' as const },
  { id: 'INV-2026-005', date: 'Feb 15, 2026', description: 'Monthly Services — February', amount: 647, status: 'paid' as const },
  { id: 'INV-2026-004', date: 'Feb 1, 2026', description: 'Brand Identity Refresh', amount: 1200, status: 'paid' as const },
  { id: 'INV-2026-003', date: 'Jan 15, 2026', description: 'Monthly Services — January', amount: 598, status: 'paid' as const },
  { id: 'INV-2026-002', date: 'Jan 5, 2026', description: 'Website Redesign — Final', amount: 2400, status: 'pending' as const },
  { id: 'INV-2026-001', date: 'Dec 15, 2025', description: 'Monthly Services — December', amount: 498, status: 'failed' as const },
]

const statusConfig = {
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700', icon: Clock },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-600', icon: XCircle },
}

export default function BillingPage() {
  const [plan] = useState(activePlan)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Billing & Subscriptions</h1>
        <p className="text-ink-3 text-sm mt-1">Manage your plan, subscriptions, and payment details.</p>
      </div>

      {/* Current Plan */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center">
              <Zap className="w-6 h-6 text-brand-dark" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">{plan.name}</h2>
                <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {plan.status}
                </span>
              </div>
              <p className="text-sm text-ink-3 mt-0.5">
                <span className="font-medium text-ink">${plan.price}/mo</span> &middot; Next billing {plan.nextBilling}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-2 hover:bg-bg-2 transition-colors">
              Change Plan
            </button>
            <button className="px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Active Subscriptions */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Active Subscriptions</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg ${sub.color} flex items-center justify-center`}>
                  <sub.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  Active
                </span>
              </div>
              <h3 className="text-sm font-medium text-ink">{sub.name}</h3>
              <p className="font-[family-name:var(--font-display)] text-xl text-ink mt-1">${sub.price}<span className="text-sm text-ink-4 font-sans">/mo</span></p>
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
                  <Calendar className="w-3 h-3" /> Started {sub.started}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
                  <Clock className="w-3 h-3" /> Renews {sub.nextRenewal}
                </div>
              </div>
              <button className="w-full mt-4 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-2 hover:bg-bg-2 transition-colors flex items-center justify-center gap-1.5">
                <Settings className="w-3.5 h-3.5" /> Manage
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Payment Method</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-8 rounded-md bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Visa ending in 4242</p>
              <p className="text-[11px] text-ink-4">Expires 12/2028</p>
            </div>
          </div>
          <button className="px-4 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-2 hover:bg-bg-2 transition-colors">
            Update payment method
          </button>
        </div>
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-6 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Billing History</h2>
          <Link href="#" className="text-xs text-brand-dark font-medium hover:underline flex items-center gap-1">
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-6">
                <th className="text-left text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Date</th>
                <th className="text-left text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Description</th>
                <th className="text-right text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Amount</th>
                <th className="text-center text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Status</th>
                <th className="text-right text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-6">
              {invoices.map((inv) => {
                const status = statusConfig[inv.status]
                return (
                  <tr key={inv.id} className="hover:bg-bg-2/50 transition-colors">
                    <td className="px-5 py-3 text-sm text-ink-3 whitespace-nowrap">{inv.date}</td>
                    <td className="px-5 py-3 text-sm text-ink">{inv.description}</td>
                    <td className="px-5 py-3 text-sm text-ink font-medium text-right">${inv.amount.toLocaleString()}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                        <status.icon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button className="text-ink-4 hover:text-brand-dark transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-ink-6">
          {invoices.map((inv) => {
            const status = statusConfig[inv.status]
            return (
              <div key={inv.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{inv.description}</p>
                    <p className="text-[11px] text-ink-4 mt-0.5">{inv.date}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                    <status.icon className="w-3 h-3" />
                    {status.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">${inv.amount.toLocaleString()}</span>
                  <button className="text-ink-4 hover:text-brand-dark transition-colors flex items-center gap-1 text-[11px]">
                    <Download className="w-3.5 h-3.5" /> Invoice
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
