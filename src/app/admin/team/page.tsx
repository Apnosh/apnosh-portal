'use client'

import { useState, useEffect } from 'react'
import { Users, Package, Activity, UserPlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ── Types ────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'team_member'
  avatar_url: string | null
  created_at: string
  workload: number      // count of non-completed deliverables
  recentActivity: number // activity count in last 7 days
}

interface Stats {
  totalMembers: number
  activeMembers: number
  avgDeliverables: number
}

// ── Helpers ──────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return '??'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function roleBadge(role: string) {
  if (role === 'admin') return 'bg-purple-50 text-purple-700'
  return 'bg-blue-50 text-blue-700'
}

function roleLabel(role: string) {
  if (role === 'admin') return 'Admin'
  return 'Team Member'
}

// ── Skeleton Components ──────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-ink-6 mb-3" />
      <div className="h-7 w-12 bg-ink-6 rounded" />
      <div className="h-3 w-20 bg-ink-6 rounded mt-2" />
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-ink-6" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-28 bg-ink-6 rounded" />
          <div className="h-3 w-20 bg-ink-6 rounded" />
          <div className="h-3 w-36 bg-ink-6 rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-24 bg-ink-6 rounded" />
        <div className="h-2 bg-ink-6 rounded-full" />
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'team_member' })

  useEffect(() => {
    async function fetchTeam() {
      try {
        const supabase = createClient()

        // 1. Fetch team profiles
        const { data: profiles, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url, created_at')
          .in('role', ['admin', 'team_member'])
          .order('full_name')

        if (profilesErr) throw profilesErr
        if (!profiles || profiles.length === 0) {
          setMembers([])
          setStats({ totalMembers: 0, activeMembers: 0, avgDeliverables: 0 })
          setLoading(false)
          return
        }

        const profileIds = profiles.map((p) => p.id)

        // 2. Fetch open deliverables (work_briefs not completed) per team member
        const { data: briefs, error: briefsErr } = await supabase
          .from('work_briefs')
          .select('assigned_to')
          .in('assigned_to', profileIds)
          .neq('status', 'completed')

        if (briefsErr) throw briefsErr

        const workloadMap: Record<string, number> = {}
        for (const b of briefs ?? []) {
          workloadMap[b.assigned_to] = (workloadMap[b.assigned_to] || 0) + 1
        }

        // 3. Fetch recent activity (last 7 days) per team member
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        const since = sevenDaysAgo.toISOString()

        const { data: activityRows, error: activityErr } = await supabase
          .from('client_activity_log')
          .select('performed_by')
          .in('performed_by', profileIds)
          .gte('created_at', since)

        if (activityErr) throw activityErr

        const activityMap: Record<string, number> = {}
        for (const a of activityRows ?? []) {
          activityMap[a.performed_by] = (activityMap[a.performed_by] || 0) + 1
        }

        // 4. Assemble team members
        const assembled: TeamMember[] = profiles.map((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          role: p.role as 'admin' | 'team_member',
          avatar_url: p.avatar_url,
          created_at: p.created_at,
          workload: workloadMap[p.id] || 0,
          recentActivity: activityMap[p.id] || 0,
        }))

        // 5. Compute stats
        const totalMembers = assembled.length
        const activeMembers = assembled.filter((m) => m.recentActivity > 0).length
        const totalDeliverables = assembled.reduce((sum, m) => sum + m.workload, 0)
        const avgDeliverables = totalMembers > 0 ? Math.round((totalDeliverables / totalMembers) * 10) / 10 : 0

        setMembers(assembled)
        setStats({ totalMembers, activeMembers, avgDeliverables })
      } catch (err: unknown) {
        console.error('Failed to load team data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load team data')
      } finally {
        setLoading(false)
      }
    }

    fetchTeam()
  }, [])

  // ── Stat cards config ──────────────────────────────────────────────
  const statCards = stats
    ? [
        { label: 'Total Members', value: String(stats.totalMembers), icon: Users, color: 'bg-brand-tint text-brand-dark' },
        { label: 'Active (7 days)', value: String(stats.activeMembers), icon: Activity, color: 'bg-blue-50 text-blue-600' },
        { label: 'Avg Deliverables', value: String(stats.avgDeliverables), icon: Package, color: 'bg-purple-50 text-purple-600' },
      ]
    : []

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Team Management</h1>
          <p className="text-ink-3 text-sm mt-1">Manage your team members and track workload.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-2 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Invite Team Member
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <StatSkeleton key={i} />)
          : statCards.map((stat) => (
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
        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
            <Users className="w-10 h-10 text-ink-4 mx-auto mb-3" />
            <p className="text-ink-3 text-sm">No team members found.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {members.map((member) => {
              const loadColor =
                member.workload >= 8 ? 'text-red-600' : member.workload >= 5 ? 'text-amber-600' : 'text-green-600'

              return (
                <div key={member.id} className="bg-white rounded-xl border border-ink-6 p-5 hover:shadow-sm transition-shadow">
                  {/* Top: avatar + info */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-brand-tint border border-brand/20 flex items-center justify-center text-brand-dark text-sm font-bold flex-shrink-0">
                      {getInitials(member.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-ink truncate">{member.full_name}</h3>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadge(member.role)}`}>
                          {roleLabel(member.role)}
                        </span>
                      </div>
                      <p className="text-ink-3 text-sm mt-0.5 truncate">{member.email}</p>
                    </div>
                  </div>

                  {/* Workload + Activity */}
                  <div className="mt-4 flex items-center gap-4">
                    <div className="flex-1">
                      <span className="text-[11px] font-medium text-ink-4">Open Deliverables</span>
                      <p className={`text-lg font-semibold ${loadColor}`}>{member.workload}</p>
                    </div>
                    <div className="flex-1">
                      <span className="text-[11px] font-medium text-ink-4">Activity (7d)</span>
                      <p className="text-lg font-semibold text-ink">{member.recentActivity}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-ink-6 p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-[family-name:var(--font-display)] text-lg text-ink">Invite Team Member</h3>
              <button onClick={() => setShowInvite(false)} className="text-ink-4 hover:text-ink transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-ink-3 text-sm block mb-1">Full Name</label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="text-ink-3 text-sm block mb-1">Email</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label className="text-ink-3 text-sm block mb-1">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                >
                  <option value="team_member">Team Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700 font-medium">Coming Soon</p>
              <p className="text-xs text-amber-600 mt-0.5">Team invitations will be available in a future update.</p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowInvite(false)}
                className="text-sm font-medium text-ink-3 px-4 py-2 rounded-lg hover:bg-ink-6 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled
                className="bg-brand/50 text-white text-sm font-medium rounded-lg px-4 py-2 cursor-not-allowed"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
