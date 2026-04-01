'use client'

import { useState } from 'react'
import Link from 'next/link'
import { use } from 'react'
import {
  ArrowLeft, Calendar, DollarSign, User, Building2, Target,
  Palette, FileText, Users, Clock, MessageSquare, CheckCircle2,
  AlertCircle, ChevronDown
} from 'lucide-react'

type Status = 'Pending' | 'Assigned' | 'In Progress' | 'Client Review' | 'Completed'

const statusFlow: Status[] = ['Pending', 'Assigned', 'In Progress', 'Client Review', 'Completed']

const statusColors: Record<Status, string> = {
  'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
  'Assigned': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Client Review': 'bg-purple-50 text-purple-700 border-purple-200',
  'Completed': 'bg-green-50 text-green-700 border-green-200',
}

const teamMembers = [
  { id: '1', name: 'Sarah K.', role: 'Designer' },
  { id: '2', name: 'Mike R.', role: 'Writer' },
  { id: '3', name: 'Alex T.', role: 'Strategist' },
  { id: '4', name: 'Jordan L.', role: 'Video' },
]

const mockOrder = {
  id: '1',
  orderNumber: 'APN-2024-001',
  date: 'March 22, 2024',
  status: 'In Progress' as Status,
  client: {
    name: 'Casa Priya',
    industry: 'Restaurant & Hospitality',
    description: 'Modern Indian restaurant in downtown Austin specializing in contemporary takes on traditional cuisine. Known for their tasting menu and craft cocktail program.',
    brandVoice: ['Warm', 'Refined', 'Inviting'],
    tone: 'Sophisticated but approachable. Think upscale dining that feels like home.',
    doNots: ['No overly casual slang', 'Avoid generic food stock photos', 'Never use Comic Sans or script fonts'],
    targetAudience: 'Food-forward professionals aged 28-45 in Austin metro area who dine out 2-3x per week and value culinary experiences.',
    ageRange: '28-45',
    location: 'Austin, TX metro area',
    competitors: ['Emmer & Rye', 'Suerte', 'Rasa'],
    colors: ['#8B2252', '#F4E8D1', '#2C1810'],
    fonts: ['Playfair Display', 'Inter'],
  },
  service: 'Social Media Growth Package',
  serviceType: 'Subscription',
  amount: '$449/mo',
  quantity: '12 posts/month (8 feed + 4 reels)',
  assignee: 'Sarah K.',
  priority: 'Normal',
}

const contentDirections = [
  'Behind-the-scenes kitchen shots showcasing chef technique and ingredient quality',
  'Plated dish close-ups with warm, moody lighting consistent with restaurant ambiance',
  'Short-form reels: cocktail-making process, tasting menu reveals, chef spotlights',
  'Customer testimonial content capturing authentic dining moments',
]

const platformSpecs = [
  { platform: 'Instagram Feed', dimensions: '1080 x 1350px (4:5)', format: 'JPEG/PNG' },
  { platform: 'Instagram Reels', dimensions: '1080 x 1920px (9:16)', format: 'MP4, 15-90s' },
  { platform: 'Stories', dimensions: '1080 x 1920px (9:16)', format: 'JPEG/PNG/MP4' },
]

const timeline = [
  { date: 'Mar 22, 10:14 AM', event: 'Order placed by Casa Priya', icon: FileText, color: 'text-ink-3' },
  { date: 'Mar 22, 11:30 AM', event: 'Auto-brief generated', icon: FileText, color: 'text-brand-dark' },
  { date: 'Mar 22, 2:00 PM', event: 'Assigned to Sarah K. (Designer)', icon: User, color: 'text-indigo-600' },
  { date: 'Mar 23, 9:15 AM', event: 'Work started - content calendar drafted', icon: Clock, color: 'text-blue-600' },
  { date: 'Mar 24, 4:45 PM', event: 'First batch (4 posts) uploaded for review', icon: CheckCircle2, color: 'text-green-600' },
]

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [status, setStatus] = useState<Status>(mockOrder.status)
  const [assignee, setAssignee] = useState(mockOrder.assignee)
  const [priority, setPriority] = useState(mockOrder.priority)
  const [notes, setNotes] = useState('')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/orders" className="text-ink-4 hover:text-ink transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">{mockOrder.orderNumber}</h1>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColors[status]}`}>
              {status}
            </span>
          </div>
          <p className="text-ink-3 text-sm mt-0.5">{mockOrder.client.name} &mdash; {mockOrder.service}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Order Info Card */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Order Info</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Order #</div>
                <div className="text-sm font-medium text-ink font-mono">{mockOrder.orderNumber}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Date</div>
                <div className="text-sm text-ink flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-ink-4" />{mockOrder.date}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Status</div>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                    className="text-sm font-medium border border-ink-6 rounded-lg px-3 py-1.5 pr-8 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 w-full"
                  >
                    {statusFlow.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4 pointer-events-none" />
                </div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Client</div>
                <div className="text-sm font-medium text-ink flex items-center gap-1"><User className="w-3.5 h-3.5 text-ink-4" />{mockOrder.client.name}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Service</div>
                <div className="text-sm text-ink">{mockOrder.service}</div>
              </div>
              <div>
                <div className="text-[11px] text-ink-4 uppercase tracking-wide mb-1">Amount</div>
                <div className="text-sm font-medium text-ink flex items-center gap-1"><DollarSign className="w-3.5 h-3.5 text-ink-4" />{mockOrder.amount}</div>
              </div>
            </div>
          </div>

          {/* Client Context Card */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-ink-4" /> Client Context
            </h2>
            <div className="space-y-5">
              <div>
                <div className="text-xs font-medium text-ink-3 mb-2">Business</div>
                <div className="bg-bg-2 rounded-lg p-3 space-y-1.5 text-sm">
                  <div><span className="text-ink-4">Name:</span> <span className="text-ink font-medium">{mockOrder.client.name}</span></div>
                  <div><span className="text-ink-4">Industry:</span> <span className="text-ink">{mockOrder.client.industry}</span></div>
                  <div><span className="text-ink-4">Description:</span> <span className="text-ink">{mockOrder.client.description}</span></div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-ink-3 mb-2">Brand Voice</div>
                <div className="bg-bg-2 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-ink-4">Keywords:</span>
                    {mockOrder.client.brandVoice.map((w) => (
                      <span key={w} className="bg-brand-tint text-brand-dark text-[11px] font-medium px-2 py-0.5 rounded-full">{w}</span>
                    ))}
                  </div>
                  <div><span className="text-ink-4">Tone:</span> <span className="text-ink">{mockOrder.client.tone}</span></div>
                  <div>
                    <span className="text-ink-4">Do Nots:</span>
                    <ul className="mt-1 ml-4 list-disc text-ink-3 space-y-0.5">
                      {mockOrder.client.doNots.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-ink-3 mb-2">Target Audience</div>
                <div className="bg-bg-2 rounded-lg p-3 space-y-1.5 text-sm">
                  <div><span className="text-ink-4">Description:</span> <span className="text-ink">{mockOrder.client.targetAudience}</span></div>
                  <div><span className="text-ink-4">Age Range:</span> <span className="text-ink">{mockOrder.client.ageRange}</span></div>
                  <div><span className="text-ink-4">Location:</span> <span className="text-ink">{mockOrder.client.location}</span></div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-ink-3 mb-2">Competitors</div>
                <div className="flex flex-wrap gap-2">
                  {mockOrder.client.competitors.map((c) => (
                    <span key={c} className="bg-bg-2 text-ink-2 text-xs font-medium px-3 py-1 rounded-full border border-ink-6">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Work Brief Card */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-ink-4" /> Auto-Generated Work Brief
            </h2>
            <div className="space-y-5">
              <div>
                <div className="text-xs font-medium text-ink-3 mb-2">Service & Quantity</div>
                <div className="bg-bg-2 rounded-lg p-3 text-sm text-ink">
                  <span className="font-medium">{mockOrder.service}</span> &mdash; {mockOrder.quantity}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-ink-3 mb-2">Content Direction Suggestions</div>
                <ul className="bg-bg-2 rounded-lg p-3 space-y-2 text-sm text-ink">
                  {contentDirections.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-tint text-brand-dark text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium text-ink-3 mb-2">Platform Specs</div>
                <div className="bg-bg-2 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-6">
                        <th className="text-left text-xs font-medium text-ink-4 px-3 py-2">Platform</th>
                        <th className="text-left text-xs font-medium text-ink-4 px-3 py-2">Dimensions</th>
                        <th className="text-left text-xs font-medium text-ink-4 px-3 py-2">Format</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platformSpecs.map((spec) => (
                        <tr key={spec.platform} className="border-b border-ink-6 last:border-0">
                          <td className="px-3 py-2 font-medium text-ink">{spec.platform}</td>
                          <td className="px-3 py-2 text-ink-3 font-mono text-xs">{spec.dimensions}</td>
                          <td className="px-3 py-2 text-ink-3">{spec.format}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-ink-3 mb-2">Brand Assets Reference</div>
                <div className="bg-bg-2 rounded-lg p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-ink-4">Colors:</span>
                    {mockOrder.client.colors.map((c) => (
                      <span key={c} className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded border border-ink-6" style={{ backgroundColor: c }} />
                        <span className="text-xs text-ink-3 font-mono">{c}</span>
                      </span>
                    ))}
                  </div>
                  <div><span className="text-ink-4">Fonts:</span> <span className="text-ink">{mockOrder.client.fonts.join(', ')}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-ink-3 mb-2">Deadline</div>
                  <div className="bg-bg-2 rounded-lg p-3 text-sm text-ink flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-ink-4" /> April 1, 2024 (first batch)
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-ink-3 mb-2">Special Instructions</div>
                  <div className="bg-bg-2 rounded-lg p-3 text-sm text-ink">
                    Feature the new spring tasting menu in at least 3 posts. Use warm, candlelit aesthetic.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-ink-4" /> Timeline
            </h2>
            <div className="space-y-0">
              {timeline.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 relative">
                  {i < timeline.length - 1 && (
                    <div className="absolute left-[11px] top-7 bottom-0 w-px bg-ink-6" />
                  )}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    i === timeline.length - 1 ? 'bg-green-50' : 'bg-bg-2'
                  }`}>
                    <entry.icon className={`w-3 h-3 ${entry.color}`} />
                  </div>
                  <div className="flex-1 pb-5">
                    <div className="text-sm text-ink">{entry.event}</div>
                    <div className="text-[11px] text-ink-4 mt-0.5">{entry.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Assignment */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-ink-4" /> Assignment
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-ink-4 uppercase tracking-wide block mb-1.5">Assign To</label>
                <div className="relative">
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 pr-8 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.name}>{m.name} - {m.role}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-ink-4 uppercase tracking-wide block mb-1.5">Priority</label>
                <div className="relative">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 pr-8 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    {['Low', 'Normal', 'High', 'Urgent'].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-ink-4 uppercase tracking-wide block mb-1.5">Internal Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add internal notes..."
                  rows={4}
                  className="w-full text-sm border border-ink-6 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <button className="w-full bg-ink text-white text-sm font-medium py-2.5 rounded-lg hover:bg-ink-2 transition-colors">
                Save Changes
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <button className="w-full flex items-center gap-2 text-sm text-ink-2 px-3 py-2 rounded-lg hover:bg-bg-2 transition-colors text-left">
                <MessageSquare className="w-4 h-4 text-ink-4" /> Message Client
              </button>
              <button className="w-full flex items-center gap-2 text-sm text-ink-2 px-3 py-2 rounded-lg hover:bg-bg-2 transition-colors text-left">
                <FileText className="w-4 h-4 text-ink-4" /> Upload Deliverable
              </button>
              <button className="w-full flex items-center gap-2 text-sm text-ink-2 px-3 py-2 rounded-lg hover:bg-bg-2 transition-colors text-left">
                <AlertCircle className="w-4 h-4 text-ink-4" /> Flag Issue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
