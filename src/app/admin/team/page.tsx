'use client'

import { useState } from 'react'
import {
  Users, FolderKanban, Package, Clock, Eye,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────

type MemberStatus = 'Available' | 'Busy' | 'On Leave'

interface TeamMember {
  name: string
  initials: string
  role: string
  status: MemberStatus
  color: string
  workload: { current: number; max: number }
  projects: { client: string; title: string }[]
}

// ── Mock Data ────────────────────────────────────────────────────────

const teamMembers: TeamMember[] = [
  {
    name: 'Sarah K.',
    initials: 'SK',
    role: 'Senior Designer',
    status: 'Busy',
    color: 'bg-rose-100 text-rose-700',
    workload: { current: 6, max: 8 },
    projects: [
      { client: 'Lumina Boutique', title: 'Homepage Mockup' },
      { client: 'Casa Priya', title: 'Instagram Feed Posts' },
      { client: 'Golden Wok', title: 'Story Templates' },
    ],
  },
  {
    name: 'Mike R.',
    initials: 'MR',
    role: 'Content Writer',
    status: 'Available',
    color: 'bg-blue-100 text-blue-700',
    workload: { current: 4, max: 8 },
    projects: [
      { client: 'Vesta Bakery', title: 'Blog Post Series' },
      { client: 'Peak Fitness', title: 'Email Newsletter' },
    ],
  },
  {
    name: 'Alex T.',
    initials: 'AT',
    role: 'Brand Strategist',
    status: 'Busy',
    color: 'bg-violet-100 text-violet-700',
    workload: { current: 7, max: 8 },
    projects: [
      { client: 'Vesta Bakery', title: 'Brand Guidelines PDF' },
      { client: 'Peak Fitness', title: 'Landing Page Redesign' },
      { client: 'Bloom Studio', title: 'Logo Concepts v2' },
    ],
  },
  {
    name: 'Jordan L.',
    initials: 'JL',
    role: 'Video Producer',
    status: 'Available',
    color: 'bg-amber-100 text-amber-700',
    workload: { current: 3, max: 8 },
    projects: [
      { client: 'Casa Priya', title: 'Product Launch Video' },
      { client: 'Vesta Bakery', title: 'TikTok Reel Batch' },
    ],
  },
]

const stats = [
  { label: 'Total Members', value: '4', icon: Users, color: 'bg-brand-tint text-brand-dark' },
  { label: 'Active Projects', value: '16', icon: FolderKanban, color: 'bg-blue-50 text-blue-600' },
  { label: 'Avg Deliverables/Week', value: '12.5', icon: Package, color: 'bg-purple-50 text-purple-600' },
  { label: 'On-Time Rate', value: '94%', icon: Clock, color: 'bg-amber-50 text-amber-600' },
]

const statusStyles: Record<MemberStatus, { dot: string; text: string; bg: string }> = {
  Available: { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' },
  Busy: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  'On Leave': { dot: 'bg-ink-4', text: 'text-ink-4', bg: 'bg-ink-6' },
}

// ── Component ────────────────────────────────────────────────────────

export default function TeamPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Team Management</h1>
        <p className="text-ink-3 text-sm mt-1">Manage your team members and track workload.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-4 hover:shadow-sm transition-shadow">
            <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{stat.value}</div>
            <div className="text-xs text-ink-4 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Team Grid */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Team Members</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {teamMembers.map((member) => {
            const s = statusStyles[member.status]
            const loadPercent = Math.round((member.workload.current / member.workload.max) * 100)
            const loadColor = loadPercent >= 85 ? 'bg-red-500' : loadPercent >= 60 ? 'bg-amber-500' : 'bg-brand'

            return (
              <div key={member.name} className="bg-white rounded-xl border border-ink-6 p-5 hover:shadow-sm transition-shadow">
                {/* Top section: avatar + info */}
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full ${member.color} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-sm font-bold">{member.initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink">{member.name}</h3>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {member.status}
                      </span>
                    </div>
                    <p className="text-xs text-ink-3 mt-0.5">{member.role}</p>
                  </div>
                </div>

                {/* Workload bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-ink-4">Workload</span>
                    <span className="text-[11px] font-semibold text-ink-2">{member.workload.current}/{member.workload.max} slots</span>
                  </div>
                  <div className="h-2 bg-ink-6 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${loadColor} rounded-full transition-all`}
                      style={{ width: `${loadPercent}%` }}
                    />
                  </div>
                </div>

                {/* Active Projects */}
                <div className="mt-4">
                  <span className="text-[11px] font-medium text-ink-4">Active Projects</span>
                  <div className="mt-1.5 space-y-1.5">
                    {member.projects.map((proj, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-bg-2 rounded-lg">
                        <FolderKanban className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-ink truncate">{proj.title}</p>
                          <p className="text-[11px] text-ink-4">{proj.client}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* View Profile Button */}
                <button className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-3 bg-bg-2 rounded-lg hover:bg-ink-6 hover:text-ink transition-colors">
                  <Eye className="w-3.5 h-3.5" />
                  View Profile
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
