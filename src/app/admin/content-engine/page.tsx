'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkles, ChevronRight, Filter, Clock, CheckCircle, AlertCircle,
  FileText, Palette, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/supabase/hooks'

type CycleStatus =
  | 'not_started' | 'context_ready' | 'calendar_draft'
  | 'calendar_approved' | 'briefs_draft' | 'briefs_approved'
  | 'in_production' | 'complete'

interface ClientCycle {
  clientId: string
  clientName: string
  clientSlug: string
  industry: string | null
  tier: string | null
  allotments: {
    social_posts_per_month?: number
  } | null
  platforms: string[]
  cycleId: string | null
  status: CycleStatus
  assignedTo: string | null
  updatedAt: string | null
  clientRequests: unknown[] | null
}

const STATUS_CONFIG: Record<CycleStatus, { label: string; color: string; icon: typeof Clock }> = {
  not_started: { label: 'Not started', color: 'bg-ink-6 text-ink-3', icon: Clock },
  context_ready: { label: 'Context loaded', color: 'bg-blue-50 text-blue-700', icon: FileText },
  calendar_draft: { label: 'Calendar draft', color: 'bg-amber-50 text-amber-700', icon: Palette },
  calendar_approved: { label: 'Calendar approved', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  briefs_draft: { label: 'Briefs in progress', color: 'bg-amber-50 text-amber-700', icon: FileText },
  briefs_approved: { label: 'Briefs approved', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  in_production: { label: 'In production', color: 'bg-blue-50 text-blue-700', icon: Sparkles },
  complete: { label: 'Complete', color: 'bg-brand-tint text-brand-dark', icon: CheckCircle },
}

const STATUS_ORDER: CycleStatus[] = [
  'not_started', 'context_ready', 'calendar_draft', 'calendar_approved',
  'briefs_draft', 'briefs_approved', 'in_production', 'complete',
]

export default function ContentEnginePage() {
  const supabase = createClient()
  const { data: user } = useUser()
  const [clients, setClients] = useState<ClientCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const [statusFilter, setStatusFilter] = useState<CycleStatus | 'all'>('all')

  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]

  const load = useCallback(async () => {
    // Fetch all clients with their current month cycle
    const { data: allClients } = await supabase
      .from('clients')
      .select('id, name, slug, industry, tier, allotments, services_active')
      .order('name')

    if (!allClients) { setLoading(false); return }

    // Fetch current month cycles
    const { data: cycles } = await supabase
      .from('content_cycles')
      .select('*')
      .eq('month', currentMonth)

    const cycleMap = new Map(
      (cycles ?? []).map((c) => [c.client_id, c])
    )

    const result: ClientCycle[] = allClients
      .filter((c) => c.services_active?.includes('social'))
      .map((c) => {
        const cycle = cycleMap.get(c.id)
        return {
          clientId: c.id,
          clientName: c.name,
          clientSlug: c.slug,
          industry: c.industry,
          tier: c.tier,
          allotments: c.allotments as ClientCycle['allotments'],
          platforms: Object.keys((c as Record<string, unknown>).socials ?? {}).filter(
            (k) => !!(c as Record<string, unknown>).socials && !!((c as Record<string, unknown>).socials as Record<string, unknown>)[k]
          ),
          cycleId: cycle?.id ?? null,
          status: (cycle?.status as CycleStatus) ?? 'not_started',
          assignedTo: cycle?.assigned_to ?? null,
          updatedAt: cycle?.updated_at ?? null,
          clientRequests: cycle?.client_requests ? (cycle.client_requests as unknown[]) : null,
        }
      })

    // Sort: not_started first, complete last
    result.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

    setClients(result)
    setLoading(false)
  }, [supabase, currentMonth])

  useEffect(() => { load() }, [load])

  const filtered = clients.filter((c) => {
    if (filter === 'mine' && user && c.assignedTo !== user.id) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    return true
  })

  const monthLabel = new Date(currentMonth + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand" />
            Content Engine
          </h1>
          <p className="text-sm text-ink-3 mt-0.5">{monthLabel} content cycles</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex rounded-lg border border-ink-6 overflow-hidden text-sm">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 font-medium transition-colors ${filter === 'all' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}
          >
            All clients
          </button>
          <button
            onClick={() => setFilter('mine')}
            className={`px-3 py-1.5 font-medium transition-colors ${filter === 'mine' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}
          >
            My clients
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CycleStatus | 'all')}
          className="text-sm border border-ink-6 rounded-lg px-3 py-1.5 text-ink-3 bg-white"
        >
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <span className="text-xs text-ink-4 ml-auto">
          {filtered.length} client{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-ink-4" />
        </div>
      )}

      {/* Client list */}
      {!loading && (
        <div className="space-y-2">
          {filtered.map((c) => {
            const config = STATUS_CONFIG[c.status]
            const Icon = config.icon
            const requestCount = c.clientRequests?.length ?? 0

            return (
              <Link
                key={c.clientId}
                href={`/admin/content-engine/${c.clientId}`}
                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-ink-6 hover:border-ink-5 transition-colors group"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-ink flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {c.clientName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink truncate">{c.clientName}</span>
                    {c.tier && (
                      <span className="text-[10px] font-medium text-ink-3 bg-bg-2 px-1.5 py-0.5 rounded">
                        {c.tier}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-3 mt-0.5">
                    {c.allotments?.social_posts_per_month ?? '—'} posts/mo
                    {c.platforms.length > 0 && ` · ${c.platforms.join(', ')}`}
                  </div>
                </div>

                {/* Requests badge */}
                {requestCount > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                    <AlertCircle className="w-3 h-3" />
                    {requestCount} request{requestCount > 1 ? 's' : ''}
                  </div>
                )}

                {/* Status */}
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${config.color}`}>
                  <Icon className="w-3 h-3" />
                  {config.label}
                </div>

                {/* Arrow */}
                <ChevronRight className="w-4 h-4 text-ink-4 group-hover:text-ink transition-colors flex-shrink-0" />
              </Link>
            )
          })}

          {filtered.length === 0 && !loading && (
            <div className="text-center py-16 text-sm text-ink-3">
              No clients match your filters.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
