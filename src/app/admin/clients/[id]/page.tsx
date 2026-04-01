'use client'

import { useState } from 'react'
import Link from 'next/link'
import { use } from 'react'
import {
  ArrowLeft, Building2, Palette, Target, Users, BarChart3,
  Megaphone, Trophy, Globe, Calendar, Eye, ShoppingBag
} from 'lucide-react'

const mockClient = {
  id: '1',
  name: 'Casa Priya',
  industry: 'Restaurant & Hospitality',
  status: 'Active' as const,
  memberSince: 'January 15, 2024',
  initials: 'CP',

  // Business Info
  businessName: 'Casa Priya',
  businessType: 'Restaurant',
  website: 'casapriya.com',
  location: 'Austin, TX',
  description: 'Modern Indian restaurant in downtown Austin specializing in contemporary takes on traditional cuisine. Known for their tasting menu and craft cocktail program. Two locations with a third opening Q3 2024.',
  yearsInBusiness: '3 years',

  // Brand Identity
  brandVoice: ['Warm', 'Refined', 'Inviting'],
  tone: 'Sophisticated but approachable. Think upscale dining that feels like home.',
  doNots: ['No overly casual slang', 'Avoid generic food stock photos', 'Never use Comic Sans or script fonts'],
  colors: [
    { hex: '#8B2252', name: 'Burgundy' },
    { hex: '#F4E8D1', name: 'Cream' },
    { hex: '#2C1810', name: 'Espresso' },
  ],
  fonts: ['Playfair Display (headings)', 'Inter (body)'],
  logoDescription: 'Stylized lotus motif in burgundy with wordmark in Playfair Display',

  // Target Audience
  targetAudience: 'Food-forward professionals aged 28-45 in Austin metro area who dine out 2-3x per week and value culinary experiences over price.',
  ageRange: '28-45',
  audienceLocation: 'Austin, TX metro area',
  audienceInterests: ['Fine Dining', 'Craft Cocktails', 'Local Food Scene', 'Cultural Experiences'],

  // Competitors
  competitors: [
    { name: 'Emmer & Rye', notes: 'Farm-to-table, similar price point' },
    { name: 'Suerte', notes: 'Modern Mexican, strong IG presence' },
    { name: 'Rasa', notes: 'Contemporary Indian, direct competitor' },
  ],

  // Current Marketing
  currentPlatforms: ['Instagram', 'Google Business', 'Facebook'],
  currentEfforts: 'Posting 2-3x/week on Instagram (inconsistent), running Google Ads for reservations. No email marketing in place. Website was last updated 8 months ago.',
  monthlyBudget: '$500-1,000/mo for ads',

  // Goals
  goals: ['Grow Instagram following from 2.4k to 10k by end of 2024', 'Launch email newsletter with 500+ subscribers', 'Drive 20% more weeknight reservations through social', 'Build brand awareness for new location opening'],

  // Active Services
  activeServices: [
    { name: 'Social Media Growth Package', price: '$449/mo', status: 'Active' },
    { name: 'Email Campaign Setup', price: '$199 (one-time)', status: 'Completed' },
  ],
}

const orders = [
  { id: '1', orderNumber: 'APN-2024-001', service: 'Social Media Growth Package', status: 'In Progress', amount: '$449/mo', date: 'Mar 22, 2024' },
  { id: '4', orderNumber: 'APN-2024-004', service: 'Email Campaign Setup', status: 'Completed', amount: '$199', date: 'Mar 19, 2024' },
]

const statusColors: Record<string, string> = {
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Completed': 'bg-green-50 text-green-700 border-green-200',
  'Active': 'bg-green-50 text-green-700 border-green-200',
  'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
}

type Tab = 'overview' | 'orders' | 'deliverables' | 'messages'

const tabItems: Array<{ label: string; value: Tab }> = [
  { label: 'Overview', value: 'overview' },
  { label: 'Orders', value: 'orders' },
  { label: 'Deliverables', value: 'deliverables' },
  { label: 'Messages', value: 'messages' },
]

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/admin/clients" className="text-ink-4 hover:text-ink transition-colors mt-1.5">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center">
              <span className="text-brand-dark text-base font-bold">{mockClient.initials}</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">{mockClient.name}</h1>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-green-700">{mockClient.status}</span>
                </span>
              </div>
              <p className="text-ink-3 text-sm">{mockClient.industry} &middot; Member since {mockClient.memberSince}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-ink-6">
        {tabItems.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.value
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-4 hover:text-ink-2'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'overview' && (
            <>
              {/* Business Info */}
              <div className="bg-white rounded-xl border border-ink-6 p-5">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-ink-4" /> Business Info
                </h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Business Name</div>
                    <div className="text-ink font-medium">{mockClient.businessName}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Type</div>
                    <div className="text-ink">{mockClient.businessType}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Website</div>
                    <div className="text-brand-dark">{mockClient.website}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Location</div>
                    <div className="text-ink">{mockClient.location}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Years in Business</div>
                    <div className="text-ink">{mockClient.yearsInBusiness}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Description</div>
                  <div className="text-sm text-ink leading-relaxed">{mockClient.description}</div>
                </div>
              </div>

              {/* Brand Identity */}
              <div className="bg-white rounded-xl border border-ink-6 p-5">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-ink-4" /> Brand Identity
                </h2>
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-2">Brand Voice</div>
                    <div className="flex flex-wrap gap-2">
                      {mockClient.brandVoice.map((w) => (
                        <span key={w} className="bg-brand-tint text-brand-dark text-xs font-medium px-3 py-1 rounded-full">{w}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Tone</div>
                    <div className="text-sm text-ink">{mockClient.tone}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Do-Nots</div>
                    <ul className="text-sm text-ink-3 list-disc ml-4 space-y-0.5">
                      {mockClient.doNots.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-2">Brand Colors</div>
                    <div className="flex gap-3">
                      {mockClient.colors.map((c) => (
                        <div key={c.hex} className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg border border-ink-6" style={{ backgroundColor: c.hex }} />
                          <div>
                            <div className="text-xs font-medium text-ink">{c.name}</div>
                            <div className="text-[10px] text-ink-4 font-mono">{c.hex}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Fonts</div>
                    <div className="text-sm text-ink">{mockClient.fonts.join(', ')}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Logo</div>
                    <div className="text-sm text-ink">{mockClient.logoDescription}</div>
                  </div>
                </div>
              </div>

              {/* Target Audience */}
              <div className="bg-white rounded-xl border border-ink-6 p-5">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-ink-4" /> Target Audience
                </h2>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Description</div>
                    <div className="text-ink">{mockClient.targetAudience}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Age Range</div>
                      <div className="text-ink">{mockClient.ageRange}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Location</div>
                      <div className="text-ink">{mockClient.audienceLocation}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-2">Interests</div>
                    <div className="flex flex-wrap gap-2">
                      {mockClient.audienceInterests.map((i) => (
                        <span key={i} className="bg-bg-2 text-ink-2 text-xs font-medium px-3 py-1 rounded-full border border-ink-6">{i}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Competitors */}
              <div className="bg-white rounded-xl border border-ink-6 p-5">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-ink-4" /> Competitors
                </h2>
                <div className="space-y-2">
                  {mockClient.competitors.map((c) => (
                    <div key={c.name} className="flex items-center justify-between bg-bg-2 rounded-lg px-4 py-3">
                      <span className="text-sm font-medium text-ink">{c.name}</span>
                      <span className="text-xs text-ink-3">{c.notes}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Current Marketing */}
              <div className="bg-white rounded-xl border border-ink-6 p-5">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-ink-4" /> Current Marketing
                </h2>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-2">Active Platforms</div>
                    <div className="flex flex-wrap gap-2">
                      {mockClient.currentPlatforms.map((p) => (
                        <span key={p} className="bg-bg-2 text-ink-2 text-xs font-medium px-3 py-1 rounded-full border border-ink-6">{p}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Current Efforts</div>
                    <div className="text-ink">{mockClient.currentEfforts}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Monthly Ad Budget</div>
                    <div className="text-ink font-medium">{mockClient.monthlyBudget}</div>
                  </div>
                </div>
              </div>

              {/* Goals */}
              <div className="bg-white rounded-xl border border-ink-6 p-5">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-ink-4" /> Goals
                </h2>
                <ul className="space-y-2">
                  {mockClient.goals.map((g, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="w-5 h-5 rounded-full bg-brand-tint text-brand-dark text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-ink">{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {activeTab === 'orders' && (
            <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
              <div className="p-5 border-b border-ink-6">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Order History</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-6">
                      <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Order #</th>
                      <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Service</th>
                      <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Status</th>
                      <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Amount</th>
                      <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Date</th>
                      <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-ink-3">{order.orderNumber}</td>
                        <td className="px-5 py-3 text-ink">{order.service}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColors[order.status] || ''}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-ink">{order.amount}</td>
                        <td className="px-5 py-3 text-right text-ink-4">{order.date}</td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 bg-bg-2 px-2 py-1 rounded-md hover:bg-ink-6 transition-colors"
                          >
                            <Eye className="w-3 h-3" /> View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'deliverables' && (
            <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
                <ShoppingBag className="w-6 h-6 text-ink-4" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-lg text-ink mb-1">Deliverables</h3>
              <p className="text-sm text-ink-4">Deliverable tracking will be available in a future update.</p>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
                <Globe className="w-6 h-6 text-ink-4" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-lg text-ink mb-1">Messages</h3>
              <p className="text-sm text-ink-4">Client messaging will be available in a future update.</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Active Services */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Active Services</h2>
            <div className="space-y-3">
              {mockClient.activeServices.map((s) => (
                <div key={s.name} className="bg-bg-2 rounded-lg p-3">
                  <div className="text-sm font-medium text-ink">{s.name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-ink-3">{s.price}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[s.status] || ''}`}>
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Info */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Quick Info</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-4">Total Orders</span>
                <span className="font-medium text-ink">{orders.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-4">Monthly Value</span>
                <span className="font-medium text-ink">$449</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-4">Member Since</span>
                <span className="font-medium text-ink">Jan 2024</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-4">Industry</span>
                <span className="font-medium text-ink">{mockClient.industry}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
